import { expect, type APIRequestContext } from "@playwright/test";

/** Refuse toute mutation navigateur sur l'environnement normal de développement. */
export async function requireIsolatedE2e(request: APIRequestContext) {
  const response = await request.get("/api/capabilities");
  expect(response.ok(), "Le serveur E2E dédié doit être disponible").toBe(true);
  const capabilities = (await response.json()) as { isolatedE2e?: boolean };
  expect(
    capabilities.isolatedE2e,
    "Playwright doit viser une API connectée à voix_alumni_e2e",
  ).toBe(true);
}
