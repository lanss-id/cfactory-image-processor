import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import type { StorageProvider } from "./types";

export class LocalStorageProvider implements StorageProvider {
  constructor(private baseDir: string) {}

  async save(key: string, data: Buffer): Promise<string> {
    const path = join(this.baseDir, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return path;
  }
}