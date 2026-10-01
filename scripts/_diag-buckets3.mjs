// 用与生产完全相同的方式执行分桶查询
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const rawLine of readFileSync(path.join(projectRoot, ".env.local"), "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq > 0 && !process.env[line.slice(0, eq).trim()]) {
    process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
}

const sql = postgres(process.env.DATABASE_URL.split("?")[0], { prepare: false, max: 1 });

const from = new Date(2026, 9, 1).getTime();
const to = new Date(2026, 10, 1).getTime();
const column = `CASE WHEN occurred_at >= ${from} AND occurred_at < ${to} THEN '1' ELSE '0' END`;

// 与 src/lib/db.ts 的 withPlaceholders 完全一致
function withPlaceholders(text) {
  let index = 0;
  return text.replace(/\?/g, () => `$${(index += 1)}`);
}

const raw = `WITH scope AS (
         SELECT *, ${column} AS bucket FROM records
          WHERE (?::bigint IS NULL OR occurred_at >= ?)
            AND (?::bigint IS NULL OR occurred_at < ?)
       )
       SELECT 'category' AS kind, bucket || '|' || category_id AS key, type, SUM(amount_fen) AS s
         FROM scope GROUP BY bucket, category_id, type
       UNION ALL
       SELECT 'subcategory' AS kind, bucket || '|' || subcategory_id::text AS key,
              NULL AS type, SUM(amount_fen) AS s
         FROM scope WHERE type = 'expense' AND subcategory_id IS NOT NULL
        GROUP BY bucket, subcategory_id
       UNION ALL
       SELECT 'month' AS kind,
              to_char(to_timestamp(occurred_at / 1000.0), 'YYYY-MM') AS key,
              NULL AS type, NULL AS s
         FROM scope GROUP BY 2`;

console.log("替换后的 SQL 片段：");
console.log(withPlaceholders(raw).split("\n").slice(0, 6).join("\n"));

try {
  const rows = await sql.unsafe(withPlaceholders(raw), [from, from, to, to]);
  console.log("\n执行结果：");
  for (const r of rows) {
    console.log(`  kind=${r.kind} key=${r.key} type=${r.type ?? "-"} s=${r.s ?? "-"}`);
  }
  if (rows.length === 0) console.log("  （没有任何行！）");
} catch (error) {
  console.log("\n执行失败：", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
