const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAGIC: Record<string, number[]> = {
  "image/jpeg": [0xFF, 0xD8, 0xFF],
  "image/png": [0x89, 0x50, 0x4E, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

export function validateImage(file: File): { valid: boolean; error?: string; status?: number } {
  if (!file || file.size === 0)
    return { valid: false, error: "No file uploaded", status: 400 };
  if (file.size > 20 * 1024 * 1024)
    return { valid: false, error: "File too large. Max 20MB.", status: 413 };
  if (!ALLOWED_TYPES.includes(file.type))
    return { valid: false, error: `Unsupported type: ${file.type}. Use JPG, PNG, or WebP.`, status: 400 };
  return { valid: true };
}

export async function checkMagicBytes(file: File): Promise<{ valid: boolean; error?: string }> {
  const buf = await file.arrayBuffer();
  const header = new Uint8Array(buf.slice(0, 4));
  const sig = file.type as keyof typeof MAGIC;
  const expected = MAGIC[sig];
  if (!expected) return { valid: false, error: "Unrecognized file format" };
  for (let i = 0; i < expected.length; i++) {
    if (header[i] !== expected[i])
      return { valid: false, error: `File content does not match MIME type (${file.type}). Possible extension spoofing.` };
  }
  return { valid: true };
}