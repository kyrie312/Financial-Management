/**
 * 一次性数据迁移：本机 SQLite（data/ledger.db） → Supabase Postgres
 *
 * 用法（在项目目录下）：
 *   node scripts/migrate-to-supabase.mjs            # 追加导入（自动去重）
 *   node scripts/migrate-to-supabase.mjs --reset    # 先清空云端记录，再完整导入
 *
 * 说明：
 *   - 自动从 .env.local 读取 DATABASE_URL（也可以用环境变量覆盖）
 *   - 类别与细分类型按名称对应，两边 id 不需要一致
 *   - 金额以「分」原样搬运；按 (板块/方向/金额/备注/发生时间) 去重，重复执行安全
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 读取 .env.local（Next.js 的约定文件），让脚本也能直接连云端 */
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(projectRoot, ".env.local"));

const { closeDatabase, execute, query, ready } = await import("../src/lib/db.ts");

const sqliteFile = process.env.SQLITE_PATH?.trim()
  ? path.resolve(process.env.SQLITE_PATH.trim())
  : path.join(projectRoot, "data", "ledger.db");
const reset = process.argv.includes("--reset");

if (!process.env.DATABASE_URL) {
  console.error("缺少 DATABASE_URL：请在项目根目录的 .env.local 里配置 Supabase 连接串");
  process.exit(1);
}
if (!existsSync(sqliteFile)) {
  console.error(`找不到本机数据库：${sqliteFile}`);
  process.exit(1);
}

console.log(`源文件：${sqliteFile}`);
console.log(`模式：${reset ? "清空云端记录后完整导入" : "追加导入（自动去重）"}`);

await ready();

const sqlite = new DatabaseSync(sqliteFile);
const localCategories = sqlite.prepare("SELECT id, name, sort FROM categories").all();
const localSubs = sqlite.prepare("SELECT id, category_id, name, sort FROM subcategories").all();
const localRecords = sqlite.prepare("SELECT * FROM records ORDER BY occurred_at ASC, id ASC").all();
sqlite.close();

console.log(
  `本机数据：${localCategories.length} 个板块 / ${localSubs.length} 个细分 / ${localRecords.length} 条记录`,
);

if (reset) {
  const removed = await execute("DELETE FROM records");
  console.log(`已清空云端记录（删除 ${removed.count} 条）`);
}

const subKey = (categoryId, name) => `${categoryId}::${name}`;
const remoteSubs = await query("SELECT id, category_id, name FROM subcategories");
const remoteSubMap = new Map(remoteSubs.map((s) => [subKey(s.category_id, s.name), Number(s.id)]));
const localSubNameById = new Map(localSubs.map((s) => [Number(s.id), s.name]));

const existing = await query(
  "SELECT category_id, type, amount_fen, note, occurred_at FROM records",
);
const fingerprint = (row) =>
  `${row.category_id}|${row.type}|${Number(row.amount_fen)}|${row.note}|${Number(row.occurred_at)}`;
const existingSet = new Set(existing.map(fingerprint));

let inserted = 0;
let skipped = 0;

for (const record of localRecords) {
  const subName = record.subcategory_id
    ? (localSubNameById.get(Number(record.subcategory_id)) ?? null)
    : null;
  const remoteSubId = subName
    ? (remoteSubMap.get(subKey(record.category_id, subName)) ?? null)
    : null;

  const payload = {
    category_id: record.category_id,
    type: record.type,
    amount_fen: Number(record.amount_fen),
    note: record.note ?? "",
    occurred_at: Number(record.occurred_at),
  };

  if (existingSet.has(fingerprint(payload))) {
    skipped += 1;
    continue;
  }

  await execute(
    `INSERT INTO records (type, category_id, subcategory_id, amount_fen, note, occurred_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.type,
      payload.category_id,
      remoteSubId,
      payload.amount_fen,
      payload.note,
      payload.occurred_at,
      Number(record.created_at),
      Number(record.updated_at),
    ],
  );
  existingSet.add(fingerprint(payload));
  inserted += 1;
}

const totals = await query("SELECT COUNT(*)::int AS c, SUM(amount_fen)::bigint AS s FROM records");
console.log("");
console.log(`导入完成：新增 ${inserted} 条，跳过重复 ${skipped} 条`);
console.log(`云端现在：${Number(totals[0].c)} 条记录，金额合计 ${Number(totals[0].s ?? 0)} 分`);

const byCategory = await query(
  `SELECT category_id, type, SUM(amount_fen)::bigint AS s
   FROM records GROUP BY category_id, type ORDER BY category_id, type`,
);
console.log("分板块统计：");
for (const row of byCategory) {
  console.log(
    `  ${row.category_id} / ${row.type === "income" ? "收入" : "开销"}: ${Number(row.s)} 分`,
  );
}

await closeDatabase();
