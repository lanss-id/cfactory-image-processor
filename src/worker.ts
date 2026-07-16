import { Worker } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import prisma from "./db";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection: ConnectionOptions = { url: REDIS_URL };

const N9R_URL = "http://localhost:20128/v1/images/generations";
const N9R_KEY = process.env.NINEROUTER_KEY;

async function doGenerate(prompt: string): Promise<string> {
  const res = await fetch(N9R_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${N9R_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "ag/gemini-3.1-flash-image",
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    }),
  });
  const data = await res.json() as { data?: Array<{ url?: string; b64_json?: string }> };
  if (!data.data?.[0]) throw new Error("no image in response");
  const img = data.data[0];
  if (img.url) return img.url;
  if (img.b64_json) {
    // Convert b64 to data URL inline
    return `data:image/png;base64,${img.b64_json}`;
  }
  throw new Error("no image data");
}

new Worker<{ generationId: string; prompt: string }>(
  "generations",
  async job => {
    const { generationId, prompt } = job.data;

    await prisma.generation.update({ where: { id: generationId }, data: { status: "processing" } });

    const resultUrl = await doGenerate(prompt);

    await prisma.generation.update({ where: { id: generationId }, data: { status: "completed", resultUrl } });
  },
  { connection, concurrency: 1, attempts: 2, backoff: { type: "exponential", delay: 5000 } }
);

console.log("9Router Worker started");
