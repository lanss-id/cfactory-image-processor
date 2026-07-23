import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import prisma from "./db";
import { imageQueue } from "./queue";
import { validateImage, checkMagicBytes } from "./validation";
import { saveUpload } from "./upload";

const app = new Hono();
app.use("/*", cors());

// Bull Board
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

// Static SPA
app.get("/", serveStatic({ path: "./frontend/dist/index.html" }));
app.get("/assets/*", serveStatic({ root: "./frontend/dist" }));
app.get("/*", serveStatic({ path: "./frontend/dist/index.html" }));

export default app;