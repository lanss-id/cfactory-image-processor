import { Worker } from "bullmq";
import sharp from "sharp";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { stat } from "fs/promises";
import prisma from "./db";

const connection = { url: process.env.REDIS_URL || "redis://localhost:6379" };
const RESULT_DIR = join(process.cwd(), "results");

const worker = new Worker<{ imageJobId: string; filePath: string }>(
  "image-processing",
  async (job) => {
    const { imageJobId, filePath } = job.data;
    await prisma.imageJob.update({ where: { id: imageJobId }, data: { status: "PROCESSING" } });
    try {
      const outDir = join(RESULT_DIR, imageJobId);
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      const outputPath = join(outDir, "result.webp");
      await sharp(filePath)
        .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(outputPath);
      const { size } = await stat(outputPath);
      await prisma.imageJob.update({
        where: { id: imageJobId },
        data: { status: "COMPLETED", resultPath: outputPath, resultSize: size },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.imageJob.update({
        where: { id: imageJobId },
        data: { status: "FAILED", errorMessage: msg },
      });
      throw err;
    }
  },
  { connection, concurrency: 3, lockDuration: 30_000 }
);

worker.on("failed", (job, err) => { console.error(`Job ${job?.id} failed:`, err.message); });
worker.on("stalled", (jobId) => { console.warn(`Job ${jobId} stalled, will be reassigned`); });

console.log("Image processing worker started");