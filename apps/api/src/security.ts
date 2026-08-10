import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_VERSION = "v1";
const SCRYPT_PARAMS = {
  N: 2 ** 15,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
} as const;

type ScryptParams = {
  N: number;
  r: number;
  p: number;
  maxmem: number;
};

export type PasswordVerification = {
  valid: boolean;
  needsRehash: boolean;
};

const deriveKey = (
  password: string,
  salt: Buffer,
  params: ScryptParams,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, params, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, SCRYPT_PARAMS);
  return [
    "scrypt",
    SCRYPT_VERSION,
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<PasswordVerification> {
  const parts = stored.split("$");
  let params: ScryptParams;
  let saltHex: string | undefined;
  let keyHex: string | undefined;
  let needsRehash: boolean;

  if (parts.length === 3 && parts[0] === "scrypt") {
    [, saltHex, keyHex] = parts;
    params = { N: 2 ** 14, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
    needsRehash = true;
  } else if (
    parts.length === 7 &&
    parts[0] === "scrypt" &&
    parts[1] === SCRYPT_VERSION
  ) {
    const N = Number(parts[2]);
    const r = Number(parts[3]);
    const p = Number(parts[4]);
    saltHex = parts[5];
    keyHex = parts[6];

    if (
      ![N, r, p].every(Number.isSafeInteger) ||
      N < 2 ** 13 ||
      N > 2 ** 18 ||
      (N & (N - 1)) !== 0 ||
      r < 1 ||
      r > 32 ||
      p < 1 ||
      p > 16
    ) {
      return { valid: false, needsRehash: false };
    }

    params = { N, r, p, maxmem: Math.max(64 * 1024 * 1024, 256 * N * r) };
    needsRehash =
      N !== SCRYPT_PARAMS.N || r !== SCRYPT_PARAMS.r || p !== SCRYPT_PARAMS.p;
  } else {
    return { valid: false, needsRehash: false };
  }

  if (!saltHex || !keyHex || !/^[a-f0-9]+$/i.test(saltHex + keyHex)) {
    return { valid: false, needsRehash: false };
  }

  try {
    const salt = Buffer.from(saltHex, "hex");
    const storedKey = Buffer.from(keyHex, "hex");
    const derivedKey = await deriveKey(password, salt, params);
    const valid =
      storedKey.length === derivedKey.length &&
      timingSafeEqual(storedKey, derivedKey);
    return { valid, needsRehash: valid && needsRehash };
  } catch {
    return { valid: false, needsRehash: false };
  }
}

export function verifySecretAgainstSha256(
  candidate: string,
  expectedHex: string | undefined,
): boolean {
  if (!expectedHex || !/^[a-f0-9]{64}$/i.test(expectedHex)) return false;
  const actual = createHash("sha256").update(candidate, "utf8").digest();
  const expected = Buffer.from(expectedHex, "hex");
  return timingSafeEqual(actual, expected);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
