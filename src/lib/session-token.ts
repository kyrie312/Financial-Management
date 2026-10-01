/**
 * 只依赖 Web Crypto 的会话逻辑：Node 运行时和 Edge Runtime 都能用。
 * 中间件只允许引用本文件（不能引用 database 相关模块）。
 */

export const SESSION_COOKIE = "ledger_session";
export const SESSION_DAYS = 30;

const encoder = new TextEncoder();

/** 默认密钥只用于本机预览；.env.local 里设置 SESSION_SECRET 后即失效。 */
export function sessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.trim().length >= 16) return fromEnv.trim();
  return "life-ledger-local-dev-secret-do-not-use-in-public";
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function createSessionToken(
  userId: number,
  days = SESSION_DAYS,
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(payload));
  return { token: `${payload}.${toHex(new Uint8Array(signature))}`, expiresAt };
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<{ userId: number } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawId, rawExp, signature] = parts;
  const userId = Number(rawId);
  const expiresAt = Number(rawExp);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  const expected = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    encoder.encode(`${rawId}.${rawExp}`),
  );
  return timingSafeEqualHex(toHex(new Uint8Array(expected)), signature) ? { userId } : null;
}
