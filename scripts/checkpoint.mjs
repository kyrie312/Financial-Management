/**
 * 把 SQLite 的预写日志（-wal）合并回主数据库文件，让 ledger.db 变成一个「自带全部数据」的单文件。
 *
 * 为什么需要它：
 *   数据库运行在 WAL 模式下，刚写入的数据可能还留在 ledger.db-wal 里。
 *   如果此时只复制 ledger.db，会丢掉这些数据（表现为表都不存在或记录变少）。
 *   执行本脚本后再复制 ledger.db，就是安全、完整的。
 *
 * 用法：
 *   node scripts/checkpoint.mjs
 *   或在「停止网站.bat」之后自动执行
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbFile = process.env.DATABASE_PATH?.trim()
  ? path.resolve(process.env.DATABASE_PATH.trim())
  : path.join(projectRoot, "data", "ledger.db");

if (!existsSync(dbFile)) {
  console.log(`没有找到数据库文件：${dbFile}`);
  console.log("（还没记过账时会是这样，不需要合并）");
  process.exit(0);
}

const before = { main: 0, wal: 0 };
const stat = (file) => (existsSync(file) ? statSync(file).size : 0);
before.main = stat(dbFile);
before.wal = stat(`${dbFile}-wal`);

const db = new DatabaseSync(dbFile);
let records = 0;
try {
  const result = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  records = Number(db.prepare("SELECT COUNT(*) AS c FROM records").get().c);
  console.log("数据库合并完成：");
  console.log(`  ledger.db      ${(before.main / 1024).toFixed(1)} KB -> ${(stat(dbFile) / 1024).toFixed(1)} KB`);
  console.log(`  ledger.db-wal  ${(before.wal / 1024).toFixed(1)} KB -> ${(stat(`${dbFile}-wal`) / 1024).toFixed(1)} KB`);
  console.log(`  当前共 ${records} 条记录`);
  console.log(`  checkpoint 结果：${JSON.stringify(result)}`);
  console.log("");
  console.log("现在 ledger.db 已包含全部数据，可以单独复制它到另一台电脑。");
} finally {
  db.close();
}
