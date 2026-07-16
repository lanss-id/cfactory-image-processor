import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import prisma from "./db";
import { generationQueue } from "./queue";

const app = new Hono();
app.use("/*", cors());

// Health
app.get("/api/health", (c) => c.json({ ok: true }));

// API: submit generation
app.post("/api/generations", async (c) => {
  const { prompt } = await c.req.json<{ prompt: string }>();
  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return c.json({ error: "prompt required" }, 400);
  }
  const gen = await prisma.generation.create({ data: { prompt: prompt.trim() } });
  await generationQueue.add("generate", { generationId: gen.id, prompt: gen.prompt });
  return c.json({ id: gen.id, status: gen.status }, 201);
});

// API: poll status
app.get("/api/generations/:id", async (c) => {
  const id = c.req.param("id");
  const gen = await prisma.generation.findUnique({ where: { id } });
  if (!gen) return c.json({ error: "not found" }, 404);
  return c.json({
    id: gen.id, prompt: gen.prompt, status: gen.status,
    resultUrl: gen.resultUrl, error: gen.error, createdAt: gen.createdAt,
  });
});

// Static SPA
app.get("/", serveStatic({ path: "./frontend/dist/index.html" }));
app.get("/assets/*", serveStatic({ root: "./frontend/dist" }));
app.get("/*", serveStatic({ path: "./frontend/dist/index.html" }));

export default app;
