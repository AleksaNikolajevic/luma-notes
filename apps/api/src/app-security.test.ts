import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://notes:test@127.0.0.1:5432/unused";
process.env.PUBLIC_ORIGIN = "https://notes.example.com";
process.env.TRUST_PROXY_HOPS = "1";
process.env.REGISTRATION_MODE = "closed";
process.env.NODE_ENV = "test";

const { buildApp } = await import("./app.js");
const app = await buildApp();

after(async () => {
  await app.close();
});

test("sensitive API responses disable caching", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store, private");
  assert.equal(response.headers.pragma, "no-cache");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
});

test("cross-site state-changing requests are rejected before route handling", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, "ORIGIN_REJECTED");
});
