import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { trimTrailingSlash } from "hono/trailing-slash";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import prisma from "./db";
import { imageQueue } from "./queue";
import { validateImage, checkMagicBytes } from "./validation";
import { saveUpload } from "./upload";

const app = new Hono();
app.use("/*", cors());
app.use(trimTrailingSlash());

// ponytail: session-based auth for /admin/* — login form, cookie, redirect
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
if (!ADMIN_USER || !ADMIN_PASS) {
  throw new Error("ADMIN_USER and ADMIN_PASS env vars required for auth");
}

// simple in-memory session store: true = authenticated
const sessions = new Map<string, boolean>();

app.get("/admin/login", (c) => {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login — cfactory admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #1C1917; color: #fff; font-family: 'Inter', system-ui, sans-serif;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
    }
    form {
      background: #292524; padding: 2rem; border-radius: 8px; width: 320px;
      display: flex; flex-direction: column; gap: 1rem;
    }
    h1 { font-size: 1.25rem; font-weight: 600; text-align: center; color: #EA580C; }
    input {
      background: #1C1917; border: 1px solid #444; color: #fff; padding: 0.625rem 0.75rem;
      border-radius: 6px; font-size: 0.875rem; outline: none;
    }
    input:focus { border-color: #EA580C; }
    button {
      background: #EA580C; color: #fff; border: none; padding: 0.625rem; border-radius: 6px;
      font-size: 0.875rem; font-weight: 600; cursor: pointer;
    }
    button:hover { background: #D24E00; }
    .error { color: #f87171; font-size: 0.8rem; text-align: center; }
  </style>
</head>
<body>
  <form method="post" action="/admin/login">
    <h1>cfactory admin</h1>
    <input type="text" name="username" placeholder="Username" required autocomplete="username">
    <input type="password" name="password" placeholder="Password" required autocomplete="current-password">
    <button type="submit">Masuk</button>
    ${c.req.query("error") ? '<p class="error">Username atau password salah</p>' : ""}
  </form>
</body>
</html>`;
  return c.html(html);
});

app.post("/admin/login", async (c) => {
  const body = await c.req.parseBody();
  const u = body["username"] as string;
  const p = body["password"] as string;
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    const sid = crypto.randomUUID();
    sessions.set(sid, true);
    c.header("Set-Cookie", `admin_sid=${sid}; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=86400`);
    return c.redirect("/admin/queues", 302);
  }
  return c.redirect("/admin/login?error=1", 302);
});

app.use("/admin/*", async (c, next) => {
  // skip login page itself
  if (c.req.path === "/admin/login") return next();
  const cookie = c.req.header("Cookie") || "";
  const match = cookie.match(/admin_sid=([^;]+)/);
  if (!match || !sessions.get(match[1])) {
    return c.redirect("/admin/login", 303);
  }
  await next();
});

const serverAdapter = new HonoAdapter(serveStatic);
createBullBoard({
  queues: [new BullMQAdapter(imageQueue)],
  serverAdapter,
});
serverAdapter.setBasePath("/admin/queues");
app.route("/admin/queues", serverAdapter.registerPlugin());

// Health
app.get("/api/health", (c) => c.json({ ok: true }));

// Upload
app.post("/api/images", async (c) => {
  const body = await c.req.parseBody();
  const file = body["image"] as File;
  if (!file) return c.json({ error: "No file uploaded" }, 400);

  const validation = validateImage(file);
  if (!validation.valid) return c.json({ error: validation.error }, validation.status || 400);

  const magic = await checkMagicBytes(file);
  if (!magic.valid) return c.json({ error: magic.error }, 400);

  const job = await prisma.imageJob.create({
    data: {
      originalName: file.name,
      originalPath: "",
      originalSize: file.size,
      mimeType: file.type,
      status: "PENDING",
    },
  });

  const path = await saveUpload(file, job.id);
  await prisma.imageJob.update({ where: { id: job.id }, data: { originalPath: path } });

  await imageQueue.add("process", { imageJobId: job.id, filePath: path }, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: false,
  });

  return c.json({ jobId: job.id, status: "pending" }, 202);
});

// Status
app.get("/api/images/:jobId/status", async (c) => {
  const job = await prisma.imageJob.findUnique({ where: { id: c.req.param("jobId") } });
  if (!job) return c.json({ error: "not found" }, 404);
  return c.json({
    jobId: job.id,
    status: job.status.toLowerCase(),
    originalSize: job.originalSize,
    resultSize: job.resultSize,
    createdAt: job.createdAt,
    errorMessage: job.errorMessage,
  });
});

// Download
app.get("/api/images/:jobId/download", async (c) => {
  const job = await prisma.imageJob.findUnique({ where: { id: c.req.param("jobId") } });
  if (!job) return c.json({ error: "not found" }, 404);
  if (job.status === "PENDING" || job.status === "PROCESSING")
    return c.json({ error: "Job belum selesai diproses" }, 409);
  if (job.status === "FAILED")
    return c.json({ error: job.errorMessage || "Processing failed" }, 422);

  const file = Bun.file(job.resultPath!);
  return new Response(file, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Disposition": `attachment; filename="${job.originalName.replace(/\.[^.]+$/, "")}.webp"`,
    },
  });
});

// SPA — root only
app.get("/", serveStatic({ path: "./frontend/dist/index.html" }));
app.get("/assets/*", serveStatic({ root: "./frontend/dist" }));

// catch-all: 404 untuk path yg gak dikenal
app.notFound((c) => c.json({ error: "Not Found" }, 404));

export default app;