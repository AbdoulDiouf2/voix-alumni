import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  account,
  organizerMemberships,
  securityEvents,
  session,
  user,
} from "@voix-alumni/db/schema";
import { createDatabase } from "@voix-alumni/db";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

const command = process.argv[2];
const args = Object.fromEntries(
  process.argv
    .slice(3)
    .filter((arg) => arg.includes("="))
    .map((arg) => {
      const i = arg.indexOf("=");
      return [arg.slice(0, i).replace(/^--/, ""), arg.slice(i + 1)];
    }),
);
const email = args.email?.trim().toLowerCase();
const role = args.role;
const name = args.name?.trim();
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  throw new Error("DATABASE_URL et --email=adresse-valide sont requis");
}
if (
  !(["provision", "reset", "revoke"] as const).includes(
    command as "provision" | "reset" | "revoke",
  )
) {
  throw new Error("Commande attendue : provision, reset ou revoke");
}
const database = createDatabase(databaseUrl);

try {
  if (command === "revoke") {
    const [target] = await database.db
      .select()
      .from(user)
      .where(eq(user.email, email));
    if (!target) throw new Error("Compte introuvable");
    await database.db.transaction(async (tx) => {
      await tx
        .update(organizerMemberships)
        .set({ active: false })
        .where(eq(organizerMemberships.userId, target.id));
      await tx.delete(session).where(eq(session.userId, target.id));
      await tx.insert(securityEvents).values({
        id: randomUUID(),
        userId: target.id,
        action: "ACCESS_REVOKED",
      });
    });
    process.stdout.write("Accès révoqué et sessions supprimées.\n");
  } else {
    if (process.stdin.isTTY)
      throw new Error(
        "Transmettre le mot de passe par stdin, sans l'afficher dans la commande",
      );
    const password = readFileSync(0, "utf8").trimEnd();
    if (password.length < 16 || password.length > 128)
      throw new Error("Mot de passe requis : 16 à 128 caractères");
    const passwordHash = await hashPassword(password);
    if (command === "provision") {
      if (
        !name ||
        !(["RESPONSABLE", "PRODUCTION"] as const).includes(
          role as "RESPONSABLE" | "PRODUCTION",
        )
      ) {
        throw new Error("--name et --role=RESPONSABLE|PRODUCTION sont requis");
      }
      await database.db.transaction(async (tx) => {
        const [existingRole] = await tx
          .select()
          .from(organizerMemberships)
          .where(
            and(
              eq(
                organizerMemberships.role,
                role as "RESPONSABLE" | "PRODUCTION",
              ),
              eq(organizerMemberships.active, true),
            ),
          );
        if (existingRole) throw new Error("Ce rôle possède déjà un compte");
        const [existingEmail] = await tx
          .select()
          .from(user)
          .where(eq(user.email, email));
        if (existingEmail)
          throw new Error("Cette adresse possède déjà un compte");
        const userId = randomUUID();
        await tx
          .insert(user)
          .values({ id: userId, name, email, emailVerified: false });
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
        });
        await tx
          .insert(organizerMemberships)
          .values({ userId, role: role as "RESPONSABLE" | "PRODUCTION" });
        await tx
          .insert(securityEvents)
          .values({ id: randomUUID(), userId, action: "ACCOUNT_PROVISIONED" });
      });
      process.stdout.write("Compte autorisé créé.\n");
    } else {
      const [target] = await database.db
        .select()
        .from(user)
        .where(eq(user.email, email));
      if (!target) throw new Error("Compte introuvable");
      const [membership] = await database.db
        .select()
        .from(organizerMemberships)
        .where(eq(organizerMemberships.userId, target.id));
      if (!membership?.active)
        throw new Error(
          "Compte révoqué : restauration administrative préalable requise",
        );
      await database.db.transaction(async (tx) => {
        const [credential] = await tx
          .select()
          .from(account)
          .where(
            and(
              eq(account.userId, target.id),
              eq(account.providerId, "credential"),
            ),
          );
        if (credential)
          await tx
            .update(account)
            .set({ password: passwordHash })
            .where(eq(account.id, credential.id));
        else
          await tx.insert(account).values({
            id: randomUUID(),
            accountId: target.id,
            providerId: "credential",
            userId: target.id,
            password: passwordHash,
          });
        await tx.delete(session).where(eq(session.userId, target.id));
        await tx.insert(securityEvents).values({
          id: randomUUID(),
          userId: target.id,
          action: "PASSWORD_RESET",
        });
      });
      process.stdout.write("Mot de passe remplacé et sessions supprimées.\n");
    }
  }
} finally {
  await database.pool.end();
}
