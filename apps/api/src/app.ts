import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { authRoutes } from "./auth/routes.js";
import { notesRoutes } from "./notes/routes.js";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp() {
  const app = Fastify({
    logger:
      config.nodeEnv === "test"
        ? false
        : {
            level: config.nodeEnv === "production" ? "info" : "debug",
            redact: {
              paths: [
                "req.headers.cookie",
                "req.headers.authorization",
                "request.headers.cookie",
                "password",
                "*.password",
                "*.inviteCode",
              ],
              censor: "[REDACTED]",
            },
          },
    bodyLimit: config.maxNoteBytes + 50_000,
    connectionTimeout: 10_000,
    requestTimeout: 20_000,
    keepAliveTimeout: 5_000,
    maxRequestsPerSocket: 1_000,
    trustProxy: config.trustProxy,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    ban: 5,
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!stateChangingMethods.has(request.method)) return;

    const fetchSite = request.headers["sec-fetch-site"];
    const origin = request.headers.origin?.replace(/\/$/, "");
    if (
      fetchSite === "cross-site" ||
      (origin !== undefined && !config.publicOrigins.includes(origin))
    ) {
      return reply.code(403).send({
        error: "Poreklo zahteva nije dozvoljeno.",
        code: "ORIGIN_REJECTED",
      });
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store, private");
      reply.header("Pragma", "no-cache");
      reply.header("X-Content-Type-Options", "nosniff");
    }
    return payload;
  });

  app.get("/api/health", async () => ({ status: "ok" }));
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(notesRoutes, { prefix: "/api/notes" });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const errorMessage =
      error instanceof Error ? error.message : "Neispravan zahtev.";
    const reportedStatus =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;
    const statusCode =
      reportedStatus && reportedStatus >= 400 && reportedStatus < 500
        ? reportedStatus
        : 500;
    return reply.code(statusCode).send({
      error:
        statusCode === 429
          ? "Previše zahteva. Sačekajte i pokušajte ponovo."
          : statusCode < 500
            ? errorMessage
            : "Došlo je do neočekivane greške.",
      code: statusCode === 429 ? "RATE_LIMITED" : "REQUEST_FAILED",
    });
  });

  return app;
}
