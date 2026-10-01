/** 金额一律以「分」为整数存储与计算，避免浮点误差。这里只放纯函数，客户端也能安全引用。 */

const CNY = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 分 -> "1,234.56" */
export function fenToYuan(fen: number): string {
  return CNY.format((fen ?? 0) / 100);
}

/** 分 -> "¥1,234.56"，负数显示为 "-¥1,234.56" */
export function fenToSymbol(fen: number): string {
  const value = fen ?? 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}¥${CNY.format(Math.abs(value) / 100)}`;
}

/** 分 -> "12.34"（导出 CSV 用，不带千分位） */
export function fenToPlain(fen: number): string {
  return ((fen ?? 0) / 100).toFixed(2);
}

/**
 * 用户输入的金额字符串 -> 分。
 * 最多两位小数，必须为正数；非法输入返回 null。
 */
export function parseYuanToFen(input: string | number): number | null {
  const raw = String(input ?? "").trim().replace(/[，,\s¥￥]/g, "");
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const fen = Math.round(Number(raw) * 100);
  if (!Number.isFinite(fen) || fen <= 0) return null;
  return fen;
}

/**
 * 解析带符号的金额（用于「按金额增减」场景，允许负数表示调减）。
 * 允许 0；非法输入返回 null。
 */
export function parseSignedYuan(raw: string | number): number | null {
  const text = String(raw ?? "").trim().replace(/[，,\s¥￥]/g, "");
  if (!text) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null;
  const fen = Math.round(Number(text) * 100);
  if (!Number.isFinite(fen)) return null;
  return fen;
}

/** 输入框里的金额保留两位小数（如 "12" -> "12.00"） */
export function normalizeYuanInput(input: string): string {
  const raw = input.trim().replace(/[^\d.]/g, "");
  const match = /^(\d*)(?:\.(\d{0,2}))?/.exec(raw);
  if (!match) return "";
  const intPart = match[1] ?? "";
  const decPart = match[2];
  if (decPart === undefined) return intPart;
  return `${intPart}.${decPart}`;
}
