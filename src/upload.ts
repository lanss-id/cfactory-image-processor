import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const UPLOAD_DIR = join(process.cwd(), "uploads");

export async function saveUpload(file: File, jobId: string): Promise<string> {
  await mkdir(join(UPLOAD_DIR, jobId), { recursive: true });
  const ext = file.name.split(".").pop() || "jpg";
  const path = join(UPLOAD_DIR, jobId, `original.${ext}`);
  await writeFile(path, Buffer.from(await file.arrayBuffer()));
  return path;
}