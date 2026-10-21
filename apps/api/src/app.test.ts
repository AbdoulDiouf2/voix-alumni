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
import sharp from "sharp";
import { createObjectStore } from "./storage.js";

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

describe("Lot 3 operational workflow", () => {
  it("keeps task progress, internal requests, notifications and history after reload", async () => {
    const responsible = await login(fixtures[0].email);
    const production = await login(fixtures[1].email);
    const send = (
      path: string,
      cookie: string,
      method = "GET",
      payload?: unknown,
    ) =>
      request(path, {
        method,
        headers: { cookie, "content-type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    const person = await (
      await send("/api/v1/alumni", responsible, "POST", {
        full_name: "Lot Trois Fictif",
        job_title: "Directrice",
        company: "Exemple",
      })
    ).json();
    const episode = await (
      await send("/api/v1/episodes", responsible, "POST", {
        alumni_id: person.id,
      })
    ).json();
    expect(
      (await send(`/api/v1/episodes/${episode.id}/workflow`, production))
        .status,
    ).toBe(403);
    const confirmed = await (
      await send(
        `/api/v1/episodes/${episode.id}/confirm`,
        responsible,
        "POST",
        {
          expected_version: episode.version,
          start_at_local: "2026-11-10T18:00",
          event_timezone: "Europe/Paris",
        },
      )
    ).json();
    expect(
      (
        await send(
          `/api/v1/episodes/${episode.id}/handoff`,
          responsible,
          "POST",
          { expected_version: confirmed.version },
        )
      ).status,
    ).toBe(200);
    const base = `/api/v1/episodes/${episode.id}`;
    const workflow = await (await send(`${base}/workflow`, production)).json();
    expect(workflow.stages).toHaveLength(8);
    expect(workflow.stages[0].state).toBe("a_venir");
    expect(workflow.stages[1].state).toBe("taches_terminees");
    expect(workflow.stages[1].completed).toBe(false);
    expect(workflow.progress.attention_stage).toBe(3);
    expect(
      workflow.tasks.find(
        (item: { definition_key: string }) => item.definition_key === "accord",
      ).status,
    ).toBe("terminee");
    expect(
      workflow.tasks.find(
        (item: { definition_key: string }) => item.definition_key === "relais",
      ).status,
    ).toBe("terminee");
    expect(
      workflow.tasks.find(
        (item: { definition_key: string }) => item.definition_key === "fiche",
      ).status,
    ).toBe("a_faire");
    const custom = await send(`${base}/tasks`, responsible, "POST", {
      stage: 2,
      title: "Confirmer la participation et le créneau",
      required: false,
      owner_role: "RESPONSABLE",
    });
    expect(custom.status).toBe(201);
    const customId = (await custom.json()).id;
    const untouched = await (await send(`${base}/workflow`, production)).json();
    expect(
      untouched.tasks.find((item: { id: string }) => item.id === customId)
        .status,
    ).toBe("a_faire");
    expect(
      untouched.history.filter(
        (item: { action: string }) => item.action === "task.synchronized",
      ),
    ).toHaveLength(2);
    const preContact = await send(
      `/api/v1/alumni/${person.id}/contact-events`,
      responsible,
      "POST",
      { status: "a_contacter", expected_version: person.version },
    );
    expect(preContact.status).toBe(200);
    expect(
      (await (await send(`${base}/workflow`, production)).json()).tasks.find(
        (item: { definition_key: string }) => item.definition_key === "contact",
      ).status,
    ).toBe("a_faire");
    const contacted = await send(
      `/api/v1/alumni/${person.id}/contact-events`,
      responsible,
      "POST",
      {
        status: "contacte",
        expected_version: (await preContact.json()).version,
      },
    );
    expect(contacted.status).toBe(200);
    const synchronizedViews = await Promise.all([
      send(`${base}/workflow`, production),
      send(`${base}/workflow`, production),
    ]);
    expect(synchronizedViews.every((response) => response.status === 200)).toBe(
      true,
    );
    const synchronized = await synchronizedViews[0].json();
    expect(
      synchronized.tasks.find(
        (item: { definition_key: string }) => item.definition_key === "contact",
      ).status,
    ).toBe("terminee");
    expect(
      synchronized.history.filter(
        (item: { action: string }) => item.action === "task.synchronized",
      ),
    ).toHaveLength(3);
    expect(
      (
        await (await send(`${base}/workflow`, production)).json()
      ).history.filter(
        (item: { action: string }) => item.action === "task.synchronized",
      ),
    ).toHaveLength(3);
    const task = workflow.tasks.find(
      (item: { definition_key: string }) => item.definition_key === "profil",
    );
    expect(task.due_at).toBe("2026-11-03T17:00:00.000Z");
    expect(
      (
        await send(`${base}/tasks/${task.id}`, responsible, "PATCH", {
          expected_version: task.version,
          status: "terminee",
        })
      ).status,
    ).toBe(403);
    const concurrent = await Promise.all(
      [1, 2].map(() =>
        send(`${base}/tasks/${task.id}`, production, "PATCH", {
          expected_version: task.version,
          status: "terminee",
        }),
      ),
    );
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      (
        await send(`${base}/tasks/${task.id}`, production, "PATCH", {
          expected_version: task.version,
          status: "a_faire",
        })
      ).status,
    ).toBe(409);
    const created = await send(`${base}/requests`, production, "POST", {
      subject: "Fonction exacte",
      question: "Confirmer l’intitulé du poste ?",
    });
    expect(created.status).toBe(201);
    const requestId = (await created.json()).id;
    const notices = await (
      await send("/api/v1/workflow-notifications", responsible)
    ).json();
    expect(
      notices.items.filter(
        (item: { episode_id: string }) => item.episode_id === episode.id,
      ),
    ).toHaveLength(1);
    const notice = notices.items.find(
      (item: { episode_id: string }) => item.episode_id === episode.id,
    );
    expect(notice.read_at).toBeNull();
    expect(
      (
        await send(
          `/api/v1/workflow-notifications/${notice.id}/read`,
          production,
          "POST",
        )
      ).status,
    ).toBe(404);
    const firstRead = await (
      await send(
        `/api/v1/workflow-notifications/${notice.id}/read`,
        responsible,
        "POST",
      )
    ).json();
    expect(firstRead.read_at).not.toBeNull();
    expect(
      (
        await (
          await send(
            `/api/v1/workflow-notifications/${notice.id}/read`,
            responsible,
            "POST",
          )
        ).json()
      ).read_at,
    ).toBe(firstRead.read_at);
    expect(
      (
        await (await send("/api/v1/workflow-notifications", responsible)).json()
      ).items.find((item: { id: string }) => item.id === notice.id).read_at,
    ).not.toBeNull();
    expect(
      (
        await send(
          `/api/v1/requests/${requestId}/respond`,
          production,
          "POST",
          { expected_version: 1, response: "Erreur" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          `/api/v1/requests/${requestId}/respond`,
          responsible,
          "POST",
          { expected_version: 1, response: "Directrice des opérations" },
        )
      ).status,
    ).toBe(200);
    const repeated = await send(
      `/api/v1/requests/${requestId}/respond`,
      responsible,
      "POST",
      { expected_version: 2, response: "Directrice des opérations" },
    );
    expect((await repeated.json()).notification_created).toBe(false);
    const productionNotices = await (
      await send("/api/v1/workflow-notifications", production)
    ).json();
    expect(
      productionNotices.items.filter(
        (item: { episode_id: string }) => item.episode_id === episode.id,
      ),
    ).toHaveLength(1);
    expect(
      (
        await send(
          `/api/v1/requests/${requestId}/resolve`,
          production,
          "POST",
          { expected_version: 2 },
        )
      ).status,
    ).toBe(200);
    const final = await (await send(`${base}/workflow`, production)).json();
    expect(final.progress.done).toBe(4);
    expect(final.stages[2].completed).toBe(false);
    expect(
      (
        await send(`${base}/stages/3/validate`, production, "POST", {
          expected_version: final.stages[2].version,
        })
      ).status,
    ).toBe(409);
    for (const remaining of final.tasks.filter(
      (item: { stage: number; required: boolean; status: string }) =>
        item.stage === 3 && item.required && item.status !== "terminee",
    )) {
      expect(
        (
          await send(`${base}/tasks/${remaining.id}`, production, "PATCH", {
            expected_version: remaining.version,
            status: "terminee",
          })
        ).status,
      ).toBe(200);
    }
    const ready = await (await send(`${base}/workflow`, production)).json();
    expect(ready.stages[2].ready).toBe(true);
    expect(ready.stages[2].completed).toBe(false);
    expect(
      (
        await send(`${base}/stages/3/validate`, production, "POST", {
          expected_version: ready.stages[2].version,
        })
      ).status,
    ).toBe(200);
    await expect(
      (await send(`${base}/workflow`, production)).json(),
    ).resolves.toHaveProperty("stages.2.completed", true);
    const beforeReport = await (await send(base, responsible)).json();
    const reported = await send(`${base}/reschedule`, responsible, "POST", {
      expected_version: beforeReport.version,
      start_at_local: "2026-11-12T18:00",
      event_timezone: "Europe/Paris",
      reason: "Nouveau créneau confirmé avec l’intervenant",
    });
    expect(reported.status).toBe(200);
    const duringReport = await (
      await send(`${base}/workflow`, production)
    ).json();
    expect(
      duringReport.tasks.find(
        (item: { definition_key: string }) => item.definition_key === "affiche",
      ).due_at,
    ).toBeNull();
    const reconfirmed = await send(`${base}/confirm`, responsible, "POST", {
      expected_version: (await reported.json()).version,
      start_at_local: "2026-11-12T18:00",
      event_timezone: "Europe/Paris",
    });
    expect(reconfirmed.status).toBe(200);
    const afterReport = await (
      await send(`${base}/workflow`, production)
    ).json();
    expect(
      afterReport.tasks.find(
        (item: { definition_key: string }) => item.definition_key === "affiche",
      ).due_at,
    ).toBe("2026-11-05T17:00:00.000Z");
    const reunion = afterReport.tasks.find(
      (item: { definition_key: string }) => item.definition_key === "reunion",
    );
    expect(
      (
        await send(`${base}/tasks/${reunion.id}`, production, "PATCH", {
          expected_version: reunion.version,
          due_local: "2026-10-25T02:30",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await send(`${base}/tasks/${reunion.id}`, production, "PATCH", {
          expected_version: reunion.version,
          title: "Tester le lien de réunion",
          due_local: "2026-11-11T18:00",
        })
      ).status,
    ).toBe(200);
    const adapted = await (await send(`${base}/workflow`, production)).json();
    expect(
      adapted.tasks.find((item: { id: string }) => item.id === reunion.id)
        .due_at,
    ).toBe("2026-11-11T17:00:00.000Z");
    expect(final.requests[0].status).toBe("résolue");
    expect(
      final.history.map((item: { action: string }) => item.action),
    ).toContain("request.resolve");
    expect(
      final.history.map((item: { action: string }) => item.action),
    ).toContain("task.updated");
  });
});

describe("Lot 4 creative workflow", () => {
  it("keeps approvals, versions and manual publication distinct while enforcing media rights", async () => {
    const responsible = await login(fixtures[0].email);
    const production = await login(fixtures[1].email);
    const send = (
      path: string,
      cookie: string,
      method = "GET",
      payload?: unknown,
    ) =>
      request(path, {
        method,
        headers: { cookie, "content-type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    const person = await (
      await send("/api/v1/alumni", responsible, "POST", {
        full_name: "Ézéchiel Exemple",
        promotion_year: "2012",
        job_title: "Directeur des technologies et des opérations régionales",
        company: "Organisation fictive",
      })
    ).json();
    const episode = await (
      await send("/api/v1/episodes", responsible, "POST", {
        alumni_id: person.id,
      })
    ).json();
    const confirmed = await (
      await send(
        `/api/v1/episodes/${episode.id}/confirm`,
        responsible,
        "POST",
        {
          expected_version: episode.version,
          start_at_local: "2026-11-10T18:00",
          event_timezone: "Europe/Paris",
        },
      )
    ).json();
    expect(
      (await send(`/api/v1/episodes/${episode.id}/creative`, production))
        .status,
    ).toBe(404);
    expect(
      (
        await send(
          `/api/v1/episodes/${episode.id}/handoff`,
          responsible,
          "POST",
          { expected_version: confirmed.version },
        )
      ).status,
    ).toBe(200);
    const base = `/api/v1/episodes/${episode.id}`;
    expect(
      (
        await send(`${base}/contents`, responsible, "POST", {
          kind: "announcement_message",
        })
      ).status,
    ).toBe(403);
    const message = await (
      await send(`${base}/contents`, production, "POST", {
        kind: "announcement_message",
      })
    ).json();
    expect(message.status).toBe("brouillon");
    expect(
      (
        await send(
          `/api/v1/contents/${message.id}/approve`,
          production,
          "POST",
          { expected_version: message.version },
        )
      ).status,
    ).toBe(403);
    const review = await (
      await send(`/api/v1/contents/${message.id}/submit`, production, "POST", {
        expected_version: message.version,
      })
    ).json();
    expect(review.status).toBe("a_relire");
    const approved = await (
      await send(
        `/api/v1/contents/${message.id}/approve`,
        responsible,
        "POST",
        { expected_version: review.version },
      )
    ).json();
    expect(approved.status).toBe("valide");
    expect(approved.published_at).toBeNull();
    const readyForm = new FormData();
    readyForm.append("expected_version", String(approved.version));
    const ready = await request(`/api/v1/contents/${message.id}/export`, {
      method: "POST",
      headers: { cookie: production },
      body: readyForm,
    });
    expect(ready.status).toBe(200);
    const prepared = await ready.json();
    expect(prepared.status).toBe("pret_a_publier");
    expect(prepared.published_at).toBeNull();
    expect(
      (
        await send(
          `/api/v1/contents/${message.id}/publish`,
          responsible,
          "POST",
          {
            expected_version: prepared.version,
            channel: "whatsapp_community",
            confirmed_external_publication: true,
          },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          `/api/v1/contents/${message.id}/publish`,
          production,
          "POST",
          {
            expected_version: prepared.version,
            channel: "whatsapp_community",
          },
        )
      ).status,
    ).toBe(422);
    const publish = await send(
      `/api/v1/contents/${message.id}/publish`,
      production,
      "POST",
      {
        expected_version: prepared.version,
        channel: "whatsapp_community",
        confirmed_external_publication: true,
      },
    );
    expect(publish.status).toBe(200);
    expect((await publish.json()).status).toBe("publie");
    expect(
      (
        await send(
          `/api/v1/contents/${message.id}/publish`,
          production,
          "POST",
          {
            expected_version: prepared.version,
            channel: "whatsapp_community",
            confirmed_external_publication: true,
          },
        )
      ).status,
    ).toBe(409);
    const history = await (
      await send(`/api/v1/contents/${message.id}/history`, responsible)
    ).json();
    expect(history.revisions).toHaveLength(5);
    expect(history.publications).toHaveLength(1);
    expect(history.publications[0].version).toBe(prepared.version);
    expect(history.publications[0].channel).toBe("whatsapp_community");
    expect(history.publications[0].author_id).toBe(fixtures[1].id);
    expect(
      new Date(history.publications[0].published_at).getTime(),
    ).toBeGreaterThan(0);
    const poster = await (
      await send(`${base}/contents`, production, "POST", {
        kind: "announcement_poster",
      })
    ).json();
    expect(
      (
        await send(`/api/v1/contents/${poster.id}/submit`, production, "POST", {
          expected_version: poster.version,
        })
      ).status,
    ).toBe(422);
    const image = await sharp({
      create: { width: 1200, height: 1500, channels: 4, background: "#ddc8b5" },
    })
      .png()
      .toBuffer();
    const upload = async (kind: string) => {
      const form = new FormData();
      form.append("kind", kind);
      form.append(
        "file",
        new File([image], `${kind}.png`, { type: "image/png" }),
      );
      const response = await request(`${base}/assets`, {
        method: "POST",
        headers: { cookie: production },
        body: form,
      });
      expect(response.status).toBe(201);
      return response.json();
    };
    const portrait = await upload("portrait");
    const esmt = await upload("logo_esmt");
    const cps = await upload("logo_cps");
    const voix = await upload("logo_voix");
    const withPhoto = await (
      await send(`/api/v1/contents/${poster.id}`, production, "PATCH", {
        expected_version: poster.version,
        portrait_asset_id: portrait.id,
        fields: {
          logo_esmt_asset_id: esmt.id,
          logo_cps_asset_id: cps.id,
          logo_voix_asset_id: voix.id,
        },
      })
    ).json();
    const posterReview = await (
      await send(`/api/v1/contents/${poster.id}/submit`, production, "POST", {
        expected_version: withPhoto.version,
      })
    ).json();
    expect(
      (
        await send(
          `/api/v1/contents/${poster.id}/approve`,
          responsible,
          "POST",
          { expected_version: posterReview.version },
        )
      ).status,
    ).toBe(409);
    const rights = async (
      asset: { id: string },
      status: string,
      version: number,
    ) =>
      send(`/api/v1/assets/${asset.id}/rights`, responsible, "PATCH", {
        expected_version: version,
        status,
        evidence_ref:
          status === "granted" ? "Autorisation interne documentée" : null,
      });
    expect((await rights(portrait, "granted", 1)).status).toBe(200);
    expect((await rights(esmt, "granted", 1)).status).toBe(200);
    expect((await rights(cps, "granted", 1)).status).toBe(200);
    const consent = await send(`${base}/consents`, responsible, "POST", {
      asset_id: portrait.id,
      purpose: "portrait_announcement",
      status: "granted",
      scope: "Affiche et communauté",
      evidence_ref: "Autorisation portrait documentée",
    });
    expect(consent.status).toBe(201);
    expect(
      (
        await send(
          `/api/v1/contents/${poster.id}/approve`,
          responsible,
          "POST",
          { expected_version: posterReview.version },
        )
      ).status,
    ).toBe(409);
    expect((await rights(voix, "granted", 1)).status).toBe(200);
    const posterApproved = await send(
      `/api/v1/contents/${poster.id}/approve`,
      responsible,
      "POST",
      { expected_version: posterReview.version },
    );
    expect(posterApproved.status).toBe(200);
    const approvedPoster = await posterApproved.json();
    const png = await sharp({
      create: { width: 1080, height: 1350, channels: 4, background: "#fffdf9" },
    })
      .png()
      .toBuffer();
    const exportForm = new FormData();
    exportForm.append("expected_version", String(approvedPoster.version));
    exportForm.append(
      "file",
      new File([png], "annonce.png", { type: "image/png" }),
    );
    const exportResponse = await request(
      `/api/v1/contents/${poster.id}/export`,
      { method: "POST", headers: { cookie: production }, body: exportForm },
    );
    expect(exportResponse.status).toBe(200);
    const exportedPoster = await exportResponse.json();
    expect(exportedPoster.exported_asset_id).toBeTruthy();
    const binary = await request(
      `/api/v1/assets/${exportedPoster.exported_asset_id}/content`,
      { headers: { cookie: production } },
    );
    expect(binary.status).toBe(200);
    expect(
      (await sharp(Buffer.from(await binary.arrayBuffer())).metadata()).width,
    ).toBe(1080);
    expect(
      (
        await send(`${base}/consents`, responsible, "POST", {
          asset_id: portrait.id,
          purpose: "portrait_thank_you",
          status: "granted",
          scope: "Affiche de remerciement",
          evidence_ref: "Autorisation portrait documentée",
        })
      ).status,
    ).toBe(201);
    const thanks = await (
      await send(`${base}/contents`, production, "POST", {
        kind: "thank_you_poster",
      })
    ).json();
    const thanksEdited = await (
      await send(`/api/v1/contents/${thanks.id}`, production, "PATCH", {
        expected_version: thanks.version,
        portrait_asset_id: portrait.id,
        fields: {
          logo_esmt_asset_id: esmt.id,
          logo_cps_asset_id: cps.id,
          logo_voix_asset_id: voix.id,
          quote: "Une citation fictive pour la recette",
          replay_url: "https://example.invalid/replay",
        },
      })
    ).json();
    const thanksReview = await (
      await send(`/api/v1/contents/${thanks.id}/submit`, production, "POST", {
        expected_version: thanksEdited.version,
      })
    ).json();
    expect(
      (
        await send(
          `/api/v1/contents/${thanks.id}/approve`,
          responsible,
          "POST",
          {
            expected_version: thanksReview.version,
          },
        )
      ).status,
    ).toBe(409);
    const verifiedQuote = await (
      await send(`${base}/quotes`, production, "POST", {
        exact_text: "Une citation fictive pour la recette",
        source_ref: "Source fictive de recette documentée",
      })
    ).json();
    expect(
      (
        await send(
          `${base}/quotes/${verifiedQuote.id}/approve`,
          responsible,
          "POST",
          { expected_version: 1, confirmed_exact: true },
        )
      ).status,
    ).toBe(200);
    const thanksConfirmed = await (
      await send(`/api/v1/contents/${thanks.id}`, production, "PATCH", {
        expected_version: thanksReview.version,
        fields: { quote_approved: "true", replay_confirmed: "true" },
      })
    ).json();
    expect(
      (
        await send(
          `/api/v1/contents/${thanks.id}/approve`,
          responsible,
          "POST",
          {
            expected_version: thanksConfirmed.version,
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/v1/assets/${exportedPoster.exported_asset_id}/content`,
        )
      ).status,
    ).toBe(401);
    const synchronized = await (
      await send(`${base}/workflow`, production)
    ).json();
    for (const key of ["affiche", "texte", "validation", "publication"]) {
      expect(
        synchronized.tasks.find(
          (task: { definition_key: string }) => task.definition_key === key,
        )?.status,
      ).toBe("terminee");
    }
    const syncEvents = synchronized.history.filter(
      (event: { action: string }) => event.action === "task.synchronized",
    ).length;
    const repeated = await (await send(`${base}/workflow`, production)).json();
    expect(
      repeated.history.filter(
        (event: { action: string }) => event.action === "task.synchronized",
      ),
    ).toHaveLength(syncEvents);
    const revoked = await send(`${base}/consents`, responsible, "POST", {
      asset_id: portrait.id,
      purpose: "portrait_announcement",
      status: "revoked",
      scope: "Affiche et communauté",
      evidence_ref: null,
      expected_version: (await consent.json()).version,
    });
    expect(revoked.status).toBe(200);
    const invalidated = await (
      await send(`${base}/workflow`, production)
    ).json();
    expect(
      invalidated.tasks.find(
        (task: { definition_key: string }) => task.definition_key === "affiche",
      )?.status,
    ).toBe("a_faire");
    expect(
      invalidated.tasks.find(
        (task: { definition_key: string }) =>
          task.definition_key === "validation",
      )?.status,
    ).toBe("a_faire");
    expect(
      invalidated.history.some(
        (event: { action: string }) =>
          event.action === "task.source_invalidated",
      ),
    ).toBe(true);
    expect(
      (
        await send(
          `/api/v1/contents/${poster.id}/publish`,
          production,
          "POST",
          {
            expected_version: exportedPoster.version,
            channel: "whatsapp_community",
            confirmed_external_publication: true,
          },
        )
      ).status,
    ).toBe(409);
    const editedMessage = await (
      await send(`${base}/contents`, production, "POST", {
        kind: "meeting_link",
      })
    ).json();
    const changed = await send(
      `/api/v1/contents/${editedMessage.id}`,
      production,
      "PATCH",
      {
        expected_version: editedMessage.version,
        fields: { meeting_url: "https://example.invalid/meeting" },
      },
    );
    expect(changed.status).toBe(200);
    expect(
      (
        await send(
          `/api/v1/contents/${editedMessage.id}`,
          production,
          "PATCH",
          { expected_version: editedMessage.version, body: "ancien" },
        )
      ).status,
    ).toBe(409);
    const savedLink = await changed.json();
    const linkReview = await (
      await send(
        `/api/v1/contents/${editedMessage.id}/submit`,
        production,
        "POST",
        {
          expected_version: savedLink.version,
        },
      )
    ).json();
    const linkApproved = await (
      await send(
        `/api/v1/contents/${editedMessage.id}/approve`,
        responsible,
        "POST",
        {
          expected_version: linkReview.version,
        },
      )
    ).json();
    expect(linkApproved.status).toBe("valide");
    const correctedLink = await (
      await send(`/api/v1/contents/${editedMessage.id}`, production, "PATCH", {
        expected_version: linkApproved.version,
        fields: { meeting_url: "https://example.invalid/meeting-corrected" },
      })
    ).json();
    expect(correctedLink.status).toBe("a_relire");
    expect(correctedLink.approved_at).toBeNull();
    const rejectedExportForm = new FormData();
    rejectedExportForm.append(
      "expected_version",
      String(correctedLink.version),
    );
    expect(
      (
        await request(`/api/v1/contents/${editedMessage.id}/export`, {
          method: "POST",
          headers: { cookie: production },
          body: rejectedExportForm,
        })
      ).status,
    ).toBe(409);
    const currentEpisode = await (await send(base, responsible)).json();
    expect(
      (
        await send(`${base}/reschedule`, responsible, "POST", {
          expected_version: currentEpisode.version,
          start_at_local: "2026-11-17T18:00",
          event_timezone: "Europe/Paris",
          reason: "Report fictif pour recette",
        })
      ).status,
    ).toBe(200);
    const afterReport = await (
      await send(`${base}/creative`, production)
    ).json();
    expect(
      afterReport.contents.find(
        (item: { id: string }) => item.id === message.id,
      ).source_stale,
    ).toBe(true);
    expect(
      (
        await send(
          `/api/v1/contents/${editedMessage.id}/submit`,
          production,
          "POST",
          {
            expected_version: correctedLink.version,
          },
        )
      ).status,
    ).toBe(409);
  });
});

describe("Lot 5 feedback and session operations", () => {
  it("keeps roles, public tokens, versions, reminders and imports coherent", async () => {
    const responsable = await login(fixtures[0].email),
      production = await login(fixtures[1].email);
    const send = (
      path: string,
      cookie: string | null,
      method = "GET",
      payload?: unknown,
      extra?: Record<string, string>,
    ) =>
      request(path, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          "content-type": "application/json",
          ...extra,
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    const person = await (
      await send("/api/v1/alumni", responsable, "POST", {
        full_name: "Lot Cinq Fictif",
        job_title: "Fonction fictive",
        company: "Organisation fictive",
      })
    ).json();
    const episode = await (
      await send("/api/v1/episodes", responsable, "POST", {
        alumni_id: person.id,
      })
    ).json();
    const base = `/api/v1/episodes/${episode.id}`;
    expect((await send(`${base}/operations`, production)).status).toBe(404);
    const confirmed = await (
      await send(`${base}/confirm`, responsable, "POST", {
        expected_version: episode.version,
        start_at_local: "2026-10-25T18:00",
        event_timezone: "Europe/Paris",
      })
    ).json();
    expect(
      (
        await send(`${base}/handoff`, responsable, "POST", {
          expected_version: confirmed.version,
        })
      ).status,
    ).toBe(200);
    const first = await (await send(`${base}/operations`, production)).json();
    expect(first.reminders).toHaveLength(5);
    expect(
      (
        await send(`${base}/session-plan`, responsable, "PUT", {
          teams_url: "https://teams.microsoft.com/l/meetup-join/test",
          expected_version: null,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send(`${base}/session-plan`, production, "PUT", {
          teams_url: "https://teams.microsoft.com/l/meetup-join/test",
          fallback_url: null,
          expected_version: null,
        })
      ).status,
    ).toBe(200);
    const plan = await (await send(`${base}/operations`, production)).json();
    expect(plan.plan.teams_url).toContain("teams.microsoft.com");
    const concurrent = await Promise.all([
      send(`${base}/session-plan`, production, "PUT", {
        teams_url: "https://teams.microsoft.com/l/meetup-join/first",
        fallback_url: null,
        expected_version: plan.plan.version,
      }),
      send(`${base}/session-plan`, production, "PUT", {
        teams_url: "https://teams.microsoft.com/l/meetup-join/second",
        fallback_url: null,
        expected_version: plan.plan.version,
      }),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const currentPlan = await (
      await send(`${base}/operations`, production)
    ).json();
    expect(
      (
        await send(`${base}/session-plan/check-access`, production, "POST", {
          expected_version: currentPlan.plan.version,
          status: "accessible",
          confirmed_manual_check: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await send(`${base}/questions/initialize`, production, "POST", {}))
        .status,
    ).toBe(201);
    const conductor = await (
      await send(`${base}/operations`, responsable)
    ).json();
    expect(conductor.questions).toHaveLength(6);
    expect(
      (
        await send(`${base}/conductor/approve`, production, "POST", {
          expected_version: conductor.plan.version,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send(`${base}/conductor/approve`, responsable, "POST", {
          expected_version: conductor.plan.version,
        })
      ).status,
    ).toBe(200);
    const beforeReport = await (
      await send(`${base}/operations`, production)
    ).json();
    const j1 = beforeReport.reminders.find(
      (item: { key: string }) => item.key === "j_1",
    );
    expect(
      (
        await send(`${base}/reminders/j_1/complete`, production, "POST", {
          expected_version: j1.version,
        })
      ).status,
    ).toBe(200);
    const beforeChange = await (await send(base, responsable)).json();
    expect(
      (
        await send(`${base}/reschedule`, responsable, "POST", {
          expected_version: beforeChange.version,
          start_at_local: "2026-11-12T18:00",
          event_timezone: "Europe/Paris",
          reason: "Changement de date fictif",
        })
      ).status,
    ).toBe(200);
    const afterReport = await (
      await send(`${base}/operations`, production)
    ).json();
    expect(afterReport.plan.access_status).toBe("a_verifier");
    expect(
      afterReport.reminders.find((item: { key: string }) => item.key === "j_1")
        .due_at,
    ).toBe(j1.due_at);
    expect(
      afterReport.reminders.find((item: { key: string }) => item.key === "j_7")
        .due_at,
    ).toBeNull();
    const proposed = await (await send(base, responsable)).json();
    expect(
      (
        await send(`${base}/confirm`, responsable, "POST", {
          expected_version: proposed.version,
          start_at_local: "2026-11-12T18:00",
          event_timezone: "Europe/Paris",
        })
      ).status,
    ).toBe(200);
    const reconfirmed = await (
      await send(`${base}/operations`, production)
    ).json();
    expect(
      reconfirmed.reminders.find((item: { key: string }) => item.key === "j_7")
        .due_at,
    ).not.toBe(
      beforeReport.reminders.find((item: { key: string }) => item.key === "j_7")
        .due_at,
    );
    expect(
      reconfirmed.reminders.find((item: { key: string }) => item.key === "j_1")
        .due_at,
    ).toBe(j1.due_at);
    const notice =
      "Notice strictement fictive de recette : réponses anonymes, utilisées uniquement pour les tests isolés et supprimées après la recette.";
    expect(
      (
        await send("/api/v1/feedback/policy", production, "POST", {
          notice_text: notice,
          retention_days: 30,
          confirmed: true,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send("/api/v1/feedback/policy", responsable, "POST", {
          notice_text: notice,
          retention_days: 30,
          confirmed: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await send(`${base}/feedback`, production, "POST", {})).status,
    ).toBe(201);
    const draft = await (await send(`${base}/feedback`, production)).json();
    expect(draft.versions[0].standard_unchanged).toBe(true);
    expect(
      (
        await send(`${base}/feedback/open`, production, "POST", {
          expected_version: draft.form.version,
          confirmed: true,
        })
      ).status,
    ).toBe(200);
    const opened = await (await send(`${base}/feedback`, production)).json();
    const token = opened.form.public_url.split("/").at(-1);
    expect((await request(`/api/public/feedback/${token}`)).status).toBe(200);
    expect(
      (
        await request(`/api/public/feedback/${token}/responses`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": randomUUID(),
          },
          body: JSON.stringify({
            notice_version: opened.versions[0].notice_version,
            answers: {
              rating: 5,
              attendance: "En direct",
              best: "Échange fictif",
            },
          }),
        })
      ).status,
    ).toBe(201);
    const repeatedKey = randomUUID();
    const submit = () =>
      request(`/api/public/feedback/${token}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": repeatedKey,
        },
        body: JSON.stringify({
          notice_version: opened.versions[0].notice_version,
          answers: { rating: 4 },
        }),
      });
    expect((await submit()).status).toBe(201);
    expect((await submit()).status).toBe(200);
    expect((await send(`${base}/feedback/responses`, null)).status).toBe(401);
    expect((await send(`${base}/feedback`, responsable)).status).toBe(200);
    const results = await (await send(`${base}/feedback`, production)).json();
    expect(results.summary.count).toBe(2);
    const csv = "rating,relevance,attendance\n3,Oui,En replay\n";
    const mapping = {
      rating: "rating",
      relevance: "relevance",
      attendance: "attendance",
    };
    const preview = await (
      await send(`${base}/feedback/import/preview`, production, "POST", {
        csv,
        mapping,
      })
    ).json();
    expect(preview.valid).toBe(1);
    expect(
      (
        await send(`${base}/feedback/import/commit`, production, "POST", {
          csv,
          mapping,
          confirmed: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await (
          await send(`${base}/feedback/import/commit`, production, "POST", {
            csv,
            mapping,
            confirmed: true,
          })
        ).json()
      ).inserted,
    ).toBe(0);
    expect(
      (await send(`${base}/feedback/export.csv`, production)).headers.get(
        "content-type",
      ),
    ).toContain("text/csv");
    expect(
      (
        await send(`${base}/mark-held`, production, "POST", {
          expected_version: 3,
          confirmed_held: true,
        })
      ).status,
    ).toBe(403);
    const currentEpisode = await (await send(base, responsable)).json();
    expect(
      (
        await send(`${base}/mark-held`, responsable, "POST", {
          expected_version: currentEpisode.version,
          confirmed_held: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(`${base}/feedback/closed`, production, "POST", {
          expected_version: opened.form.version,
        })
      ).status,
    ).toBe(200);
    expect((await request(`/api/public/feedback/${token}`)).status).toBe(410);
    const beforeEdit = await (
      await send(`${base}/feedback`, production)
    ).json();
    const changedQuestions = beforeEdit.versions[0].questions.map(
      (item: { id: string; label: string }) =>
        item.id === "best"
          ? { ...item, label: "Quel moment fictif retenez-vous ?" }
          : item,
    );
    expect(
      (
        await send(`${base}/feedback`, production, "PATCH", {
          expected_version: beforeEdit.form.version,
          questions: changedQuestions,
          notice_text: notice,
        })
      ).status,
    ).toBe(200);
    const edited = await (await send(`${base}/feedback`, production)).json();
    expect(edited.summary.count).toBe(3);
    expect(edited.versions).toHaveLength(2);
    expect(edited.versions[0].approved_at).toBeNull();
    expect(
      (
        await send(`${base}/feedback/open`, production, "POST", {
          expected_version: edited.form.version,
          confirmed: true,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await send(`${base}/feedback/approve`, responsable, "POST", {
          expected_version: edited.form.version,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(`${base}/feedback/open`, production, "POST", {
          expected_version: edited.form.version,
          confirmed: true,
        })
      ).status,
    ).toBe(200);
    const workflow = await (await send(`${base}/workflow`, production)).json();
    expect(
      workflow.tasks.find(
        (task: { definition_key: string }) =>
          task.definition_key === "presence",
      ).status,
    ).toBe("terminee");
    expect(workflow.stages[5].completed).toBe(false);
    expect(
      (
        await send(`${base}/closure/prepare`, production, "POST", {
          expected_version: null,
          exceptions: {},
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(`${base}/closure/approve`, responsable, "POST", {
          expected_version: 1,
          confirmed_archive: true,
        })
      ).status,
    ).toBe(409);
    const thanks = await (
      await send(`${base}/contents`, production, "POST", { kind: "hot_thanks" })
    ).json();
    const thanksEdited = await (
      await send(`/api/v1/contents/${thanks.id}`, production, "PATCH", {
        expected_version: thanks.version,
        fields: {
          feedback_url: `http://127.0.0.1:5173/feedback/public/${token}`,
        },
      })
    ).json();
    const thanksReview = await (
      await send(`/api/v1/contents/${thanks.id}/submit`, production, "POST", {
        expected_version: thanksEdited.version,
      })
    ).json();
    const thanksApproved = await (
      await send(`/api/v1/contents/${thanks.id}/approve`, responsable, "POST", {
        expected_version: thanksReview.version,
      })
    ).json();
    const readyForm = new FormData();
    readyForm.append("expected_version", String(thanksApproved.version));
    const thanksReady = await (
      await request(`/api/v1/contents/${thanks.id}/export`, {
        method: "POST",
        headers: { cookie: production },
        body: readyForm,
      })
    ).json();
    expect(
      (
        await send(
          `/api/v1/contents/${thanks.id}/publish`,
          production,
          "POST",
          {
            expected_version: thanksReady.version,
            channel: "whatsapp_community",
            confirmed_external_publication: true,
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await send(`${base}/replay`, production, "PUT", {
          youtube_url: "https://youtu.be/abcdefghijk",
          visibility: "unlisted",
          status: "available",
          recording_rights: "unknown",
          diffusion_rights: "unknown",
          expected_version: null,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await send(`${base}/replay`, production, "PUT", {
          youtube_url: "https://youtu.be/abcdefghijk",
          visibility: "unlisted",
          status: "available",
          recording_rights: "granted",
          diffusion_rights: "granted",
          rights_evidence_ref: "Autorisation fictive documentée",
          expected_version: null,
        })
      ).status,
    ).toBe(200);
    const transcriptForm = new FormData();
    transcriptForm.append(
      "file",
      new File(
        [
          "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nUne phrase fictive de recette.",
        ],
        "recette.vtt",
        { type: "text/vtt" },
      ),
    );
    transcriptForm.append("language", "fr");
    transcriptForm.append(
      "provenance",
      "Transcription fictive générée pour la recette",
    );
    const uploaded = await request(`${base}/transcripts`, {
      method: "POST",
      headers: { cookie: production },
      body: transcriptForm,
    });
    expect(uploaded.status).toBe(201);
    const transcript = await uploaded.json();
    expect(
      (await send(`${base}/transcripts/${transcript.id}`, production)).status,
    ).toBe(200);
    expect(
      (
        await send(
          `${base}/transcripts/${transcript.id}/review`,
          production,
          "POST",
          {
            corrected_text: "Une phrase fictive de recette.",
            confirmed_review: true,
          },
        )
      ).status,
    ).toBe(200);
    const quote = await (
      await send(`${base}/quotes`, production, "POST", {
        transcript_id: transcript.id,
        exact_text: "Une phrase fictive de recette.",
        source_ref: "recette.vtt, 00:00:01",
      })
    ).json();
    expect(
      (
        await send(`${base}/quotes/${quote.id}/approve`, production, "POST", {
          expected_version: 1,
          confirmed_exact: true,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send(`${base}/quotes/${quote.id}/approve`, responsable, "POST", {
          expected_version: 1,
          confirmed_exact: true,
        })
      ).status,
    ).toBe(200);
    const preparedClosure = await (
      await send(`${base}/closure/prepare`, production, "POST", {
        expected_version: 1,
        exceptions: {
          final_poster:
            "Affiche finale indisponible pour cette recette synthétique.",
          replay_message: "Diffusion du message replay reportée et documentée.",
        },
      })
    ).json();
    expect(preparedClosure.status).toBe("prepared");
    expect(
      (
        await send(`${base}/closure/approve`, production, "POST", {
          expected_version: preparedClosure.version,
          confirmed_archive: true,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send(`${base}/closure/approve`, responsable, "POST", {
          expected_version: preparedClosure.version,
          confirmed_archive: true,
        })
      ).status,
    ).toBe(200);
    const archived = await (
      await send(`${base}/operations`, production)
    ).json();
    expect(archived.episode.status).toBe("cloture");
    expect(archived.transcripts[0].reviewed_at).toBeTruthy();
    expect(archived.quotes[0].status).toBe("approved");
    expect(archived.closure.exceptions_json).toContain("final_poster");
    const activeResponses = await (
      await send(`${base}/feedback/responses`, production)
    ).json();
    await database.pool.query(
      "UPDATE feedback_responses SET submitted_at=now()-interval '31 days' WHERE id=$1",
      [activeResponses.items[0].id],
    );
    expect(
      (
        await send("/api/v1/feedback/retention/purge", production, "POST", {
          confirmed: true,
        })
      ).status,
    ).toBe(403);
    const eligible = await (
      await send("/api/v1/feedback/retention/purge", responsable, "POST", {})
    ).json();
    expect(eligible.eligible).toBeGreaterThanOrEqual(1);
    const purged = await (
      await send("/api/v1/feedback/retention/purge", responsable, "POST", {
        confirmed: true,
      })
    ).json();
    expect(purged.purged).toBeGreaterThanOrEqual(1);
    expect(
      (await (await send(`${base}/feedback/responses`, production)).json())
        .items,
    ).toHaveLength(2);
  });
});

afterAll(async () => {
  for (const fixture of fixtures) {
    const episodeIds = "SELECT id FROM episodes WHERE created_by=$1";
    await database.pool.query(
      `DELETE FROM feedback_responses WHERE form_id IN (SELECT id FROM feedback_forms WHERE episode_id IN (${episodeIds}))`,
      [fixture.id],
    );
    await database.pool.query(
      `DELETE FROM feedback_imports WHERE form_id IN (SELECT id FROM feedback_forms WHERE episode_id IN (${episodeIds}))`,
      [fixture.id],
    );
    await database.pool.query(
      `DELETE FROM feedback_form_versions WHERE form_id IN (SELECT id FROM feedback_forms WHERE episode_id IN (${episodeIds}))`,
      [fixture.id],
    );
    for (const table of [
      "feedback_forms",
      "episode_closures",
      "episode_quotes",
      "episode_transcripts",
      "episode_replays",
      "session_questions",
      "session_reminders",
      "session_plans",
    ])
      await database.pool.query(
        `DELETE FROM ${table} WHERE episode_id IN (${episodeIds})`,
        [fixture.id],
      );
    await database.pool.query(
      "DELETE FROM content_publications WHERE content_id IN (SELECT id FROM episode_contents WHERE episode_id IN (SELECT id FROM episodes WHERE created_by = $1))",
      [fixture.id],
    );
    await database.pool.query(
      "DELETE FROM content_revisions WHERE content_id IN (SELECT id FROM episode_contents WHERE episode_id IN (SELECT id FROM episodes WHERE created_by = $1))",
      [fixture.id],
    );
    await database.pool.query(
      "DELETE FROM episode_contents WHERE episode_id IN (SELECT id FROM episodes WHERE created_by = $1)",
      [fixture.id],
    );
    await database.pool.query(
      "DELETE FROM media_consents WHERE episode_id IN (SELECT id FROM episodes WHERE created_by = $1)",
      [fixture.id],
    );
    const fixtureAssets = await database.pool.query<{ storage_key: string }>(
      "SELECT storage_key FROM media_assets WHERE episode_id IN (SELECT id FROM episodes WHERE created_by=$1)",
      [fixture.id],
    );
    const store = createObjectStore();
    for (const item of fixtureAssets.rows)
      await store?.removeObject(item.storage_key);
    await database.pool.query(
      "DELETE FROM media_assets WHERE episode_id IN (SELECT id FROM episodes WHERE created_by = $1)",
      [fixture.id],
    );
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
    await database.pool.query(
      "DELETE FROM feedback_policies WHERE approved_by=$1",
      [fixture.id],
    );
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
