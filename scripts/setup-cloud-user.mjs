// 首次初始化：在云端创建登录账号（幂等，不依赖项目内的 TS 模块）
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(projectRoot, ".env.local");
if (existsSync(envFile)) {
  for (const rawLine of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("缺少 DATABASE_URL");
  process.exit(1);
}

const username = "admin";
const password = process.env.APP_PASSWORD?.trim() || "admin123";
const PBKDF2_ITERATIONS = 150_000;

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(value) {
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${toHex(new Uint8Array(bits))}`;
}

const sql = postgres(url, { prepare: false, max: 1 });

try {
  const existing = await sql`select id, username from users where username = ${username}`;
  if (existing.length > 0) {
    console.log(`账号已存在：${username}（#${existing[0].id}）`);
  } else {
    const hash = await hashPassword(password);
    await sql`
      insert into users (username, password_hash, created_at)
      values (${username}, ${hash}, ${Date.now()})`;
    console.log(`已在云端创建账号：${username}`);
  }

  const users = await sql`select id, username from users order by id`;
  console.log("云端账号：", users.map((u) => `#${u.id} ${u.username}`).join(", "));

  const counts = await sql`
    select (select count(*)::int from records) as records,
           (select count(*)::int from categories) as categories,
           (select count(*)::int from subcategories) as subcategories`;
  console.log("云端数据量：", JSON.stringify(counts[0]));
} catch (error) {
  console.error("失败：", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
