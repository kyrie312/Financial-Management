// 诊断：直接查云端数据库，看数据本身与两种统计口径的差异
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

const url = process.env.DATABASE_URL;
// 故意不带 options 参数，避免影响判断
const clean = url.split("?")[0];
const sql = postgres(clean, { prepare: false, max: 1 });

try {
  const all = await sql`select id, type, category_id, subcategory_id, amount_fen, note, occurred_at
                          from records order by id`;
  console.log(`数据库里共 ${all.length} 条记录：`);
  for (const r of all) {
    const d = new Date(Number(r.occurred_at));
    console.log(
      `  #${r.id} ${r.type === "income" ? "收入" : "开销"} ${r.category_id}` +
        `${r.subcategory_id ? "/sub" + r.subcategory_id : ""} ${r.amount_fen}分 ` +
        `@${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ` +
        `"${r.note}"`,
    );
  }

  const totals = await sql`select type, count(*)::int as c, sum(amount_fen)::bigint as s
                             from records group by type`;
  console.log("\n按方向汇总：");
  for (const t of totals) console.log(`  ${t.type}: ${t.c} 条, ${t.s} 分`);

  console.log("\n=== 复现页面用的分桶查询 ===");
  const from = new Date(2026, 9, 1).getTime();
  const to = new Date(2026, 10, 1).getTime();
  const rows = await sql`
    WITH scope AS (
      SELECT *, CASE WHEN occurred_at >= ${from} AND occurred_at < ${to} THEN '1' ELSE '0' END AS bucket
        FROM records
       WHERE (${null}::bigint IS NULL OR occurred_at >= ${null})
         AND (${null}::bigint IS NULL OR occurred_at < ${null})
    )
    SELECT 'category' AS kind, bucket || '|' || category_id AS key, type, SUM(amount_fen) AS s
      FROM scope GROUP BY bucket, category_id, type`;
  console.log("分桶结果：");
  for (const r of rows) console.log(`  ${r.kind} ${r.key} ${r.type ?? ""} = ${r.s}`);

  console.log("\n=== 对照：不带 NULL 参数的写法 ===");
  const rows2 = await sql`
    SELECT category_id, type, SUM(amount_fen) AS s FROM records GROUP BY category_id, type`;
  for (const r of rows2) console.log(`  ${r.category_id} ${r.type} = ${r.s}`);
} catch (error) {
  console.log("失败：", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
