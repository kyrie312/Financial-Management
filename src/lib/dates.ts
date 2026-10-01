/** 时间与月份区间的纯函数工具。月份一律用本机时区计算，保证与记录时看到的日期一致。 */

export type MonthKey = string; // "2025-06"

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 本地时区下的月份键 */
export function monthKeyOf(date: Date): MonthKey {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function currentMonthKey(): MonthKey {
  return monthKeyOf(new Date());
}

/** 合法月份键校验 */
export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** 月份键 -> [起始毫秒, 结束毫秒)，本地时区 */
export function monthRange(key: MonthKey): { start: number; end: number } {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
  const end = new Date(y, m, 1, 0, 0, 0, 0).getTime();
  return { start, end };
}

export function monthLabel(key: MonthKey): string {
  const [y, m] = key.split("-");
  return `${y} 年 ${Number(m)} 月`;
}

/** 时间戳 -> "2025-06-08 14:32" */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 时间戳 -> "2025-06-08" */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 近 N 个月（含本月）的月份键，倒序：最新在前 */
export function recentMonthKeys(count = 12, from = new Date()): MonthKey[] {
  const out: MonthKey[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(monthKeyOf(new Date(from.getFullYear(), from.getMonth() - i, 1)));
  }
  return out;
}
