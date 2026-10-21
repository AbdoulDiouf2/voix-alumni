import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const credentials = JSON.parse(
  readFileSync(
    process.env.E2E_CREDENTIALS_FILE ??
      "/tmp/voix-alumni-lot1-credentials.json",
    "utf8",
  ),
) as Record<"RESPONSABLE" | "PRODUCTION", { email: string; password: string }>;

async function login(
  page: import("@playwright/test").Page,
  role: "RESPONSABLE" | "PRODUCTION",
) {
  await page.goto("/");
  await page.getByLabel("Adresse e-mail").fill(credentials[role].email);
  await page.getByLabel("Mot de passe").fill(credentials[role].password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
  const displayName = await page.evaluate(async () => {
    const response = await fetch("/api/v1/me", { credentials: "include" });
    const account = (await response.json()) as { name: string };
    return account.name.trim().split(/\s+/)[0];
  });
  await expect(
    page.getByRole("heading", {
      name: displayName ? `Bonjour, ${displayName}` : "Bonjour à vous",
    }),
  ).toBeVisible();
  await expect(page.locator(".quick-card .role-badge")).toHaveText(
    role === "RESPONSABLE" ? "Responsable" : "Production",
  );
  await expect(page.getByText("Aucun épisode pour le moment")).toBeVisible();
}

test("anonymous visitor sees login and cannot access account pages", async ({
  page,
}, testInfo) => {
  await page.goto("/episodes");
  await expect(
    page.getByRole("heading", { name: "Bienvenue au Studio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Se connecter" }),
  ).toBeVisible();
  if (testInfo.project.name === "mobile") {
    const passwordBottom = await page
      .getByLabel("Mot de passe")
      .evaluate((element) => element.getBoundingClientRect().bottom);
    expect(passwordBottom).toBeLessThan(page.viewportSize()!.height);
  }
  await page.screenshot({
    path: `Docs/recette/lot-1/login-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Adresse e-mail").fill("unknown@example.invalid");
  await page.getByLabel("Mot de passe").fill("incorrect-password");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toContainText("non autorisé");
});

test("responsable sees role dashboard, navigation and logout", async ({
  page,
}, testInfo) => {
  await login(page, "RESPONSABLE");
  await page.screenshot({
    path: `Docs/recette/lot-1/responsable-${testInfo.project.name}.png`,
    fullPage: true,
  });
  if (testInfo.project.name === "desktop") {
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Épisodes" })
      .click();
  } else {
    await page
      .getByRole("navigation", { name: "Navigation mobile" })
      .getByRole("link", { name: "Épisodes" })
      .click();
  }
  await expect(page.getByRole("heading", { name: "Épisodes" })).toBeVisible();
  await expect(page.getByText("Aucun épisode enregistré.")).toBeVisible();
  await page.screenshot({
    path: `Docs/recette/lot-1/episodes-${testInfo.project.name}.png`,
    fullPage: true,
  });
  if (testInfo.project.name === "desktop") {
    await page.getByRole("button", { name: "Se déconnecter" }).click();
  } else {
    await page.getByRole("button", { name: "Plus" }).click();
    await page.getByRole("button", { name: "Se déconnecter" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Bienvenue au Studio" }),
  ).toBeVisible();
});

test("production sees its own dashboard and responsive navigation", async ({
  page,
}, testInfo) => {
  await login(page, "PRODUCTION");
  await page.screenshot({
    path: `Docs/recette/lot-1/production-${testInfo.project.name}.png`,
    fullPage: true,
  });
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Plus" }).click();
    await page.getByRole("link", { name: "Feedback" }).click();
  } else {
    await page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Feedback" })
      .click();
  }
  await expect(page.getByRole("heading", { name: "Feedback" })).toBeVisible();
  await expect(
    page.getByText(
      "Le formulaire natif et les réponses seront disponibles au Lot 5.",
    ),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("dashboard uses a neutral greeting when the account name is empty", async ({
  page,
}) => {
  await login(page, "RESPONSABLE");
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "fallback-fixture",
        name: "  ",
        email: "fallback@example.invalid",
        role: "RESPONSABLE",
      }),
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bonjour à vous" }),
  ).toBeVisible();
  await expect(page.locator(".quick-card .role-badge")).toHaveText(
    "Responsable",
  );
});
