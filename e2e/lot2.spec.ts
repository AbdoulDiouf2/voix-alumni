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

async function createAlumni(page: Page, name: string, job = "", company = "") {
  await page.goto("/intervenants");
  await page.getByRole("link", { name: "Ajouter un intervenant" }).click();
  await page.getByLabel("Nom et prénom *").fill(name);
  if (job) await page.getByLabel("Poste").fill(job);
  if (company) await page.getByLabel("Entreprise").fill(company);
  await page.getByRole("button", { name: "Créer la fiche" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("scénario A : vivier sans épisode, édition puis sélection ultérieure", async ({
  page,
}, testInfo) => {
  const name = `Aminata Recette ${randomUUID().slice(0, 6)}`;
  await login(page, "RESPONSABLE");
  await createAlumni(page, name);
  await expect(
    page.getByText("Aucun épisode. Ce profil reste disponible dans le vivier."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.screenshot({
    path: `Docs/recette/lot-2/scenario-a-vivier-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Modifier" }).click();
  await page.getByLabel("Poste").fill("Ingénieure qualité");
  await page.getByLabel("Entreprise").fill("Organisation fictive");
  await page
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(
    page.getByText("Ingénieure qualité", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Prévoir un épisode" }).click();
  await page.getByLabel("Titre").fill("Un parcours à découvrir");
  await page.getByRole("button", { name: "Créer la proposition" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Date à confirmer").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Un parcours à découvrir").first()).toBeVisible();
  await page.screenshot({
    path: `Docs/recette/lot-2/scenario-a-episode-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("scénario B : confirmation, relais puis lecture par Production", async ({
  page,
}, testInfo) => {
  const name = `Moussa Relais ${randomUUID().slice(0, 6)}`;
  await login(page, "RESPONSABLE");
  await createAlumni(page, name, "Chef de projet", "Structure fictive");
  await page.getByLabel("Nouveau statut de relation").selectOption("interesse");
  await page.getByRole("button", { name: "Enregistrer le constat" }).click();
  await expect(
    page.getByText("Contact enregistré dans l’historique."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Prévoir un épisode" }).click();
  await page.getByLabel("Titre").fill("Rencontre de recette");
  await page.getByLabel("Date envisagée").fill("31/02/2026 18:00");
  await page.getByRole("button", { name: "Créer la proposition" }).click();
  await expect(
    page.getByText("Saisissez une date valide au format jj/mm/aaaa HH:mm."),
  ).toBeVisible();
  await page.getByLabel("Date envisagée").fill("08/11/2026 18:00");
  await page.getByRole("button", { name: "Créer la proposition" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("button", { name: "Confirmer la session" }).click();
  await expect(
    page.getByText("Participation et horaire confirmés par la Responsable."),
  ).toBeVisible();
  await expect(page.getByText("Date à vérifier")).toHaveCount(0);
  await expect(
    page.getByText(/08\/11\/2026 à 18:00.*Europe\/Paris/).first(),
  ).toBeVisible();
  await expect(page.getByText("Reports enregistrés")).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("button", { name: "Transmettre à la Production" })
    .click();
  await expect(
    page.getByText("Dossier transmis à la Production."),
  ).toBeVisible();
  await page.screenshot({
    path: `Docs/recette/lot-2/scenario-b-responsable-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.context().clearCookies();
  await login(page, "PRODUCTION");
  await page.goto("/episodes");
  await expect(
    page.getByRole("heading", { name: "Dossiers transmis à la Production" }),
  ).toBeVisible();
  await page
    .locator(".lot2-inbox")
    .getByRole("link", { name: new RegExp(name) })
    .click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Chef de projet", { exact: true })).toBeVisible();
  await expect(page.getByText("Dossier reçu.")).toBeVisible();
  await expect(
    page.getByText("Portrait et droits d'usage à vérifier"),
  ).toBeVisible();
  await expect(page.getByText("Date à vérifier")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Dossier reçu.")).toBeVisible();
  await page.screenshot({
    path: `Docs/recette/lot-2/scenario-b-production-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("la navigation mobile laisse les actions des formulaires accessibles", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await login(page, "RESPONSABLE");
  for (const path of ["/intervenants/nouveau", "/episodes/nouveau"]) {
    await page.goto(path);
    const action = page.locator(".lot2-form .lot2-actions button").last();
    await action.scrollIntoViewIfNeeded();
    const actionBox = await action.boundingBox();
    const navigationBox = await page.locator(".mobile-bar").boundingBox();
    expect(actionBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    expect(actionBox!.y + actionBox!.height).toBeLessThan(navigationBox!.y - 4);
  }
});
