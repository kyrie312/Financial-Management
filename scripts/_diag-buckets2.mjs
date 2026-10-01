// 复现生产环境的 access() 分桶行为
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

function withAccess(sql, access, transform) {
  return function (...args) {
    if (typeof args[0] === "string" && args[0].length > 0 && args[0][0] === "\u0000") {
      return sql.unsafe(args[0].slice(1), args[1]);
    }
    return sql(...transform?.(args) ?? args);
  };
}

const from = new Date(2026, 9, 1).getTime();
const to = new Date(2026, 10, 1).getTime();
const column = `CASE WHEN occurred_at >= ${from} AND occurred_at < ${to} THEN '1' ELSE '0' END`;
const text = `WITH scope AS (
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

try {
  console.log("=== 1) 直接 unsafe（这就是 loadDashboard 实际走的路径）===");
  const rows = await sql.unsafe(text, [from, from, to, to]);
  for (const r of rows) console.log(`  ${r.kind} ${r.key} ${r.type ?? ""} = ${r.s}`);

  console.log("\n=== 2) 模拟生产里被代理过的 sql(...) 带参调用 ===");
  const proxied = withAccess(sql, {});
  try {
    const rows2 = await proxied`select count(*)::int as c from records where id = ${1}`;
    console.log("  正常参数化查询可用：", JSON.stringify(rows2[0]));
  } catch (e) {
    console.log("  正常参数化查询失败：", e.message);
  }

  console.log("\n=== 3) 检查是否有 NULL 参数相关的类型推断问题 ===");
  const nullTest = await sql.unsafe(
    `SELECT COUNT(*)::int AS c FROM records WHERE ($1::bigint IS NULL OR occurred_at >= $1)`,
    [null],
  );
  console.log("  NULL 参数写法结果：", JSON.stringify(nullTest[0]));
} catch (error) {
  console.log("失败：", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
