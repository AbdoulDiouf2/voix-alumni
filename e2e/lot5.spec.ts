import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { requireIsolatedE2e } from "./require-isolated-e2e";

test.beforeAll(async ({ request }) => requireIsolatedE2e(request));
const credentials = JSON.parse(
  readFileSync(
    process.env.E2E_CREDENTIALS_FILE ??
      "/tmp/voix-alumni-lot1-credentials.json",
    "utf8",
  ),
) as Record<"RESPONSABLE" | "PRODUCTION", { email: string; password: string }>;
async function login(page: Page, role: "RESPONSABLE" | "PRODUCTION") {
  await page.goto("/");
  await page.getByLabel("Adresse e-mail").fill(credentials[role].email);
  await page.getByLabel("Mot de passe").fill(credentials[role].password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
}
async function post(page: Page, path: string, payload: unknown) {
  const response = await page.request.post(path, { data: payload });
  expect(response.ok(), `${path}: ${response.status()}`).toBe(true);
  return response.json();
}

test("Lot 5 : réunion, questionnaire public, résultat et conduite mobile", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const ownerContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1440, height: 900 },
    isMobile: testInfo.project.name === "mobile",
  });
  const owner = await ownerContext.newPage();
  await login(owner, "RESPONSABLE");
  const person = await post(owner, "/api/v1/alumni", {
    full_name: `Alumni fictif ${randomUUID().slice(0, 6)}`,
    job_title: "Responsable fictive",
    company: "Organisation fictive",
  });
  const episode = await post(owner, "/api/v1/episodes", {
    alumni_id: person.id,
  });
  const confirmed = await post(
    owner,
    `/api/v1/episodes/${episode.id}/confirm`,
    {
      expected_version: episode.version,
      start_at_local: "2026-11-10T18:00",
      event_timezone: "Europe/Paris",
    },
  );
  await post(owner, `/api/v1/episodes/${episode.id}/handoff`, {
    expected_version: confirmed.version,
  });
  const notice =
    "NOTICE FICTIVE DE RECETTE. Cette réponse anonyme est utilisée seulement dans la base E2E isolée et sera supprimée après vérification. Aucun participant réel ne doit utiliser ce lien.";
  await post(owner, "/api/v1/feedback/policy", {
    notice_text: notice,
    retention_days: 30,
    confirmed: true,
  });
  await login(page, "PRODUCTION");
  await page.goto(`/episodes/${episode.id}/session`);
  await expect(
    page.getByRole("heading", { name: "Conduite de l’épisode" }),
  ).toBeVisible();
  await page
    .getByLabel("Lien Microsoft Teams")
    .fill("https://teams.microsoft.com/l/meetup-join/fiction");
  await page.getByRole("button", { name: "Enregistrer les liens" }).click();
  await expect(page.getByText("Lien enregistré.")).toBeVisible();
  await page
    .getByRole("button", { name: "Ajouter les questions communes" })
    .click();
  await expect(
    page.getByText("Quel parcours avez-vous suivi à l’ESMT ou au CPS ?"),
  ).toBeVisible();
  await page.screenshot({
    path: `Docs/recette/lot-5/conduite-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const ops = await (
    await page.request.get(`/api/v1/episodes/${episode.id}/operations`)
  ).json();
  await post(owner, `/api/v1/episodes/${episode.id}/conductor/approve`, {
    expected_version: ops.plan.version,
  });
  await page.goto(`/episodes/${episode.id}/feedback`);
  await page
    .getByRole("button", { name: "Créer depuis le modèle standard" })
    .click();
  await expect(page.getByText("Questionnaire standard créé.")).toBeVisible();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Ouvrir le formulaire" }).click();
  await expect(page.getByText("Questionnaire ouvert.")).toBeVisible();
  await page.screenshot({
    path: `Docs/recette/lot-5/feedback-prive-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const feedback = await (
    await page.request.get(`/api/v1/episodes/${episode.id}/feedback`)
  ).json();
  const publicContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1440, height: 900 },
    isMobile: testInfo.project.name === "mobile",
  });
  const visitor = await publicContext.newPage();
  await visitor.goto(feedback.form.public_url);
  await expect(
    visitor.getByRole("heading", { name: "Votre retour sur la session" }),
  ).toBeVisible();
  await expect(visitor.getByText(notice)).toBeVisible();
  await visitor.screenshot({
    path: `Docs/recette/lot-5/formulaire-public-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await visitor.getByLabel("5", { exact: true }).check();
  await visitor.getByRole("button", { name: "Envoyer mon retour" }).click();
  await expect(
    visitor.getByText("Merci, votre réponse a été enregistrée."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 réponse(s)")).toBeVisible();
  await page.screenshot({
    path: `Docs/recette/lot-5/resultats-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const current = await (
    await owner.request.get(`/api/v1/episodes/${episode.id}`)
  ).json();
  await post(owner, `/api/v1/episodes/${episode.id}/mark-held`, {
    expected_version: current.version,
    confirmed_held: true,
  });
  await owner.goto(`/episodes/${episode.id}/session`);
  await expect(owner.getByText(/✓ Session tenue/)).toBeVisible();
  const base = `/api/v1/episodes/${episode.id}`;
  const thanks = await post(page, `${base}/contents`, { kind: "hot_thanks" });
  const editedThanks = await (
    await page.request.patch(`/api/v1/contents/${thanks.id}`, {
      data: {
        expected_version: thanks.version,
        fields: {
          feedback_url: new URL(
            feedback.form.public_url,
            "http://127.0.0.1:5174",
          ).toString(),
        },
      },
    })
  ).json();
  const reviewThanks = await post(
    page,
    `/api/v1/contents/${thanks.id}/submit`,
    { expected_version: editedThanks.version },
  );
  const approvedThanks = await post(
    owner,
    `/api/v1/contents/${thanks.id}/approve`,
    { expected_version: reviewThanks.version },
  );
  const exportedThanks = await page.request.post(
    `/api/v1/contents/${thanks.id}/export`,
    { multipart: { expected_version: String(approvedThanks.version) } },
  );
  expect(exportedThanks.ok()).toBe(true);
  const preparedThanks = await exportedThanks.json();
  await post(page, `/api/v1/contents/${thanks.id}/publish`, {
    expected_version: preparedThanks.version,
    channel: "whatsapp_community",
    confirmed_external_publication: true,
  });
  const replay = await page.request.put(`${base}/replay`, {
    data: {
      youtube_url: "https://youtu.be/abcdefghijk",
      visibility: "unlisted",
      status: "available",
      recording_rights: "granted",
      diffusion_rights: "granted",
      rights_evidence_ref: "Preuve fictive de recette",
      expected_version: null,
    },
  });
  expect(replay.ok()).toBe(true);
  const uploaded = await page.request.post(`${base}/transcripts`, {
    multipart: {
      file: {
        name: "recette.vtt",
        mimeType: "text/vtt",
        buffer: Buffer.from(
          "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nUne phrase fictive.",
        ),
      },
      language: "fr",
      provenance: "Transcription fictive E2E",
    },
  });
  expect(uploaded.status()).toBe(201);
  const transcript = await uploaded.json();
  await post(page, `${base}/transcripts/${transcript.id}/review`, {
    corrected_text: "Une phrase fictive.",
    confirmed_review: true,
  });
  const quote = await post(page, `${base}/quotes`, {
    transcript_id: transcript.id,
    exact_text: "Une phrase fictive.",
    source_ref: "recette.vtt, 00:00:01",
  });
  await post(owner, `${base}/quotes/${quote.id}/approve`, {
    expected_version: 1,
    confirmed_exact: true,
  });
  const closure = await post(page, `${base}/closure/prepare`, {
    expected_version: null,
    exceptions: {
      final_poster:
        "Affiche finale réalisée dans la recette Studio indépendante.",
      replay_message:
        "Diffusion du message de replay reportée pour cette recette.",
    },
  });
  await post(owner, `${base}/closure/approve`, {
    expected_version: closure.version,
    confirmed_archive: true,
  });
  await owner.reload();
  await expect(owner.getByText("État : clôturée")).toBeVisible();
  await expect(owner.getByText("Dérogations consignées")).toBeVisible();
  await owner.screenshot({
    path: `Docs/recette/lot-5/episode-archive-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(
    (
      await request.get(`/api/v1/episodes/${episode.id}/feedback/responses`)
    ).status(),
  ).toBe(401);
  await publicContext.close();
  await ownerContext.close();
});
