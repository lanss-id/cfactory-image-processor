import { describe, it, expect } from "vitest";
import { validateImage, checkMagicBytes } from "../validation";

describe("validateImage", () => {
  it("rejects unsupported MIME types", () => {
    const blob = new Blob(["fake"], { type: "image/gif" });
    const file = new File([blob], "test.gif", { type: "image/gif" });
    expect(validateImage(file).valid).toBe(false);
  });

  it("rejects oversized files with 413", () => {
    const blob = new Blob([new Uint8Array(21 * 1024 * 1024)], { type: "image/jpeg" });
    const file = new File([blob], "big.jpg", { type: "image/jpeg" });
    const r = validateImage(file);
    expect(r.valid).toBe(false);
    expect(r.status).toBe(413);
  });

  it("rejects empty/no file", () => {
    const r = validateImage({ size: 0, type: "", name: "" } as File);
    expect(r.valid).toBe(false);
    expect(r.status).toBe(400);
  });

  it("accepts valid png", () => {
    const blob = new Blob(["test"], { type: "image/png" });
    const file = new File([blob], "test.png", { type: "image/png" });
    expect(validateImage(file).valid).toBe(true);
  });

  it("accepts jpeg", () => {
    const blob = new Blob(["test"], { type: "image/jpeg" });
    const file = new File([blob], "test.jpg", { type: "image/jpeg" });
    expect(validateImage(file).valid).toBe(true);
  });

  it("accepts webp", () => {
    const blob = new Blob(["test"], { type: "image/webp" });
    const file = new File([blob], "test.webp", { type: "image/webp" });
    expect(validateImage(file).valid).toBe(true);
  });
});

describe("checkMagicBytes", () => {
  it("rejects PNG claimed as JPEG", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const blob = new Blob([png], { type: "image/jpeg" });
    const file = new File([blob], "fake.jpg", { type: "image/jpeg" });
    const r = await checkMagicBytes(file);
    expect(r.valid).toBe(false);
  });

  it("passes matching JPEG header", async () => {
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const blob = new Blob([jpeg], { type: "image/jpeg" });
    const file = new File([blob], "test.jpg", { type: "image/jpeg" });
    const r = await checkMagicBytes(file);
    expect(r.valid).toBe(true);
  });

  it("rejects webp claimed as PNG", async () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    const blob = new Blob([webp], { type: "image/png" });
    const file = new File([blob], "fake.png", { type: "image/png" });
    const r = await checkMagicBytes(file);
    expect(r.valid).toBe(false);
  });
});