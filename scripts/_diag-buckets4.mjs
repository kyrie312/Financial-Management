// 查线上汇总接口的真实返回 + 直接对比本地同一条查询
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

// 与生产代码完全相同的构造方式
const column = `CASE WHEN occurred_at >= ${Number(from)} AND occurred_at < ${Number(to)} THEN '1' ELSE '0' END`;
const raw = `WITH scope AS (
         SELECT *, ${column} AS bucket FROM records
          WHERE (?::bigint IS NULL OR occurred_at >= ?)
            AND (?::bigint IS NULL OR occurred_at < ?)
       )
       SELECT 'category' AS kind, bucket || '|' || category_id AS key, type, SUM(amount_fen) AS s
         FROM scope GROUP BY bucket, category_id, type
       UNION ALL
       SELECT 'month' AS kind,
              to_char(to_timestamp(occurred_at / 1000.0), 'YYYY-MM') AS key,
              NULL AS type, NULL AS s
         FROM scope GROUP BY 2`;

function withPlaceholders(text) {
  let index = 0;
  return text.replace(/\?/g, () => `$${(index += 1)}`);
}

try {
  const rows = await sql.unsafe(withPlaceholders(raw), [from, from, to, to]);
  console.log("生产同款查询结果：");
  for (const r of rows) console.log(`  kind=${r.kind} key=${r.key} type=${r.type ?? "-"} s=${r.s ?? "-"}`);

  const buckets = new Set(rows.filter((r) => r.kind === "category").map((r) => r.key.split("|")[0]));
  console.log("出现过的 bucket：", [...buckets].join(", ") || "(无)");

  // 关键对照：如果 CASE 表达式里的时间戳被写成字符串会怎样？
  const wrongColumn = `CASE WHEN occurred_at >= '${from}' AND occurred_at < '${to}' THEN '1' ELSE '0' END`;
  const wrongRaw = raw.replace(column, wrongColumn);
  const wrongRows = await sql.unsafe(withPlaceholders(wrongRaw), [from, from, to, to]);
  console.log("\n对照试验（时间戳加引号当字符串比较）：");
  for (const r of wrongRows) console.log(`  kind=${r.kind} key=${r.key} type=${r.type ?? "-"} s=${r.s ?? "-"}`);
} catch (error) {
  console.log("失败：", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
