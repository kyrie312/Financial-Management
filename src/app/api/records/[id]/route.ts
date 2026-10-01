import { json } from "@/lib/http";

import type { CategoryId, RecordType } from "@/lib/db";
import { LedgerError, deleteRecord, getRecordView, updateRecord } from "@/lib/ledger";
import { parseYuanToFen } from "@/lib/money";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORY_IDS: CategoryId[] = ["life", "side", "school"];

function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as string[]).includes(value);
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (id === null) return json({ error: "记录 ID 不正确" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式不正确" }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const patch: {
    type?: RecordType;
    categoryId?: CategoryId;
    subcategoryId?: number | null;
    amountFen?: number;
    note?: string;
  } = {};

  if (payload.type !== undefined) {
    if (payload.type !== "income" && payload.type !== "expense") {
      return json({ error: "收支方向不正确" }, { status: 400 });
    }
    patch.type = payload.type;
  }

  if (payload.categoryId !== undefined) {
    if (!isCategoryId(payload.categoryId)) {
      return json({ error: "板块不正确" }, { status: 400 });
    }
    patch.categoryId = payload.categoryId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "subcategoryId")) {
    if (payload.subcategoryId === null || payload.subcategoryId === "") {
      patch.subcategoryId = null;
    } else {
      const subId = Number(payload.subcategoryId);
      if (!Number.isInteger(subId)) {
        return json({ error: "细分类型不正确" }, { status: 400 });
      }
      patch.subcategoryId = subId;
    }
  }

  if (payload.amount !== undefined) {
    const amountFen = parseYuanToFen(
      typeof payload.amount === "string" || typeof payload.amount === "number"
        ? payload.amount
        : "",
    );
    if (amountFen === null) {
      return json({ error: "请输入正确的金额（最多两位小数）" }, { status: 400 });
    }
    patch.amountFen = amountFen;
  }

  if (payload.note !== undefined) {
    if (typeof payload.note !== "string") {
      return json({ error: "备注格式不正确" }, { status: 400 });
    }
    patch.note = payload.note;
  }

  try {
    const record = await updateRecord(id, patch);
    return json({ ok: true, record });
  } catch (error) {
    if (error instanceof LedgerError) {
      return json({ error: error.message }, { status: 400 });
    }
    return json(
      { error: error instanceof Error ? error.message : "更新失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (id === null) return json({ error: "记录 ID 不正确" }, { status: 400 });

  const existing = await getRecordView(id);
  if (!existing) return json({ error: "记录不存在" }, { status: 404 });

  const ok = await deleteRecord(id);
  return json({ ok });
}
