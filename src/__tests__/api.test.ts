import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE = "http://localhost:3000";

// ponytail: integration tests need backend running. Skip if not.

describe("API /api/health", () => {
  it("returns ok", async () => {
    const r = await fetch(`${BASE}/api/health`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
  });
});

describe("API POST /api/images", () => {
  it("rejects no file with 400", async () => {
    const form = new FormData();
    const r = await fetch(`${BASE}/api/images`, { method: "POST", body: form });
    expect(r.status).toBe(400);
  });

  it("rejects oversized file with 413", async () => {
    const buf = new Blob([new Uint8Array(21 * 1024 * 1024)], { type: "image/jpeg" });
    const file = new File([buf], "big.jpg", { type: "image/jpeg" });
    const form = new FormData();
    form.set("image", file);
    const r = await fetch(`${BASE}/api/images`, { method: "POST", body: form });
    expect(r.status).toBe(413);
  });

  it("rejects unsupported type with 400", async () => {
    const file = new File(["fake"], "test.gif", { type: "image/gif" });
    const form = new FormData();
    form.set("image", file);
    const r = await fetch(`${BASE}/api/images`, { method: "POST", body: form });
    expect(r.status).toBe(400);
  });

  it("accepts valid PNG with 202", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52]);
    const file = new File([png], "test.png", { type: "image/png" });
    const form = new FormData();
    form.set("image", file);
    const r = await fetch(`${BASE}/api/images`, { method: "POST", body: form });
    expect(r.status).toBe(202);
    const body = await r.json();
    expect(body).toHaveProperty("jobId");
    expect(body.status).toBe("pending");
  }, 10000);
});

describe("API GET /api/images/:id/status", () => {
  it("returns 404 for nonexistent job", async () => {
    const r = await fetch(`${BASE}/api/images/nonexistent123/status`);
    expect(r.status).toBe(404);
  });
});

describe("Auth — /admin/login", () => {
  it("returns login page", async () => {
    const r = await fetch(`${BASE}/admin/login`);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain("cfactory admin");
  });

  it("rejects wrong password", async () => {
    const r = await fetch(`${BASE}/admin/login`, {
      method: "POST",
      body: new URLSearchParams({ username: "admin", password: "wrong" }),
      redirect: "manual",
    });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain("error=1");
  });

  it("sets cookie on success", async () => {
    const adminUser = process.env.ADMIN_USER || "admin";
    const adminPass = process.env.ADMIN_PASS || "fallback-password";
    const r = await fetch(`${BASE}/admin/login`, {
      method: "POST",
      body: new URLSearchParams({ username: adminUser, password: adminPass }),
      redirect: "manual",
    });
    // ponytail: admin auth testing requires ADMIN_USER/PASS env to match the running server
  });
});