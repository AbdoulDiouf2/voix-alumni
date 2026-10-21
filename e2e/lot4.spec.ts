import { createHash, randomUUID } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
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
async function fixturePng(page: Page, label: string) {
  const encoded = await page.evaluate((name) => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 700;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#d2b9a4";
    ctx.fillRect(0, 0, 700, 700);
    ctx.fillStyle = "#472e24";
    ctx.font = "bold 70px Arial";
    ctx.textAlign = "center";
    ctx.fillText(name, 350, 340);
    ctx.font = "32px Arial";
    ctx.fillText("FICTIF · TEST", 350, 390);
    return canvas.toDataURL("image/png").split(",")[1];
  }, label);
  return Buffer.from(encoded, "base64");
}
test("Lot 4 : deux affiches et communications versionnées", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const responsibleContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 1440, height: 900 },
    isMobile: testInfo.project.name === "mobile",
  });
  const responsible = await responsibleContext.newPage();
  await login(responsible, "RESPONSABLE");
  const send = async (path: string, data: unknown) =>
    responsible.request.post(`/api/v1${path}`, {
      headers: { "content-type": "application/json" },
      data,
    });
  const personResponse = await send("/alumni", {
    full_name: `Ézéchiel Essai ${randomUUID().slice(0, 5)}`,
    promotion_year: "2014",
    job_title: "Responsable des partenariats et de l’innovation technologique",
    company: "Organisation fictive",
  });
  expect(personResponse.status()).toBe(201);
  const person = await personResponse.json();
  const episode = await (
    await send("/episodes", { alumni_id: person.id })
  ).json();
  const confirmed = await (
    await send(`/episodes/${episode.id}/confirm`, {
      expected_version: episode.version,
      start_at_local: "2026-11-10T18:00",
      event_timezone: "Europe/Paris",
    })
  ).json();
  expect(
    (
      await send(`/episodes/${episode.id}/handoff`, {
        expected_version: confirmed.version,
      })
    ).status(),
  ).toBe(200);
  await login(page, "PRODUCTION");
  const base = `/api/v1/episodes/${episode.id}`;
  const portrait = await fixturePng(page, "PORTRAIT");
  const logo = await fixturePng(page, "LOGO TEST");
  const upload = async (kind: string, buffer: Buffer) => {
    const result = await page.request.post(`${base}/assets`, {
      multipart: {
        kind,
        file: { name: `fixture-${kind}.png`, mimeType: "image/png", buffer },
      },
    });
    expect(result.status()).toBe(201);
    return result.json();
  };
  const portraitAsset = await upload("portrait", portrait);
  const esmt = await upload("logo_esmt", logo);
  const cps = await upload("logo_cps", logo);
  for (const asset of [portraitAsset, esmt, cps])
    expect(
      (
        await responsible.request.patch(`/api/v1/assets/${asset.id}/rights`, {
          data: {
            expected_version: 1,
            status: "granted",
            evidence_ref: "Fixture de recette isolée",
          },
        })
      ).status(),
    ).toBe(200);
  for (const purpose of ["portrait_announcement", "portrait_thank_you"])
    expect(
      (
        await responsible.request.post(`${base}/consents`, {
          data: {
            asset_id: portraitAsset.id,
            purpose,
            status: "granted",
            scope: "Recette fictive isolée",
            evidence_ref: "Fixture de recette isolée",
          },
        })
      ).status(),
    ).toBe(201);
  mkdirSync("Docs/recette/lot-4", { recursive: true });
  for (const [kind, label] of [
    ["announcement_poster", "annonce"],
    ["thank_you_poster", "merci"],
  ] as const) {
    const created = await (
      await page.request.post(`${base}/contents`, { data: { kind } })
    ).json();
    const fields: Record<string, string> = {
      logo_esmt_asset_id: esmt.id,
      logo_cps_asset_id: cps.id,
    };
    if (kind === "thank_you_poster") {
      fields.quote = "Un partage riche en conseils et en perspectives.";
      fields.quote_approved = "true";
    }
    const edited = await (
      await page.request.patch(`/api/v1/contents/${created.id}`, {
        data: {
          expected_version: created.version,
          portrait_asset_id: portraitAsset.id,
          fields,
        },
      })
    ).json();
    const reviewed = await (
      await page.request.post(`/api/v1/contents/${created.id}/submit`, {
        data: { expected_version: edited.version },
      })
    ).json();
    expect(
      (
        await responsible.request.post(
          `/api/v1/contents/${created.id}/approve`,
          { data: { expected_version: reviewed.version } },
        )
      ).status(),
    ).toBe(200);
    await page.goto(`/studio?episode=${episode.id}`);
    await expect(
      page.getByRole("heading", { name: "Studio créatif" }),
    ).toBeVisible();
    await page.getByLabel("Versions de cet épisode").selectOption(created.id);
    await expect(
      page.locator("canvas[aria-label='Aperçu de l’affiche 4:5']"),
    ).toBeVisible();
    await expect(page.locator("canvas[data-ready='ready']")).toBeVisible();
    await expect(page.getByText("Portrait manquant")).toHaveCount(0);
    await expect(page.getByText("Logo ESMT officiel manquant")).toHaveCount(0);
    const before = await page
      .locator("canvas")
      .evaluate(
        (canvas) =>
          (canvas as HTMLCanvasElement).toDataURL("image/png").split(",")[1],
      );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exporter PNG 1080 × 1350" }).click(),
    ]);
    const target = `Docs/recette/lot-4/fixture-${label}-${testInfo.project.name}.png`;
    await download.saveAs(target);
    const png = readFileSync(target);
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(1350);
    const exportedPixels = await sharp(png).ensureAlpha().raw().toBuffer();
    const previewPixels = await sharp(Buffer.from(before, "base64"))
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(createHash("sha256").update(exportedPixels).digest("hex")).toBe(
      createHash("sha256").update(previewPixels).digest("hex"),
    );
    await expect(
      page
        .locator(".creative-grid .creative-panel")
        .first()
        .getByText("Exporté / prêt à publier"),
    ).toBeVisible();
    await page.screenshot({
      path: `Docs/recette/lot-4/studio-${label}-${testInfo.project.name}.png`,
      fullPage: true,
    });
  }
  await page.goto(`/communications?episode=${episode.id}`);
  await page.getByLabel("Nouveau contenu").selectOption("announcement_message");
  await page.getByRole("button", { name: "Créer un brouillon" }).click();
  await expect(page.getByText("Aperçu WhatsApp")).toBeVisible();
  const messageId = await page
    .getByLabel("Versions de cet épisode")
    .inputValue();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copier le texte" }).click();
  await expect(
    page.getByText("Texte copié. La publication n’a pas changé d’état."),
  ).toBeVisible();
  const copied = await (
    await page.request.get(`/api/v1/episodes/${episode.id}/creative`)
  ).json();
  expect(
    copied.contents.find((item: { id: string }) => item.id === messageId)
      .status,
  ).toBe("brouillon");
  await page.getByRole("button", { name: "Soumettre à relecture" }).click();
  const submitted = await (
    await page.request.get(`/api/v1/episodes/${episode.id}/creative`)
  ).json();
  const review = submitted.contents.find(
    (item: { id: string }) => item.id === messageId,
  );
  expect(
    (
      await responsible.request.post(`/api/v1/contents/${messageId}/approve`, {
        data: { expected_version: review.version },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page.getByLabel("Versions de cet épisode").selectOption(messageId);
  await page.getByRole("button", { name: "Marquer prêt à publier" }).click();
  await page.screenshot({
    path: `Docs/recette/lot-4/messages-${testInfo.project.name}.png`,
    fullPage: true,
  });
  if (testInfo.project.name === "mobile") {
    const publishButton = page.getByRole("button", {
      name: "Marquer comme publié",
    });
    await publishButton.scrollIntoViewIfNeeded();
    expect(
      await publishButton.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        return document.elementFromPoint(x, y) === button;
      }),
    ).toBe(true);
  }
  let dialogCount = 0;
  page.on("dialog", (dialog) => {
    dialogCount += 1;
    void dialog.accept(dialogCount === 1 ? "whatsapp_community" : undefined);
  });
  await page.getByRole("button", { name: "Marquer comme publié" }).click();
  await expect(
    page
      .locator(".creative-grid .creative-panel")
      .first()
      .getByText("Publié manuellement"),
  ).toBeVisible();
  expect(dialogCount).toBe(2);
  const published = await (
    await page.request.get(`/api/v1/contents/${messageId}/history`)
  ).json();
  expect(published.publications).toHaveLength(1);
  expect(published.publications[0].channel).toBe("whatsapp_community");
  await page.goto(`/studio?episode=${episode.id}`);
  await page.getByLabel("Nouveau contenu").selectOption("announcement_poster");
  await page.getByRole("button", { name: "Créer un brouillon" }).click();
  await page.getByLabel("Nom", { exact: true }).fill("Éléonore ".repeat(28));
  await expect(page.getByText("Nom trop long pour l’affiche")).toBeVisible();
  await responsibleContext.close();
});
