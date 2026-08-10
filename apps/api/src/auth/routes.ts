import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { loginSchema, registerSchema } from "@notes/contracts";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import {
  hashPassword,
  verifyPassword,
  verifySecretAgainstSha256,
} from "../security.js";
import {
  getAuthenticatedUser,
  issueSession,
  newUserId,
  revokeSession,
} from "./session.js";

const DUMMY_PASSWORD_HASH = await hashPassword(
  "this-password-is-never-associated-with-an-account",
);

const validationError = (
  issues: { path: PropertyKey[]; message: string }[],
) => ({
  error: "Proverite unete podatke.",
  code: "VALIDATION_ERROR",
  issues: Object.fromEntries(
    issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
  ),
});

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "23505";

const registrationAllowed = (inviteCode: string | undefined): boolean => {
  if (config.registrationMode === "open") return true;
  if (config.registrationMode === "closed") return false;
  return verifySecretAgainstSha256(
    inviteCode ?? "",
    config.registrationInviteCodeHash,
  );
};

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/config", async () => ({
    registrationMode: config.registrationMode,
  }));

  app.get("/me", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return reply.code(401).send({
        error: "Niste prijavljeni.",
        code: "UNAUTHENTICATED",
      });
    }
    return { user };
  });

  app.post(
    "/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour", ban: 3 } } },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(validationError(parsed.error.issues));
      }

      if (!registrationAllowed(parsed.data.inviteCode)) {
        await verifyPassword(parsed.data.password, DUMMY_PASSWORD_HASH);
        return reply.code(403).send({
          error: "Registracija nije dostupna sa unetim podacima.",
          code: "REGISTRATION_UNAVAILABLE",
        });
      }

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, parsed.data.email))
        .limit(1);

      if (existing.length > 0) {
        await verifyPassword(parsed.data.password, DUMMY_PASSWORD_HASH);
        return reply.code(409).send({
          error: "Nalog nije moguće kreirati sa unetim podacima.",
          code: "REGISTRATION_FAILED",
        });
      }

      const user = {
        id: newUserId(),
        name: parsed.data.name,
        email: parsed.data.email,
      };

      try {
        await db.insert(users).values({
          ...user,
          passwordHash: await hashPassword(parsed.data.password),
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({
            error: "Nalog nije moguće kreirati sa unetim podacima.",
            code: "REGISTRATION_FAILED",
          });
        }
        throw error;
      }
      await issueSession(user.id, reply);

      return reply.code(201).send({ user });
    },
  );

  app.post(
    "/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute", ban: 5 } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(validationError(parsed.error.issues));
      }

      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.email, parsed.data.email))
        .limit(1);

      const verification = await verifyPassword(
        parsed.data.password,
        userRow?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );

      if (!userRow || !verification.valid) {
        return reply.code(401).send({
          error: "Email ili lozinka nisu ispravni.",
          code: "INVALID_CREDENTIALS",
        });
      }

      if (verification.needsRehash) {
        await db
          .update(users)
          .set({
            passwordHash: await hashPassword(parsed.data.password),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userRow.id));
      }

      await issueSession(userRow.id, reply);
      return {
        user: {
          id: userRow.id,
          name: userRow.name,
          email: userRow.email,
        },
      };
    },
  );

  app.post("/logout", async (request, reply) => {
    await revokeSession(request, reply);
    reply.header("Clear-Site-Data", '"cache", "cookies", "storage"');
    return reply.code(204).send();
  });
};
