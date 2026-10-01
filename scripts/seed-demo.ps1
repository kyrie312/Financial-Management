# 仅用于界面预览/截图：写入一批演示数据（幂等，可重复执行）
# 用法： powershell -File scripts/seed-demo.ps1 [-Clean]
param([switch]$Clean)

$projectRoot = Split-Path -Parent $PSScriptRoot
$dbFile = Join-Path $projectRoot "data\ledger.db"
$node = if ($env:DSH_NODE) { $env:DSH_NODE } else { "node" }

$js = @'
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[2]);

if (process.argv[3] === "clean") {
  const removed = db.prepare("DELETE FROM records WHERE note LIKE '[demo]%'").run();
  console.log("removed demo records:", Number(removed.changes));
  db.close();
  process.exit(0);
}

const now = new Date();
function when(daysAgo, hour = 12, minute = 30) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute, 0, 0);
  return d.getTime();
}

const subs = new Map();
for (const row of db.prepare("SELECT id, name FROM subcategories").all()) {
  subs.set(row.name, row.id);
}

const demo = [
  ["income", "life", null, 200000, "[demo] 本月生活费", 2],
  ["income", "life", null, 200000, "[demo] 上月生活费", 32],
  ["income", "side", null, 68050, "[demo] 帮同学做的毕业设计尾款", 6],
  ["income", "side", null, 32000, "[demo] 周末兼职家教", 20],
  ["income", "school", null, 80000, "[demo] 国家助学金（秋季）", 15],
  ["expense", "life", "吃饭", 3850, "[demo] 食堂 + 外卖", 1],
  ["expense", "life", "吃饭", 12000, "[demo] 和朋友聚餐", 9],
  ["expense", "life", "交通", 420, "[demo] 地铁", 1],
  ["expense", "life", "交通", 2600, "[demo] 打车去车站", 11],
  ["expense", "life", "网购", 18900, "[demo] 机械键盘", 4],
  ["expense", "life", "住宿", 60000, "[demo] 宿舍水电与网费", 8],
  ["expense", "life", "礼物", 15000, "[demo] 妈妈生日礼物", 18],
  ["expense", "life", "会员", 2500, "[demo] 视频会员年费", 25],
  ["expense", "life", "生活", 7800, "[demo] 日用品采购", 3],
  ["expense", "side", null, 12900, "[demo] 买显示器支架和线材", 5],
  ["expense", "school", null, 4500, "[demo] 打印论文与装订", 7],
  ["expense", "school", null, 9800, "[demo] 实验耗材", 22],
];

db.prepare("DELETE FROM records WHERE note LIKE '[demo]%'").run();

const insert = db.prepare(
  `INSERT INTO records (type, category_id, subcategory_id, amount_fen, note, occurred_at, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);
const stamp = Date.now();
let count = 0;
for (const [type, category, sub, amount, note, days] of demo) {
  insert.run(type, category, sub ? subs.get(sub) ?? null : null, amount, note, when(days), stamp, stamp);
  count += 1;
}
const total = db.prepare("SELECT COUNT(*) AS c FROM records").get().c;
console.log(`demo records inserted: ${count}, total records now: ${Number(total)}`);
db.close();
'@

$tmp = Join-Path $env:TEMP "dsh-seed-demo.cjs"
Set-Content -Path $tmp -Value $js -Encoding UTF8
& $node $tmp $dbFile $(if ($Clean) { "clean" } else { "seed" })
