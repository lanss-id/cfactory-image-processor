import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";

const connection: ConnectionOptions = {
  url: process.env.REDIS_URL || "redis://localhost:6379",
};

export const generationQueue = new Queue("generations", { connection });
