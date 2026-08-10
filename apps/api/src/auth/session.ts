import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { User } from "@notes/contracts";
import { db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
import { config } from "../config.js";
import { createSessionToken, hashSessionToken } from "../security.js";

const SECURE_SESSION_COOKIE = "__Host-notes_session";
const DEVELOPMENT_SESSION_COOKIE = "notes_session";

const activeCookieName = () =>
  config.cookieSecure ? SECURE_SESSION_COOKIE : DEVELOPMENT_SESSION_COOKIE;

export async function issueSession(
  userId: string,
  reply: FastifyReply,
): Promise<void> {
  const token = createSessionToken();
  const expiresAt = new Date(
    Date.now() + config.sessionDays * 24 * 60 * 60 * 1_000,
  );
  const tokenHash = hashSessionToken(token);

  await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"session:" + userId}, 0))`,
    );
    await transaction
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()));

    const activeSessions = await transaction
      .select({ tokenHash: sessions.tokenHash })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt));

    const overflow = activeSessions
      .slice(Math.max(0, config.maxSessionsPerUser - 1))
      .map((session) => session.tokenHash);
    if (overflow.length > 0) {
      await transaction
        .delete(sessions)
        .where(inArray(sessions.tokenHash, overflow));
    }

    await transaction.insert(sessions).values({
      tokenHash,
      userId,
      expiresAt,
    });
  });

  reply.setCookie(activeCookieName(), token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: config.cookieSecure,
    expires: expiresAt,
    priority: "high",
  });
  reply.header("Cache-Control", "no-store, private");
}

export async function revokeSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const candidateCookies = [
    request.cookies[SECURE_SESSION_COOKIE],
    request.cookies[DEVELOPMENT_SESSION_COOKIE],
  ].filter((token): token is string => Boolean(token));

  if (candidateCookies.length > 0) {
    await db
      .delete(sessions)
      .where(
        inArray(sessions.tokenHash, candidateCookies.map(hashSessionToken)),
      );
  }

  for (const cookieName of [
    SECURE_SESSION_COOKIE,
    DEVELOPMENT_SESSION_COOKIE,
  ]) {
    reply.clearCookie(cookieName, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: cookieName === SECURE_SESSION_COOKIE,
    });
  }
}

export async function getAuthenticatedUser(
  request: FastifyRequest,
): Promise<User | null> {
  const token = request.cookies[activeCookieName()];
  if (!token) {
    return null;
  }

  const [result] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return result ?? null;
}

export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<User | null> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    await reply.code(401).send({
      error: "Morate biti prijavljeni.",
      code: "UNAUTHENTICATED",
    });
    return null;
  }
  return user;
}

export function newUserId(): string {
  return randomUUID();
}
