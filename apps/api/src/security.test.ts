import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./security.js";

test("password hash accepts the correct password only", async () => {
  const hash = await hashPassword("sigurna-lozinka");
  const correct = await verifyPassword("sigurna-lozinka", hash);
  const incorrect = await verifyPassword("pogresna-lozinka", hash);

  assert.equal(correct.valid, true);
  assert.equal(correct.needsRehash, false);
  assert.equal(incorrect.valid, false);
  assert.match(hash, /^scrypt\$v1\$32768\$8\$3\$/);
  assert.equal(hash.includes("sigurna-lozinka"), false);
});

test("session tokens are random and stored as one-way hashes", () => {
  const first = createSessionToken();
  const second = createSessionToken();

  assert.notEqual(first, second);
  assert.match(hashSessionToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashSessionToken(first), first);
});
