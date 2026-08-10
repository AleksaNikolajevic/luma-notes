import { readFileSync } from "node:fs";

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Nedostaje obavezna promenljiva okruženja: ${name}`);
  }
  return value;
};

const integer = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} mora biti ceo broj između ${minimum} i ${maximum}.`,
    );
  }
  return value;
};

const secretFromFile = (name: string): string | undefined => {
  const path = process.env[name];
  if (!path) return undefined;
  const value = readFileSync(path, "utf8").trim();
  if (!value) {
    throw new Error(`Secret fajl iz ${name} je prazan.`);
  }
  return value;
};

const buildDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const password =
    secretFromFile("DB_PASSWORD_FILE") ?? process.env.DB_PASSWORD;
  if (password) {
    const host = process.env.DB_HOST ?? "localhost";
    const port = process.env.DB_PORT ?? "5432";
    const database = process.env.DB_NAME ?? "notes";
    const user = process.env.DB_USER ?? "notes";
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
  }

  return required("DATABASE_URL ili DB_PASSWORD_FILE");
};

const registrationModeValue = process.env.REGISTRATION_MODE ?? "closed";
if (!["closed", "invite", "open"].includes(registrationModeValue)) {
  throw new Error("REGISTRATION_MODE mora biti closed, invite ili open.");
}

const inviteCodeHash = process.env.REGISTRATION_INVITE_CODE_HASH?.toLowerCase();
if (
  registrationModeValue === "invite" &&
  (!inviteCodeHash || !/^[a-f0-9]{64}$/.test(inviteCodeHash))
) {
  throw new Error(
    "REGISTRATION_INVITE_CODE_HASH mora biti SHA-256 hash kada je registracija u invite režimu.",
  );
}

const defaultOrigin =
  (process.env.NODE_ENV ?? "development") === "production"
    ? undefined
    : "http://localhost:5173";
const publicOrigins = required("PUBLIC_ORIGIN", defaultOrigin)
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

const portValue = integer("PORT", 4000, 1, 65_535);
const trustProxyHops = integer("TRUST_PROXY_HOPS", 0, 0, 5);

export const config = {
  databaseUrl: buildDatabaseUrl(),
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: portValue,
  publicOrigins,
  corsOrigin: publicOrigins.length === 1 ? publicOrigins[0]! : publicOrigins,
  trustProxy: trustProxyHops === 0 ? false : trustProxyHops,
  cookieSecure:
    process.env.COOKIE_SECURE === undefined
      ? (process.env.NODE_ENV ?? "development") === "production"
      : process.env.COOKIE_SECURE === "true",
  registrationMode: registrationModeValue as "closed" | "invite" | "open",
  registrationInviteCodeHash: inviteCodeHash,
  sessionDays: integer("SESSION_DAYS", 14, 1, 90),
  maxSessionsPerUser: integer("MAX_SESSIONS_PER_USER", 5, 1, 20),
  maxNotesPerUser: integer("MAX_NOTES_PER_USER", 1_000, 1, 100_000),
  maxNoteBytes: integer("MAX_NOTE_BYTES", 100_000, 1_000, 100_000),
  maxTotalNoteBytesPerUser: integer(
    "MAX_TOTAL_NOTE_BYTES_PER_USER",
    25_000_000,
    100_000,
    2_000_000_000,
  ),
  notesPageSize: integer("NOTES_PAGE_SIZE", 50, 10, 100),
} as const;
