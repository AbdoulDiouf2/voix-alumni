import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("Lot 0 health endpoints", () => {
  it("returns the shared health contract", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "voix-alumni-api",
    });
  });

  it("reports unavailable readiness without database configuration", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const response = await app.request("/api/ready");
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "unavailable" });
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });
});
