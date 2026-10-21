import { randomUUID } from "node:crypto";
import {
  account,
  organizerMemberships,
  securityEvents,
  session,
  user,
} from "@voix-alumni/db/schema";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { auth, configuredGoogleProvider, database } from "./auth.js";

const app = createApp({ auth, database });
const origin = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:5173";
const password = `V0ix-${randomUUID()}-Compte!`;
const fixtures = [
  {
    id: randomUUID(),
    email: `lot1-responsable-${randomUUID()}@example.invalid`,
    role: "RESPONSABLE" as const,
  },
  {
    id: randomUUID(),
    email: `lot1-production-${randomUUID()}@example.invalid`,
    role: "PRODUCTION" as const,
  },
];

async function request(path: string, init: RequestInit = {}) {
  return app.request(
    new Request(new URL(path, origin), {
      ...init,
      headers: { origin, ...init.headers },
    }),
  );
}

async function login(email: string) {
  const response = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toContain("better-auth.session_token");
  return cookie!.split(";")[0];
}

beforeAll(async () => {
  for (const fixture of fixtures) {
    await database.db
      .insert(user)
      .values({ id: fixture.id, name: fixture.role, email: fixture.email });
    await database.db.insert(account).values({
      id: randomUUID(),
      accountId: fixture.id,
      providerId: "credential",
      userId: fixture.id,
      password: await hashPassword(password),
    });
    await database.db
      .insert(organizerMemberships)
      .values({ userId: fixture.id, role: fixture.role });
  }
});

afterAll(async () => {
  for (const fixture of fixtures) {
    await database.db
      .delete(securityEvents)
      .where(eq(securityEvents.userId, fixture.id));
    await database.db
      .delete(organizerMemberships)
      .where(eq(organizerMemberships.userId, fixture.id));
    await database.db.delete(user).where(eq(user.id, fixture.id));
  }
  await database.pool.end();
});

describe("Lot 1 authentication and authorization", () => {
  it("keeps health public but protects organizer routes", async () => {
    expect((await request("/api/health")).status).toBe(200);
    expect((await request("/api/ready")).status).toBe(200);
    expect((await request("/api/v1/me")).status).toBe(401);
    expect((await request("/api/v1/dashboard")).status).toBe(401);
  });

  it("rejects public email signup without creating a user", async () => {
    const email = `outsider-${randomUUID()}@example.invalid`;
    const response = await request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, name: "Outsider", password }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(
      await database.db.select().from(user).where(eq(user.email, email)),
    ).toHaveLength(0);
  });

  it("rejects unconfigured Google OAuth and retains closed signup configuration", async () => {
    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
    expect(auth.options.account?.accountLinking?.disableImplicitLinking).toBe(
      true,
    );
    expect(
      configuredGoogleProvider("test-client", "test-secret"),
    ).toMatchObject({
      disableSignUp: true,
      disableImplicitSignUp: true,
      requireEmailVerification: true,
    });
    const response = await request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects an unknown Google identity before account creation", async () => {
    const validate = auth.options.user?.validateUserInfo as (input: {
      user: { email: string };
      source: { oauth: { providerId: string } };
    }) => Promise<{ error?: string } | undefined>;
    const outsiderEmail = `outsider-${randomUUID()}@example.invalid`;
    const denied = await validate({
      user: { email: outsiderEmail },
      source: { oauth: { providerId: "google" } },
    });
    expect(denied?.error).toBe("access_denied");
    const allowed = await validate({
      user: { email: fixtures[0].email },
      source: { oauth: { providerId: "google" } },
    });
    expect(allowed).toBeUndefined();
    expect(
      await database.db
        .select()
        .from(user)
        .where(eq(user.email, outsiderEmail)),
    ).toHaveLength(0);
  });

  it("logs in and enforces role permissions from PostgreSQL", async () => {
    const responsibleCookie = await login(fixtures[0].email);
    const productionCookie = await login(fixtures[1].email);
    const responsibleMe = await request("/api/v1/me", {
      headers: { cookie: responsibleCookie },
    });
    expect((await responsibleMe.json()).role).toBe("RESPONSABLE");
    expect(
      (
        await request("/api/v1/responsable/overview", {
          headers: { cookie: responsibleCookie },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/api/v1/production/overview", {
          headers: { cookie: responsibleCookie },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/v1/production/overview", {
          headers: { cookie: productionCookie },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/api/v1/responsable/overview", {
          headers: { cookie: productionCookie },
        })
      ).status,
    ).toBe(403);
    const forgedRole = await request(
      "/api/v1/dashboard?role_context=PRODUCTION",
      { headers: { cookie: responsibleCookie, "x-role": "PRODUCTION" } },
    );
    expect((await forgedRole.json()).role).toBe("RESPONSABLE");
    expect(
      await database.db
        .select()
        .from(securityEvents)
        .where(eq(securityEvents.userId, fixtures[0].id)),
    ).not.toHaveLength(0);
  });

  it("rejects a cross-origin sign-in request", async () => {
    const response = await request("/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        origin: "https://untrusted.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: fixtures[0].email, password }),
    });
    expect(response.status).toBe(403);
  });

  it("revokes access from an existing session when membership is disabled", async () => {
    const cookie = await login(fixtures[1].email);
    await database.db
      .update(organizerMemberships)
      .set({ active: false })
      .where(eq(organizerMemberships.userId, fixtures[1].id));
    expect((await request("/api/v1/me", { headers: { cookie } })).status).toBe(
      403,
    );
    expect(
      (await request("/api/auth/get-session", { headers: { cookie } })).status,
    ).toBe(403);
    const newLogin = await request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: fixtures[1].email, password }),
    });
    expect(newLogin.status).toBe(403);
    await database.db
      .update(organizerMemberships)
      .set({ active: true })
      .where(eq(organizerMemberships.userId, fixtures[1].id));
  });

  it("ends a session on logout", async () => {
    const cookie = await login(fixtures[0].email);
    const logout = await request("/api/auth/sign-out", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "{}",
    });
    expect(logout.status).toBe(200);
    expect((await request("/api/v1/me", { headers: { cookie } })).status).toBe(
      401,
    );
  });

  it("rejects expired and database-revoked sessions", async () => {
    const expiredCookie = await login(fixtures[0].email);
    await database.db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(session.userId, fixtures[0].id));
    expect(
      (await request("/api/v1/me", { headers: { cookie: expiredCookie } }))
        .status,
    ).toBe(401);
    const revokedCookie = await login(fixtures[0].email);
    await database.db.delete(session).where(eq(session.userId, fixtures[0].id));
    expect(
      (await request("/api/v1/me", { headers: { cookie: revokedCookie } }))
        .status,
    ).toBe(401);
  });
});
