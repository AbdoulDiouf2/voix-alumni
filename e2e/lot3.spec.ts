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
test("parcours partagé Responsable et Production", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  await login(page, "RESPONSABLE");
  const headers = { "content-type": "application/json" };
  const personResponse = await page.request.post("/api/v1/alumni", {
    headers,
    data: {
      full_name: `Lot 3 Recette ${randomUUID().slice(0, 6)}`,
      job_title: "Directrice",
      company: "Entreprise fictive",
    },
  });
  expect(personResponse.status()).toBe(201);
  const person = await personResponse.json();
  const contact = await page.request.post(
    `/api/v1/alumni/${person.id}/contact-events`,
    { headers, data: { status: "contacte", expected_version: person.version } },
  );
  expect(contact.status()).toBe(200);
  const episodeResponse = await page.request.post("/api/v1/episodes", {
    headers,
    data: { alumni_id: person.id },
  });
  expect(episodeResponse.status()).toBe(201);
  const episode = await episodeResponse.json();
  const confirm = await page.request.post(
    `/api/v1/episodes/${episode.id}/confirm`,
    {
      headers,
      data: {
        expected_version: episode.version,
        start_at_local: "2026-11-10T18:00",
        event_timezone: "Europe/Paris",
      },
    },
  );
  expect(confirm.status()).toBe(200);
  const handed = await page.request.post(
    `/api/v1/episodes/${episode.id}/handoff`,
    { headers, data: { expected_version: (await confirm.json()).version } },
  );
  expect(handed.status()).toBe(200);
  await page.goto(`/episodes/${episode.id}`);
  await expect(page.getByText("Parcours de l’épisode")).toBeVisible();
  const initial = await (
    await page.request.get(`/api/v1/episodes/${episode.id}/workflow`)
  ).json();
  expect(initial.stages[0].state).toBe("en_cours");
  expect(initial.stages[1].state).toBe("taches_terminees");
  expect(
    (
      await page.request.post(
        `/api/v1/episodes/${episode.id}/stages/1/validate`,
        { headers, data: { expected_version: initial.stages[0].version } },
      )
    ).status(),
  ).toBe(409);
  await page
    .locator(".lot3-stages > details")
    .first()
    .locator("> summary")
    .click();
  await page
    .getByLabel("Statut de Créer et vérifier la fiche intervenant")
    .selectOption("terminee");
  await page
    .locator(".lot3-stages > details")
    .first()
    .getByRole("button", { name: "Valider l’étape" })
    .click();
  await expect(
    page.locator(".lot3-stages > details").first().locator("> summary"),
  ).toContainText("Étape validée");
  const stageTwo = page.locator(".lot3-stages > details").nth(1);
  if (
    !(await stageTwo.evaluate(
      (element) => (element as HTMLDetailsElement).open,
    ))
  )
    await stageTwo.locator("> summary").click();
  await stageTwo.getByRole("button", { name: "Valider l’étape" }).click();
  await expect(stageTwo.locator("> summary")).toContainText("Étape validée");
  const production = await browser.newContext({
    viewport:
      testInfo.project.name === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
  });
  const productionPage = await production.newPage();
  await login(productionPage, "PRODUCTION");
  await productionPage.goto(`/episodes/${episode.id}`);
  await expect(productionPage.getByText("Dossier reçu.")).toBeVisible();
  await expect(
    productionPage.locator(".lot3-stages > details").nth(2),
  ).toHaveAttribute("open", "");
  await productionPage
    .getByLabel("Statut de Vérifier le profil et les sources")
    .selectOption("terminee");
  await expect(
    productionPage.getByText(/5\/24 tâches terminées/),
  ).toBeVisible();
  const profileTask = productionPage
    .locator("article.lot3-task")
    .filter({ hasText: "Vérifier le profil et les sources" });
  await profileTask.getByText("Adapter la tâche").click();
  await profileTask
    .getByLabel("Intitulé")
    .fill("Vérifier le profil et les sources fiables");
  await profileTask.getByLabel(/Échéance/).fill("09/11/2026 18:00");
  await profileTask
    .getByRole("button", { name: "Enregistrer la tâche" })
    .click();
  await expect(profileTask.locator("strong").first()).toHaveText(
    "Vérifier le profil et les sources fiables",
  );
  await productionPage.getByText(/Demandes internes · 0 en attente/).click();
  await productionPage.getByLabel("Objet").fill("Intitulé exact");
  await productionPage
    .getByRole("textbox", { name: "Question", exact: true })
    .fill("Quel est l’intitulé exact du poste ?");
  await productionPage
    .getByRole("button", { name: "Envoyer à la Responsable" })
    .click();
  await expect(
    productionPage
      .locator(".lot3-request strong")
      .filter({ hasText: "Intitulé exact" }),
  ).toBeVisible();
  await page.goto("/");
  const noticeRow = page
    .locator(".lot2-related")
    .filter({ has: page.locator(`a[href="/episodes/${episode.id}"]`) })
    .filter({ hasText: "Nouvelle demande de précision" });
  await expect(noticeRow).toBeVisible();
  await noticeRow.getByRole("button", { name: "Marquer comme lu" }).click();
  await page.reload();
  await expect(noticeRow).toBeVisible();
  await expect(
    noticeRow.getByRole("button", { name: "Marquer comme lu" }),
  ).toHaveCount(0);
  await page.goto(`/episodes/${episode.id}`);
  await page.reload();
  await page
    .getByLabel("Réponse à Intitulé exact")
    .fill("Directrice des opérations");
  await page.getByRole("button", { name: "Répondre" }).click();
  await productionPage.reload();
  await productionPage.getByRole("button", { name: "Résoudre" }).click();
  await expect(
    productionPage
      .locator(".lot3-request small")
      .filter({ hasText: "résolue" }),
  ).toBeVisible();
  await productionPage.getByText(/Historique du parcours/).click();
  await expect(productionPage.getByText("Demande résolue")).toBeVisible();
  await expect(
    productionPage.getByText(/request\.resolve|task\.updated/),
  ).toHaveCount(0);
  const currentEpisode = await (
    await page.request.get(`/api/v1/episodes/${episode.id}`)
  ).json();
  const reported = await page.request.post(
    `/api/v1/episodes/${episode.id}/reschedule`,
    {
      headers,
      data: {
        expected_version: currentEpisode.version,
        start_at_local: "2026-11-12T18:00",
        event_timezone: "Europe/Paris",
        reason: "Report fictif de recette",
      },
    },
  );
  expect(reported.status()).toBe(200);
  const during = await (
    await page.request.get(`/api/v1/episodes/${episode.id}/workflow`)
  ).json();
  expect(
    during.tasks.find(
      (task: { definition_key: string }) => task.definition_key === "affiche",
    ).due_at,
  ).toBeNull();
  const reconfirmed = await page.request.post(
    `/api/v1/episodes/${episode.id}/confirm`,
    {
      headers,
      data: {
        expected_version: (await reported.json()).version,
        start_at_local: "2026-11-12T18:00",
        event_timezone: "Europe/Paris",
      },
    },
  );
  expect(reconfirmed.status()).toBe(200);
  const after = await (
    await page.request.get(`/api/v1/episodes/${episode.id}/workflow`)
  ).json();
  expect(
    after.tasks.find(
      (task: { definition_key: string }) => task.definition_key === "affiche",
    ).due_at,
  ).toBe("2026-11-05T17:00:00.000Z");
  await productionPage.reload();
  if (testInfo.project.name === "mobile") {
    await productionPage.evaluate(() =>
      window.scrollTo(0, document.body.scrollHeight),
    );
    await expect(productionPage.locator(".mobile-bar")).toBeVisible();
    const summary = productionPage.locator(".lot3-overview");
    await summary.scrollIntoViewIfNeeded();
    await expect(summary).toBeVisible();
  }
  await productionPage.evaluate(() => window.scrollTo(0, 0));
  await productionPage.screenshot({
    path: `Docs/recette/lot-3/parcours-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await productionPage.locator(".lot3-workflow").screenshot({
    path: `Docs/recette/lot-3/parcours-detail-${testInfo.project.name}.png`,
  });
  await production.close();
});
