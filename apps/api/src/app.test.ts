import { randomUUID } from "node:crypto";
import {
  account,
  organizerMemberships,
  securityEvents,
  alumni,
  episodes,
  businessEvents,
  internalNotifications,
  session,
  user,
} from "@voix-alumni/db/schema";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { auth, configuredGoogleProvider, database } from "./auth.js";
import { resolveLocalDateTime } from "./lot2.js";

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
      .delete(internalNotifications)
      .where(eq(internalNotifications.recipientUserId, fixture.id));
    await database.db
      .delete(businessEvents)
      .where(eq(businessEvents.actorUserId, fixture.id));
    await database.db
      .delete(episodes)
      .where(eq(episodes.createdBy, fixture.id));
    await database.db.delete(alumni).where(eq(alumni.createdBy, fixture.id));
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

describe("Lot 2 alumni, episodes and handoff", () => {
  let responsibleCookie: string;
  let productionCookie: string;
  beforeAll(async () => {
    responsibleCookie = await login(fixtures[0].email);
    productionCookie = await login(fixtures[1].email);
  });

  it("keeps a potential alumni without an episode and warns on duplicates", async () => {
    const name = `Aminata ${randomUUID().slice(0, 8)}`;
    const created = await request("/api/v1/alumni", {
      method: "POST",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        full_name: name,
        promotion_year: "2018",
        job_title: "Ingénieure",
        company: "Exemple",
      }),
    });
    expect(created.status).toBe(201);
    const first = await created.json();
    expect(first.duplicate_hints).toHaveLength(0);
    const detail = await request(`/api/v1/alumni/${first.id}`, {
      headers: { cookie: responsibleCookie },
    });
    expect((await detail.json()).episodes).toHaveLength(0);
    const duplicate = await request("/api/v1/alumni", {
      method: "POST",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        full_name: name.toUpperCase(),
        promotion_year: "2018",
      }),
    });
    expect(duplicate.status).toBe(201);
    expect((await duplicate.json()).duplicate_hints).toContainEqual({
      id: first.id,
      full_name: name,
      promotion_year: "2018",
    });
    const edited = await request(`/api/v1/alumni/${first.id}`, {
      method: "PATCH",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expected_version: first.version,
        company: "Entreprise fictive",
      }),
    });
    expect(edited.status).toBe(200);
    expect((await edited.json()).company).toBe("Entreprise fictive");
    const history = await (
      await request(`/api/v1/audit?entity_type=alumni&entity_id=${first.id}`, {
        headers: { cookie: responsibleCookie },
      })
    ).json();
    expect(history.items).toContainEqual(
      expect.objectContaining({
        action: "alumni.updated",
        details: "Champs modifiés : entreprise",
        actor_user_id: fixtures[0].id,
      }),
    );
    expect(
      (
        await request(`/api/v1/alumni/${first.id}`, {
          headers: { cookie: responsibleCookie },
        })
      ).status,
    ).toBe(200);
  });

  it("enforces role permissions and rejects stale updates", async () => {
    const created = await request("/api/v1/alumni", {
      method: "POST",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        full_name: "Fatou Cas test",
        contact_notes: "Note réservée à la Responsable",
      }),
    });
    const person = await created.json();
    expect(person.contact_notes).toBe("Note réservée à la Responsable");
    const productionView = await (
      await request(`/api/v1/alumni/${person.id}`, {
        headers: { cookie: productionCookie },
      })
    ).json();
    expect(productionView.contact_notes).toBeNull();
    const forbiddenNotes = await request(`/api/v1/alumni/${person.id}`, {
      method: "PATCH",
      headers: {
        cookie: productionCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expected_version: person.version,
        contact_notes: "Ne doit pas être enregistré",
      }),
    });
    expect(forbiddenNotes.status).toBe(403);
    const forbiddenContact = await request(
      `/api/v1/alumni/${person.id}/contact-events`,
      {
        method: "POST",
        headers: {
          cookie: productionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "contacte",
          expected_version: person.version,
        }),
      },
    );
    expect(forbiddenContact.status).toBe(403);
    expect(
      (
        await request(`/api/v1/alumni/${person.id}`, {
          headers: { cookie: responsibleCookie },
        }).then((r) => r.json())
      ).relation_status,
    ).toBe("brouillon");
    const stale = await request(`/api/v1/alumni/${person.id}`, {
      method: "PATCH",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expected_version: person.version + 1,
        company: "Erreur",
      }),
    });
    expect(stale.status).toBe(409);
    expect(
      (
        await request(`/api/v1/episodes`, {
          headers: { cookie: productionCookie },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/api/v1/episodes`, {
          method: "POST",
          headers: {
            cookie: productionCookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({ alumni_id: person.id }),
        })
      ).status,
    ).toBe(403);
    expect((await request(`/api/v1/alumni`)).status).toBe(401);
    const limited = await (
      await request("/api/v1/alumni?limit=1&sort=name", {
        headers: { cookie: responsibleCookie },
      })
    ).json();
    expect(limited.items).toHaveLength(1);
    expect(limited.next_offset).toBe(1);
    const pageTwo = await (
      await request(
        `/api/v1/alumni?limit=1&sort=name&offset=${limited.next_offset}`,
        {
          headers: { cookie: responsibleCookie },
        },
      )
    ).json();
    expect(pageTwo.items[0].id).not.toBe(limited.items[0].id);
  });

  it("keeps one person linked to multiple episodes and handles IANA/DST", async () => {
    const person = await (
      await request("/api/v1/alumni", {
        method: "POST",
        headers: {
          cookie: responsibleCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          full_name: "Mamadou Plusieurs",
          job_title: "Analyste",
          company: "Organisation fictive",
        }),
      })
    ).json();
    const first = await request("/api/v1/episodes", {
      method: "POST",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        alumni_id: person.id,
        title: "Premier échange",
        tentative_start_local: "2026-11-08T18:00",
        event_timezone: "Europe/Paris",
      }),
    });
    expect(first.status).toBe(201);
    const episode = await first.json();
    expect(episode.public_number).toBeNull();
    const second = await request("/api/v1/episodes", {
      method: "POST",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ alumni_id: person.id }),
    });
    expect(second.status).toBe(201);
    const detail = await (
      await request(`/api/v1/alumni/${person.id}`, {
        headers: { cookie: responsibleCookie },
      })
    ).json();
    expect(detail.episodes).toHaveLength(2);
    const confirmed = await request(`/api/v1/episodes/${episode.id}/confirm`, {
      method: "POST",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expected_version: episode.version,
        start_at_local: "2026-11-08T18:00",
        event_timezone: "Europe/Paris",
      }),
    });
    expect(confirmed.status).toBe(200);
    const final = await confirmed.json();
    expect(final.start_at_utc).toBe("2026-11-08T17:00:00.000Z");
    expect(final.public_number).toBeGreaterThanOrEqual(12);
    expect(
      resolveLocalDateTime(
        "2026-11-08T18:00",
        "Africa/Dakar",
      ).date.toISOString(),
    ).toBe("2026-11-08T18:00:00.000Z");
    expect(() =>
      resolveLocalDateTime("2026-10-25T02:30", "Europe/Paris"),
    ).toThrow("AMBIGUOUS_LOCAL_TIME");
    expect(
      resolveLocalDateTime(
        "2026-10-25T01:30",
        "Europe/Paris",
      ).date.toISOString(),
    ).toBe("2026-10-24T23:30:00.000Z");
    expect(
      resolveLocalDateTime(
        "2026-10-25T03:30",
        "Europe/Paris",
      ).date.toISOString(),
    ).toBe("2026-10-25T02:30:00.000Z");
    expect(() =>
      resolveLocalDateTime("2026-03-29T02:30", "Europe/Paris"),
    ).toThrow("NONEXISTENT_LOCAL_TIME");
    expect(() => resolveLocalDateTime("2026-11-08T18:00", "GMT+2")).toThrow(
      "INVALID_TIMEZONE",
    );
  });

  it("transmits only after confirmation, once, to Production", async () => {
    const person = await (
      await request("/api/v1/alumni", {
        method: "POST",
        headers: {
          cookie: responsibleCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          full_name: "Awa Relais",
          job_title: "Directrice",
          company: "Entreprise fictive",
        }),
      })
    ).json();
    const episode = await (
      await request("/api/v1/episodes", {
        method: "POST",
        headers: {
          cookie: responsibleCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ alumni_id: person.id }),
      })
    ).json();
    const handoffPath = `/api/v1/episodes/${episode.id}/handoff`;
    const attempt = (cookie: string, expected_version: number) =>
      request(handoffPath, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ expected_version }),
      });
    expect((await attempt(productionCookie, episode.version)).status).toBe(403);
    expect((await attempt(responsibleCookie, episode.version)).status).toBe(
      409,
    );
    const confirmation = await request(
      `/api/v1/episodes/${episode.id}/confirm`,
      {
        method: "POST",
        headers: {
          cookie: responsibleCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          expected_version: episode.version,
          start_at_local: "2026-11-09T18:00",
          event_timezone: "Africa/Dakar",
        }),
      },
    );
    expect(confirmation.status).toBe(200);
    const confirmed = await confirmation.json();
    const handed = await attempt(responsibleCookie, confirmed.version);
    expect(handed.status).toBe(200);
    expect((await handed.json()).notification_created).toBe(true);
    const again = await attempt(responsibleCookie, confirmed.version);
    expect(again.status).toBe(200);
    expect((await again.json()).notification_created).toBe(false);
    const inbox = await (
      await request("/api/v1/notifications", {
        headers: { cookie: productionCookie },
      })
    ).json();
    expect(
      inbox.items.filter(
        (item: { episode_id: string }) => item.episode_id === episode.id,
      ),
    ).toHaveLength(1);
    const notice = inbox.items.find(
      (item: { episode_id: string }) => item.episode_id === episode.id,
    );
    expect(
      (
        await request(`/api/v1/notifications/${notice.id}/read`, {
          method: "POST",
          headers: { cookie: responsibleCookie },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/v1/notifications/${notice.id}/read`, {
          method: "POST",
          headers: { cookie: productionCookie },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/api/v1/episodes/${episode.id}`, {
          headers: { cookie: productionCookie },
        })
      ).status,
    ).toBe(200);
    const productionDossier = await (
      await request(`/api/v1/episodes/${episode.id}`, {
        headers: { cookie: productionCookie },
      })
    ).json();
    expect(productionDossier.missing_information).toContain(
      "Portrait et droits d'usage à vérifier",
    );
    expect(
      (
        await request(handoffPath, {
          method: "POST",
          headers: {
            cookie: productionCookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({ expected_version: confirmed.version }),
        })
      ).status,
    ).toBe(403);
  });
  it("requires a report to change confirmed time and retains cancellation history", async () => {
    const person = await (
      await request("/api/v1/alumni", {
        method: "POST",
        headers: {
          cookie: responsibleCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          full_name: "Historique Cas test",
          job_title: "Consultante",
          company: "Société fictive",
        }),
      })
    ).json();
    const episode = await (
      await request("/api/v1/episodes", {
        method: "POST",
        headers: {
          cookie: responsibleCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          alumni_id: person.id,
          tentative_start_local: "2026-11-10T18:00",
          event_timezone: "Europe/Paris",
        }),
      })
    ).json();
    const confirmed = await (
      await request(`/api/v1/episodes/${episode.id}/confirm`, {
        method: "POST",
        headers: {
          cookie: responsibleCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          expected_version: episode.version,
          start_at_local: "2026-11-10T18:00",
          event_timezone: "Europe/Paris",
        }),
      })
    ).json();
    expect(confirmed.tentative_start_at).toBe("2026-11-10T17:00:00.000Z");
    const bypass = await request(`/api/v1/episodes/${episode.id}`, {
      method: "PATCH",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expected_version: confirmed.version,
        tentative_start_local: "2026-11-12T18:00",
        event_timezone: "Europe/Paris",
      }),
    });
    expect(bypass.status).toBe(409);
    const reportPath = `/api/v1/episodes/${episode.id}/reschedule`;
    const payload = {
      expected_version: confirmed.version,
      start_at_local: "2026-11-12T18:00",
      event_timezone: "Europe/Paris",
      reason: "Nouveau créneau convenu",
    };
    expect(
      (
        await request(reportPath, {
          method: "POST",
          headers: {
            cookie: productionCookie,
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        })
      ).status,
    ).toBe(403);
    const reported = await request(reportPath, {
      method: "POST",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    expect(reported.status).toBe(200);
    const changed = await reported.json();
    expect(changed.status).toBe("reporte");
    expect(changed.schedule_version).toBe(2);
    expect(changed.public_number).toBe(confirmed.public_number);
    const audit = await (
      await request(
        `/api/v1/audit?entity_type=episode&entity_id=${episode.id}`,
        { headers: { cookie: responsibleCookie } },
      )
    ).json();
    expect(
      audit.items.some(
        (item: { action: string; details: string }) =>
          item.action === "episode.rescheduled" &&
          item.details.includes("2026-11-10T17:00:00.000Z"),
      ),
    ).toBe(true);
    const cancelled = await request(`/api/v1/episodes/${episode.id}/cancel`, {
      method: "POST",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expected_version: changed.version,
        reason: "Session annulée pour la recette",
      }),
    });
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).status).toBe("annule");
    expect(
      (
        await request(`/api/v1/episodes/${episode.id}`, {
          headers: { cookie: productionCookie },
        })
      ).status,
    ).toBe(200);
  });

  it("archives a person without deleting the associated history", async () => {
    const person = await (
      await request("/api/v1/alumni", {
        method: "POST",
        headers: {
          cookie: responsibleCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ full_name: "Archive Cas test" }),
      })
    ).json();
    expect(
      (
        await request(`/api/v1/alumni/${person.id}/archive`, {
          method: "POST",
          headers: {
            cookie: productionCookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({ expected_version: person.version }),
        })
      ).status,
    ).toBe(403);
    const archived = await request(`/api/v1/alumni/${person.id}/archive`, {
      method: "POST",
      headers: {
        cookie: responsibleCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expected_version: person.version,
        reason: "Archivage de recette",
      }),
    });
    expect(archived.status).toBe(200);
    expect((await archived.json()).archived_at).not.toBeNull();
    expect(
      (
        await request(`/api/v1/alumni/${person.id}`, {
          headers: { cookie: responsibleCookie },
        })
      ).status,
    ).toBe(200);
    const active = await (
      await request("/api/v1/alumni", {
        headers: { cookie: responsibleCookie },
      })
    ).json();
    expect(
      active.items.some((item: { id: string }) => item.id === person.id),
    ).toBe(false);
    const archivedList = await (
      await request("/api/v1/alumni?archived=true", {
        headers: { cookie: responsibleCookie },
      })
    ).json();
    expect(
      archivedList.items.some((item: { id: string }) => item.id === person.id),
    ).toBe(true);
  });
});
