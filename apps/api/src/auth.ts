import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { randomUUID } from "node:crypto";
import { createDatabase } from "@voix-alumni/db";
import * as schema from "@voix-alumni/db/schema";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:5173";

if (!databaseUrl || !secret || secret.length < 32) {
  throw new Error(
    "DATABASE_URL et BETTER_AUTH_SECRET (32 caractères minimum) sont requis",
  );
}
if (
  process.env.APP_ENV === "e2e" &&
  new URL(databaseUrl).pathname !== "/voix_alumni_e2e"
) {
  throw new Error("L'environnement E2E exige la base voix_alumni_e2e");
}

export const database = createDatabase(databaseUrl);

export function configuredGoogleProvider(
  clientId?: string,
  clientSecret?: string,
) {
  if (!clientId || !clientSecret) return undefined;
  return {
    clientId,
    clientSecret,
    disableSignUp: true,
    disableImplicitSignUp: true,
    requireEmailVerification: true,
  };
}

const googleProvider = configuredGoogleProvider(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
);

export const auth = betterAuth({
  baseURL,
  secret,
  database: drizzleAdapter(database.db, { provider: "pg", schema }),
  trustedOrigins: [new URL(baseURL).origin],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  socialProviders: googleProvider ? { google: googleProvider } : {},
  account: { accountLinking: { disableImplicitLinking: true } },
  user: {
    validateUserInfo: async ({ user, source }) => {
      if (source.oauth?.providerId !== "google") return;
      if (!user.email)
        return {
          error: "access_denied",
          errorDescription: "Compte non autorisé",
        };
      const [existing] = await database.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.email, user.email.toLowerCase()));
      if (!existing)
        return {
          error: "access_denied",
          errorDescription: "Compte non autorisé",
        };
      const [membership] = await database.db
        .select()
        .from(schema.organizerMemberships)
        .where(eq(schema.organizerMemberships.userId, existing.id));
      if (!membership?.active)
        return {
          error: "access_denied",
          errorDescription: "Compte non autorisé",
        };
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [membership] = await database.db
            .select()
            .from(schema.organizerMemberships)
            .where(eq(schema.organizerMemberships.userId, session.userId));
          if (!membership?.active)
            throw new APIError("FORBIDDEN", { message: "Compte non autorisé" });
        },
        after: async (session) => {
          await database.db.insert(schema.securityEvents).values({
            id: randomUUID(),
            userId: session.userId,
            action: "SESSION_CREATED",
          });
        },
      },
      delete: {
        after: async (session) => {
          await database.db.insert(schema.securityEvents).values({
            id: randomUUID(),
            userId: session.userId,
            action: "SESSION_ENDED",
          });
        },
      },
    },
  },
  rateLimit: {
    enabled: process.env.NODE_ENV !== "test" && process.env.APP_ENV !== "e2e",
    customRules:
      process.env.APP_ENV === "development"
        ? { "/sign-in/email": { window: 10, max: 20 } }
        : {},
  },
});
