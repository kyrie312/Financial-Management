import type { CategoryId, RecordType } from "@/lib/db";
import { json } from "@/lib/http";
import { LedgerError, adjustCategoryTotal, listCategories } from "@/lib/ledger";
import { parseSignedYuan } from "@/lib/money";
import { rangeOf } from "@/lib/period";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORY_IDS: CategoryId[] = ["life", "side", "school"];

function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as string[]).includes(value);
}

/**
 * 生活费板块改总额：支持「按金额增减」与「直接改成某个总额」。
 * 生活费页不列逐笔明细，所以用这个接口直接改汇总值；副业/学校补助仍走明细的增删改。
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式不正确" }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const { categoryId, type, operation, amount, month } = payload;

  if (!isCategoryId(categoryId)) {
    return json({ error: "板块不正确" }, { status: 400 });
  }
  if (type !== "income" && type !== "expense") {
    return json({ error: "收支方向不正确" }, { status: 400 });
  }
  if (operation !== "delta" && operation !== "setTotal") {
    return json({ error: "调整方式不正确" }, { status: 400 });
  }

  // 「直接改成 0」表示清零，所以允许 0；「按金额增减」允许负数（调减）
  const rawAmount = typeof amount === "string" || typeof amount === "number" ? amount : "";
  const amountFen = parseSignedYuan(rawAmount);
  if (amountFen === null) {
    return json({ error: "请输入正确的金额（最多两位小数）" }, { status: 400 });
  }
  if (operation === "setTotal" && amountFen < 0) {
    return json({ error: "总额不能为负数" }, { status: 400 });
  }

  let subcategoryId: number | null = null;
  if (type === "expense" && categoryId === "life") {
    const parsed = Number(payload.subcategoryId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return json({ error: "请选择生活费细分类型" }, { status: 400 });
    }
    subcategoryId = parsed;
  }

  const { from, to } = rangeOf(typeof month === "string" ? month : null);

  try {
    const result = await adjustCategoryTotal({
      categoryId,
      type: type as RecordType,
      subcategoryId,
      operation,
      amountFen,
      from,
      to,
    });
    const categories = await listCategories();
    return json({ ok: true, result, categories });
  } catch (error) {
    if (error instanceof LedgerError) {
      return json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
