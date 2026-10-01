import { json } from "@/lib/http";
import { NextResponse } from "next/server";

import type { CategoryId, RecordType } from "@/lib/db";
import { isMonthKey } from "@/lib/dates";
import {
  LedgerError,
  createRecord,
  exportCsv,
  listCategories,
  listRecords,
  summaryForRange,
} from "@/lib/ledger";
import { parseYuanToFen } from "@/lib/money";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORY_IDS: CategoryId[] = ["life", "side", "school"];

function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as string[]).includes(value);
}

/** 导出 CSV（带 BOM，Excel 直接打开不乱码） */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const format = url.searchParams.get("format");

  if (format === "csv") {
    const csv = await exportCsv();
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ledger-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const categoryId = url.searchParams.get("categoryId");
  const type = url.searchParams.get("type");
  const month = url.searchParams.get("month");
  const page = Number(url.searchParams.get("page") ?? "1");

  if (!isCategoryId(categoryId) || (type !== "income" && type !== "expense")) {
    return json({ error: "缺少或非法的查询参数" }, { status: 400 });
  }

  const range =
    isMonthKey(month) && month
      ? (() => {
          const [y, m] = month.split("-").map(Number);
          return {
            start: new Date(y, m - 1, 1).getTime(),
            end: new Date(y, m, 1).getTime(),
          };
        })()
      : { start: null, end: null };

  const [result, categories, summary] = await Promise.all([
    listRecords({
      categoryId,
      type: type as RecordType,
      month: isMonthKey(month) ? month : null,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: 10,
    }),
    listCategories(),
    summaryForRange(range.start, range.end, { includeSubcategories: false }),
  ]);

  return json({
    page: result,
    categories,
    summary: {
      total: summary.total,
      byCategory: summary.byCategory,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式不正确" }, { status: 400 });
  }

  const { type, categoryId, subcategoryId, amount, note } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (type !== "income" && type !== "expense") {
    return json({ error: "收支方向不正确" }, { status: 400 });
  }
  if (!isCategoryId(categoryId)) {
    return json({ error: "板块不正确" }, { status: 400 });
  }
  const amountFen = parseYuanToFen(typeof amount === "string" || typeof amount === "number" ? amount : "");
  if (amountFen === null) {
    return json({ error: "请输入正确的金额（最多两位小数）" }, { status: 400 });
  }

  let subId: number | null = null;
  if (subcategoryId !== undefined && subcategoryId !== null && subcategoryId !== "") {
    const parsed = Number(subcategoryId);
    if (!Number.isInteger(parsed)) {
      return json({ error: "细分类型不正确" }, { status: 400 });
    }
    subId = parsed;
  }

  try {
    const record = await createRecord({
      type,
      categoryId,
      subcategoryId: subId,
      amountFen,
      note: typeof note === "string" ? note : "",
      occurredAt: Date.now(), // 原文要求：时间取录入时的本机时间，不由用户填写
    });
    return json({ ok: true, record }, { status: 201 });
  } catch (error) {
    if (error instanceof LedgerError) {
      return json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
