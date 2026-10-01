import { execute, queryOne } from "./db";
import { timingSafeEqualHex } from "./session-token";

// 会话相关的纯 Web Crypto 实现在 session-token.ts（中间件也用它），这里统一再导出。
export {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSessionToken,
  verifySessionToken,
} from "./session-token";

interface UserRecord {
  id: number;
  username: string;
  password_hash: string;
  created_at: number;
}

export const DEFAULT_USERNAME = "admin";
export const DEFAULT_PASSWORD = "admin123";

const PBKDF2_ITERATIONS = 150_000;
const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2(password: string, saltBase64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromBase64(saltBase64),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !salt || !hash) return false;
  if (Number(iterations) !== PBKDF2_ITERATIONS) return false;
  const candidate = await pbkdf2(password, salt);
  return timingSafeEqualHex(candidate, hash);
}

/** 首次启动时用 APP_PASSWORD 建账号；已有账号则不动。返回是否新建。 */
export async function ensureDefaultUser(): Promise<boolean> {
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM users WHERE username = ?",
    [DEFAULT_USERNAME],
  );
  if (existing) return false;
  const password = process.env.APP_PASSWORD?.trim() || DEFAULT_PASSWORD;
  const hash = await hashPassword(password);
  await execute(
    `INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)
     ON CONFLICT (username) DO NOTHING`,
    [DEFAULT_USERNAME, hash, Date.now()],
  );
  return true;
}

export async function authenticate(
  username: string,
  password: string,
): Promise<{ id: number; username: string } | null> {
  const row = await queryOne<UserRecord>(
    "SELECT id, username, password_hash FROM users WHERE username = ?",
    [username],
  );
  if (!row) return null;
  const ok = await verifyPasswordHash(password, row.password_hash);
  return ok ? { id: Number(row.id), username: row.username } : null;
}

export async function getUserById(id: number): Promise<{ id: number; username: string } | null> {
  const row = await queryOne<{ id: number; username: string }>(
    "SELECT id, username FROM users WHERE id = ?",
    [id],
  );
  return row ? { id: Number(row.id), username: row.username } : null;
}

export async function changeOwnPassword(
  userId: number,
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  const row = await queryOne<UserRecord>(
    "SELECT id, username, password_hash FROM users WHERE id = ?",
    [userId],
  );
  if (!row) throw new Error("用户不存在");
  const ok = await verifyPasswordHash(currentPassword, row.password_hash);
  if (!ok) throw new Error("当前密码不正确");
  if (nextPassword.trim().length < 6) throw new Error("新密码至少 6 位");
  const hash = await hashPassword(nextPassword.trim());
  await execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId]);
}
