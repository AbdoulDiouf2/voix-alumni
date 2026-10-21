import { healthSchema } from "@voix-alumni/contracts";
import { pingDatabase } from "@voix-alumni/db";
import { Hono } from "hono";

export const app = new Hono();

app.get("/api/health", (c) =>
  c.json(healthSchema.parse({ status: "ok", service: "voix-alumni-api" })),
);

app.get("/api/ready", async (c) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return c.json({ status: "unavailable" }, 503);
  try {
    await pingDatabase(databaseUrl);
    return c.json({ status: "ready" });
  } catch {
    return c.json({ status: "unavailable" }, 503);
  }
});
