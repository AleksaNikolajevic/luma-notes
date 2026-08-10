import assert from "node:assert/strict";
import { test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const sessionCookie = (value: string | string[] | undefined): string => {
  const header = Array.isArray(value) ? value[0] : value;
  assert.ok(header, "Authentication response must set a session cookie.");
  return header.split(";", 1)[0]!;
};

test(
  "real PostgreSQL flow enforces ownership, search and version conflicts",
  { skip: !testDatabaseUrl },
  async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.PUBLIC_ORIGIN = "https://notes.test";
    process.env.TRUST_PROXY_HOPS = "0";
    process.env.COOKIE_SECURE = "false";
    process.env.REGISTRATION_MODE = "open";
    process.env.NODE_ENV = "test";

    const [{ runMigrations }, { buildApp }, { pool }] = await Promise.all([
      import("./migrate.js"),
      import("./app.js"),
      import("./db/index.js"),
    ]);

    await runMigrations();
    await pool.query("truncate table users cascade");
    const app = await buildApp();

    const register = async (email: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { origin: "https://notes.test" },
        payload: {
          name: "Portfolio tester",
          email,
          password: "correct-horse-battery-staple",
        },
      });
      assert.equal(response.statusCode, 201, response.body);
      return sessionCookie(response.headers["set-cookie"]);
    };

    try {
      const ownerCookie = await register("owner@notes.test");
      const otherCookie = await register("other@notes.test");

      const createdResponse = await app.inject({
        method: "POST",
        url: "/api/notes",
        headers: {
          cookie: ownerCookie,
          origin: "https://notes.test",
        },
        payload: {
          title: "Plan za lansiranje",
          content: "<p>Privatni portfolio plan</p>",
        },
      });
      assert.equal(createdResponse.statusCode, 201, createdResponse.body);
      const created = createdResponse.json().note as {
        id: string;
        version: number;
      };

      const ownerSearch = await app.inject({
        method: "GET",
        url: "/api/notes?search=lansiranje",
        headers: { cookie: ownerCookie },
      });
      assert.equal(ownerSearch.statusCode, 200);
      assert.equal(ownerSearch.json().notes.length, 1);

      const isolatedSearch = await app.inject({
        method: "GET",
        url: "/api/notes?search=lansiranje",
        headers: { cookie: otherCookie },
      });
      assert.equal(isolatedSearch.statusCode, 200);
      assert.equal(isolatedSearch.json().notes.length, 0);

      const forbiddenRead = await app.inject({
        method: "GET",
        url: `/api/notes/${created.id}`,
        headers: { cookie: otherCookie },
      });
      assert.equal(forbiddenRead.statusCode, 404);

      const firstUpdate = await app.inject({
        method: "PATCH",
        url: `/api/notes/${created.id}`,
        headers: {
          cookie: ownerCookie,
          origin: "https://notes.test",
        },
        payload: {
          title: "Plan za lansiranje",
          content: "<p>Sačuvana verzija</p>",
          pinned: true,
          version: created.version,
        },
      });
      assert.equal(firstUpdate.statusCode, 200, firstUpdate.body);

      const staleUpdate = await app.inject({
        method: "PATCH",
        url: `/api/notes/${created.id}`,
        headers: {
          cookie: ownerCookie,
          origin: "https://notes.test",
        },
        payload: {
          title: "Zastarela izmena",
          content: "<p>Ne sme da prepiše noviju verziju</p>",
          pinned: false,
          version: created.version,
        },
      });
      assert.equal(staleUpdate.statusCode, 409);
      assert.equal(staleUpdate.json().code, "VERSION_CONFLICT");

      const forbiddenDelete = await app.inject({
        method: "DELETE",
        url: `/api/notes/${created.id}`,
        headers: {
          cookie: otherCookie,
          origin: "https://notes.test",
        },
      });
      assert.equal(forbiddenDelete.statusCode, 404);
    } finally {
      await app.close();
      await pool.query("truncate table users cascade");
      await pool.end();
    }
  },
);
