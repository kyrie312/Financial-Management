import { isMonthKey, monthRange, monthLabel } from "./dates";

/** 把 month 参数（"2026-09" 或 null/"all"）解析成时间区间；null 表示累计（全时段）。 */
export function rangeOf(month: string | null | undefined): {
  from: number | null;
  to: number | null;
} {
  if (!isMonthKey(month)) return { from: null, to: null };
  const { start, end } = monthRange(month);
  return { from: start, to: end };
}

/** 区间文案：null 表示累计 */
export function periodLabel(month: string | null): string {
  return month ? monthLabel(month) : "累计（全部时间）";
}
