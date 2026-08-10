import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db/index.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder =
  process.env.MIGRATIONS_DIR ??
  path.resolve(
    currentDirectory,
    currentDirectory.endsWith("dist") ? "../drizzle" : "../drizzle",
  );

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder });

  const appPasswordFile = process.env.APP_DB_PASSWORD_FILE;
  if (!appPasswordFile) return;

  const appRole = process.env.APP_DB_ROLE ?? "notes_app";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(appRole)) {
    throw new Error("APP_DB_ROLE nije bezbedan PostgreSQL identifikator.");
  }

  const password = readFileSync(appPasswordFile, "utf8").trim();
  if (password.length < 24) {
    throw new Error("Aplikacioni DB secret mora imati najmanje 24 karaktera.");
  }

  const quotedRole = `"${appRole.replaceAll('"', '""')}"`;
  const quotedPassword = `'${password.replaceAll("'", "''")}'`;
  const existing = await pool.query<{ exists: boolean }>(
    "select exists(select 1 from pg_roles where rolname = $1) as exists",
    [appRole],
  );

  if (existing.rows[0]?.exists) {
    await pool.query(
      `alter role ${quotedRole} with login password ${quotedPassword} nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 20`,
    );
  } else {
    await pool.query(
      `create role ${quotedRole} with login password ${quotedPassword} nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 20`,
    );
  }

  const databaseResult = await pool.query<{ database: string }>(
    "select current_database() as database",
  );
  const database = databaseResult.rows[0]?.database;
  if (!database || !/^[a-zA-Z0-9_-]{1,63}$/.test(database)) {
    throw new Error("Naziv PostgreSQL baze nije bezbedan za GRANT.");
  }
  const quotedDatabase = `"${database.replaceAll('"', '""')}"`;
  await pool.query(`revoke create on schema public from public`);
  await pool.query(
    `grant connect on database ${quotedDatabase} to ${quotedRole}`,
  );
  await pool.query(`grant usage on schema public to ${quotedRole}`);
  await pool.query(
    `grant select, insert, update, delete on all tables in schema public to ${quotedRole}`,
  );
  await pool.query(
    `grant usage, select on all sequences in schema public to ${quotedRole}`,
  );
  await pool.query(
    `alter default privileges in schema public grant select, insert, update, delete on tables to ${quotedRole}`,
  );
  await pool.query(
    `alter default privileges in schema public grant usage, select on sequences to ${quotedRole}`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runMigrations()
    .then(() => {
      console.log("Migracije su uspešno izvršene.");
    })
    .finally(() => pool.end());
}
