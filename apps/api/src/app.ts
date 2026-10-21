import {
  dashboardSchema,
  healthSchema,
  organizerSchema,
} from "@voix-alumni/contracts";
import { organizerMemberships, type createDatabase } from "@voix-alumni/db";
import { alumni, episodes } from "@voix-alumni/db/schema";
import { desc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import type { auth as authInstance } from "./auth.js";
import { registerLot2Routes, type BusinessEnv } from "./lot2.js";
import { registerLot3Routes } from "./lot3.js";

type Dependencies = {
  auth: typeof authInstance;
  database: ReturnType<typeof createDatabase>;
};

export function createApp({ auth, database }: Dependencies) {
  const app = new Hono<BusinessEnv>();

  app.get("/api/health", (c) =>
    c.json(healthSchema.parse({ status: "ok", service: "voix-alumni-api" })),
  );

  app.get("/api/ready", async (c) => {
    try {
      await database.pool.query("SELECT 1");
      return c.json({ status: "ready" });
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
  });

  app.get("/api/capabilities", (c) =>
    c.json({
      googleOAuth: Boolean(auth.options.socialProviders?.google),
      isolatedE2e: process.env.APP_ENV === "e2e",
    }),
  );

  app.use("/api/auth/*", async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const expectedOrigin = new URL(
        process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:5173",
      ).origin;
      if (c.req.header("origin") !== expectedOrigin)
        return c.json({ error: { code: "INVALID_ORIGIN" } }, 403);
    }
    if (c.req.path !== "/api/auth/sign-out") {
      const current = await auth.api.getSession({ headers: c.req.raw.headers });
      if (current) {
        const [membership] = await database.db
          .select()
          .from(organizerMemberships)
          .where(eq(organizerMemberships.userId, current.user.id));
        if (!membership?.active)
          return c.json({ error: { code: "ACCESS_REVOKED" } }, 403);
      }
    }
    await next();
  });
  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

  app.use("/api/v1/*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: { code: "UNAUTHENTICATED" } }, 401);
    const [membership] = await database.db
      .select()
      .from(organizerMemberships)
      .where(eq(organizerMemberships.userId, session.user.id));
    if (!membership?.active)
      return c.json({ error: { code: "ACCESS_REVOKED" } }, 403);
    c.set("organizer", { user: session.user, role: membership.role });
    await next();
  });

  app.get("/api/v1/me", (c) => {
    const { user, role } = c.get("organizer");
    return c.json(
      organizerSchema.parse({
        id: user.id,
        name: user.name,
        email: user.email,
        role,
      }),
    );
  });

  app.get("/api/v1/dashboard", async (c) => {
    const { role } = c.get("organizer");
    const rows = await database.db
      .select({ episode: episodes, person: alumni })
      .from(episodes)
      .innerJoin(alumni, eq(episodes.alumniId, alumni.id))
      .where(
        role === "PRODUCTION" ? isNotNull(episodes.handedOffAt) : undefined,
      )
      .orderBy(desc(episodes.createdAt))
      .limit(20);
    const items = rows.map(({ episode, person }) => ({
      id: episode.id,
      alumni_name: person.fullName,
      public_number: episode.publicNumber,
      status: episode.status,
    }));
    return c.json(
      dashboardSchema.parse({
        role,
        status: items.length ? "ready" : "empty",
        items,
      }),
    );
  });

  app.get("/api/v1/responsable/overview", (c) =>
    c.get("organizer").role === "RESPONSABLE"
      ? c.json({ status: "empty", items: [] })
      : c.json({ error: { code: "FORBIDDEN" } }, 403),
  );

  app.get("/api/v1/production/overview", (c) =>
    c.get("organizer").role === "PRODUCTION"
      ? c.json({ status: "empty", items: [] })
      : c.json({ error: { code: "FORBIDDEN" } }, 403),
  );

  registerLot2Routes(app, database);
  registerLot3Routes(app, database);

  return app;
}
