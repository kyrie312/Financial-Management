import "server-only";

import {
  categoryName,
  execute,
  query,
  queryOne,
  transaction,
  type CategoryId,
  type CategoryRow,
  type RecordRow,
  type RecordType,
  type SubcategoryRow,
  type Tx,
} from "./db";
import { isMonthKey, monthKeyOf, monthRange, type MonthKey } from "./dates";

/** ---------- 对外类型（全部可直接 JSON 序列化，金额单位为「分」） ---------- */

export interface SubcategoryView {
  id: number;
  name: string;
}

export interface CategoryView {
  id: CategoryId;
  name: string;
  subcategories: SubcategoryView[];
}

export interface RecordView {
  id: number;
  type: RecordType;
  categoryId: CategoryId;
  categoryName: string;
  subcategoryId: number | null;
  subcategoryName: string | null;
  amountFen: number;
  note: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface AmountBreakdown {
  incomeFen: number;
  expenseFen: number;
  balanceFen: number;
}

export interface CategorySummary extends AmountBreakdown {
  id: CategoryId;
}

export interface SubcategorySummary {
  id: number;
  name: string;
  expenseFen: number;
}

export interface OverallSummary {
  total: AmountBreakdown;
  byCategory: CategorySummary[];
  bySubcategory: SubcategorySummary[];
}

export interface RecordPage {
  items: RecordView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

type SqlValue = string | number | null;

function emptyBreakdown(): AmountBreakdown {
  return { incomeFen: 0, expenseFen: 0, balanceFen: 0 };
}

/** ---------- 类别 ---------- */

export async function listCategories(): Promise<CategoryView[]> {
  const categories = await query<CategoryRow>(
    "SELECT id, name, sort FROM categories ORDER BY sort ASC, id ASC",
  );
  const subs = await query<SubcategoryRow>(
    "SELECT id, category_id, name, sort FROM subcategories ORDER BY category_id ASC, sort ASC, id ASC",
  );
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    subcategories: subs
      .filter((sub) => sub.category_id === category.id)
      .map((sub) => ({ id: Number(sub.id), name: sub.name })),
  }));
}

async function isSubcategoryOf(subcategoryId: number, categoryId: CategoryId): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    "SELECT id FROM subcategories WHERE id = ? AND category_id = ?",
    [subcategoryId, categoryId],
  );
  return Boolean(row);
}

async function subcategoryNameMap(): Promise<Map<number, string>> {
  const subs = await query<SubcategoryRow>("SELECT id, category_id, name, sort FROM subcategories");
  return new Map(subs.map((sub) => [Number(sub.id), sub.name]));
}

function mapRecord(row: RecordRow, subNames: Map<number, string>): RecordView {
  return {
    id: Number(row.id),
    type: row.type,
    categoryId: row.category_id,
    categoryName: categoryName(row.category_id),
    subcategoryId: row.subcategory_id === null ? null : Number(row.subcategory_id),
    subcategoryName:
      row.subcategory_id === null ? null : (subNames.get(Number(row.subcategory_id)) ?? null),
    amountFen: Number(row.amount_fen),
    note: row.note,
    occurredAt: Number(row.occurred_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

/** ---------- 记录读取 ---------- */

export interface ListRecordsInput {
  categoryId: CategoryId;
  type: RecordType;
  month?: MonthKey | null;
  from?: number | null;
  to?: number | null;
  page?: number;
  pageSize?: number;
}

function scopeCondition(input: {
  month?: MonthKey | null;
  from?: number | null;
  to?: number | null;
}): { sql: string; params: SqlValue[] } {
  if (input.month && isMonthKey(input.month)) {
    const { start, end } = monthRange(input.month);
    return { sql: " AND occurred_at >= ? AND occurred_at < ?", params: [start, end] };
  }
  const conditions: string[] = [];
  const params: SqlValue[] = [];
  if (typeof input.from === "number") {
    conditions.push("occurred_at >= ?");
    params.push(input.from);
  }
  if (typeof input.to === "number") {
    conditions.push("occurred_at < ?");
    params.push(input.to);
  }
  return { sql: conditions.map((c) => ` AND ${c}`).join(""), params };
}

export async function listRecords(input: ListRecordsInput): Promise<RecordPage> {
  const pageSize = Math.min(Math.max(input.pageSize ?? 10, 1), 100);
  const scope = scopeCondition(input);

  const base = `FROM records WHERE category_id = ? AND type = ?${scope.sql}`;
  const params: SqlValue[] = [input.categoryId, input.type, ...scope.params];

  const countRow = await queryOne<{ c: number }>(`SELECT COUNT(*)::int AS c ${base}`, params);
  const total = Number(countRow?.c ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(input.page ?? 1, 1), totalPages);

  const rows = await query<RecordRow>(
    `SELECT * ${base} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );

  const subNames = await subcategoryNameMap();
  return { items: rows.map((row) => mapRecord(row, subNames)), page, pageSize, total, totalPages };
}

export async function getRecordView(id: number): Promise<RecordView | null> {
  const row = await queryOne<RecordRow>("SELECT * FROM records WHERE id = ?", [id]);
  if (!row) return null;
  return mapRecord(row, await subcategoryNameMap());
}

/** ---------- 统计汇总 ---------- */

async function sumByCategory(
  from: number | null,
  to: number | null,
): Promise<Map<CategoryId, AmountBreakdown>> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (typeof from === "number") {
    where.push("occurred_at >= ?");
    params.push(from);
  }
  if (typeof to === "number") {
    where.push("occurred_at < ?");
    params.push(to);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await query<{ category_id: CategoryId; type: RecordType; s: number }>(
    `SELECT category_id, type, SUM(amount_fen) AS s FROM records ${whereSql}
     GROUP BY category_id, type`,
    params,
  );

  const map = new Map<CategoryId, AmountBreakdown>();
  for (const row of rows) {
    const entry = map.get(row.category_id) ?? emptyBreakdown();
    if (row.type === "income") entry.incomeFen += Number(row.s ?? 0);
    else entry.expenseFen += Number(row.s ?? 0);
    map.set(row.category_id, entry);
  }
  for (const entry of map.values()) {
    entry.balanceFen = entry.incomeFen - entry.expenseFen;
  }
  return map;
}

async function sumBySubcategory(from: number | null, to: number | null): Promise<Map<number, number>> {
  const where: string[] = ["type = 'expense'", "subcategory_id IS NOT NULL"];
  const params: SqlValue[] = [];
  if (typeof from === "number") {
    where.push("occurred_at >= ?");
    params.push(from);
  }
  if (typeof to === "number") {
    where.push("occurred_at < ?");
    params.push(to);
  }
  const rows = await query<{ subcategory_id: number; s: number }>(
    `SELECT subcategory_id, SUM(amount_fen) AS s FROM records
     WHERE ${where.join(" AND ")}
     GROUP BY subcategory_id`,
    params,
  );
  const map = new Map<number, number>();
  for (const row of rows) map.set(Number(row.subcategory_id), Number(row.s ?? 0));
  return map;
}

export async function summaryForRange(
  from: number | null,
  to: number | null,
  options: { includeSubcategories?: boolean } = {},
): Promise<OverallSummary> {
  const categories = await listCategories();
  const sums = await sumByCategory(from, to);

  const byCategory: CategorySummary[] = categories.map((category) => {
    const entry = sums.get(category.id) ?? emptyBreakdown();
    return { id: category.id, ...entry };
  });

  const total = byCategory.reduce<AmountBreakdown>((acc, item) => {
    acc.incomeFen += item.incomeFen;
    acc.expenseFen += item.expenseFen;
    acc.balanceFen += item.balanceFen;
    return acc;
  }, emptyBreakdown());

  let bySubcategory: SubcategorySummary[] = [];
  if (options.includeSubcategories !== false) {
    const subSums = await sumBySubcategory(from, to);
    bySubcategory = categories
      .flatMap((category) => category.subcategories)
      .map((sub) => ({
        id: sub.id,
        name: sub.name,
        expenseFen: subSums.get(sub.id) ?? 0,
      }));
  }

  return { total, byCategory, bySubcategory };
}

/** 数据里出现过的月份，最新在前（用户可能补记历史记录，所以不能只列最近 12 个月） */
export async function dataMonthKeys(limit = 240): Promise<MonthKey[]> {
  const rows = await query<{ occurred_at: number }>(
    "SELECT occurred_at FROM records ORDER BY occurred_at DESC LIMIT ?",
    [limit],
  );
  const keys = new Set<MonthKey>();
  for (const row of rows) keys.add(monthKeyOf(new Date(Number(row.occurred_at))));
  return [...keys].sort().reverse();
}

/** ---------- 记录写入 ---------- */

export interface CreateRecordInput {
  type: RecordType;
  categoryId: CategoryId;
  subcategoryId?: number | null;
  amountFen: number;
  note?: string;
  occurredAt?: number;
}

export async function createRecord(input: CreateRecordInput): Promise<RecordView> {
  await validateWrite(input.categoryId, input.type, input.subcategoryId ?? null, input.note);
  const now = Date.now();
  const occurred = input.occurredAt ?? now;
  const rows = await execute(
    `INSERT INTO records (type, category_id, subcategory_id, amount_fen, note, occurred_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      input.type,
      input.categoryId,
      input.subcategoryId ?? null,
      Math.round(input.amountFen),
      (input.note ?? "").trim(),
      occurred,
      now,
      now,
    ],
  );
  const id = Number((rows.rows[0] as { id: number } | undefined)?.id);
  const view = await getRecordView(id);
  if (!view) throw new Error("写入记录失败");
  return view;
}

export interface UpdateRecordInput {
  amountFen?: number;
  note?: string;
  categoryId?: CategoryId;
  subcategoryId?: number | null;
  type?: RecordType;
}

export async function updateRecord(id: number, patch: UpdateRecordInput): Promise<RecordView> {
  const current = await queryOne<RecordRow>("SELECT * FROM records WHERE id = ?", [id]);
  if (!current) throw new Error("记录不存在");

  const nextType = patch.type ?? current.type;
  const nextCategory = patch.categoryId ?? current.category_id;
  const subcategoryProvided =
    Object.prototype.hasOwnProperty.call(patch, "subcategoryId") ||
    patch.categoryId !== undefined;
  const nextSubcategory = subcategoryProvided
    ? (patch.subcategoryId ?? null)
    : current.subcategory_id === null
      ? null
      : Number(current.subcategory_id);

  const nextNote = patch.note === undefined ? current.note : patch.note.trim();
  await validateWrite(nextCategory, nextType, nextSubcategory, nextNote);

  const nextAmount =
    typeof patch.amountFen === "number" ? Math.round(patch.amountFen) : Number(current.amount_fen);
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
    throw new LedgerError("金额必须大于 0");
  }

  await execute(
    `UPDATE records
        SET type = ?, category_id = ?, subcategory_id = ?, amount_fen = ?, note = ?, updated_at = ?
      WHERE id = ?`,
    [nextType, nextCategory, nextSubcategory, nextAmount, nextNote, Date.now(), id],
  );

  const view = await getRecordView(id);
  if (!view) throw new Error("更新记录失败");
  return view;
}

export async function deleteRecord(id: number): Promise<boolean> {
  const result = await execute("DELETE FROM records WHERE id = ?", [id]);
  return result.count > 0;
}

/**
 * 业务校验（服务端统一收口，客户端校验只是体验优化）：
 * - 生活费板块的收入不分细分；生活费的每笔开销必须落在 7 个细分之一（否则无法统计各类占比）。
 * - 副业 / 学校补助的收入与开销都不使用细分，且备注必填（原文要求说明钱的来源/用途）。
 */
export async function validateWrite(
  categoryId: CategoryId,
  type: RecordType,
  subcategoryId: number | null,
  note?: string,
): Promise<void> {
  const isLife = categoryId === "life";
  const needsSubcategory = isLife && type === "expense";
  if (needsSubcategory) {
    if (!subcategoryId) throw new LedgerError("生活费开销必须选择细分类型");
    if (!(await isSubcategoryOf(subcategoryId, categoryId))) {
      throw new LedgerError("细分类型与所选板块不匹配");
    }
  } else if (subcategoryId) {
    throw new LedgerError("该板块不需要细分类型");
  }

  if (requiresNote(categoryId) && !(note ?? "").trim()) {
    throw new LedgerError(
      type === "income" ? "请填写这笔收入的来源（必填）" : "请填写这笔开销的用途（必填）",
    );
  }
}

/** 业务校验失败：接口据此返回 400 而不是 500 */
export class LedgerError extends Error {}

export function requiresNote(categoryId: CategoryId): boolean {
  return categoryId === "side" || categoryId === "school";
}

/** ---------- 生活费板块的「改总额」 ----------
 * 生活费页按需求只展示汇总、不列逐笔明细，所以这里提供两种改法：
 *  - delta：按金额增减（如「吃饭 加 50」/「吃饭 减 50」）
 *  - setTotal：直接改成某个总额（如「吃饭 改成 600」）
 * 实现方式：清掉该区间内这个类目的旧记录，再写入一笔等额的新记录（备注标注调整来源）。
 * 因此所有统计、环形图、余额都会自然重算，也不会出现和明细对不上的数。
 * 金额字段是正数约束，所以「调减 / 改成 0」通过删记录实现，而不是写负数。
 */

export interface AdjustTotalInput {
  categoryId: CategoryId;
  type: RecordType;
  subcategoryId?: number | null;
  operation: "delta" | "setTotal";
  amountFen: number;
  from: number | null;
  to: number | null;
}

export interface AdjustTotalResult {
  previousFen: number;
  totalFen: number;
  changedRecords: number;
}

const ADJUST_PREFIX_DELTA = "[调整]";
const ADJUST_PREFIX_SET = "[改总额]";

interface ScopedWhere {
  sql: string;
  params: SqlValue[];
}

function scopedWhere(
  categoryId: CategoryId,
  type: RecordType,
  subcategoryId: number | null,
  from: number | null,
  to: number | null,
): ScopedWhere {
  const where: string[] = ["category_id = ?", "type = ?"];
  const params: SqlValue[] = [categoryId, type];
  if (subcategoryId === null) {
    where.push("subcategory_id IS NULL");
  } else {
    where.push("subcategory_id = ?");
    params.push(subcategoryId);
  }
  if (typeof from === "number") {
    where.push("occurred_at >= ?");
    params.push(from);
  }
  if (typeof to === "number") {
    where.push("occurred_at < ?");
    params.push(to);
  }
  return { sql: where.join(" AND "), params };
}

async function sumScoped(source: Tx | null, scope: ScopedWhere): Promise<number> {
  const sql = `SELECT SUM(amount_fen) AS s FROM records WHERE ${scope.sql}`;
  const row = source
    ? await source.queryOne<{ s: number | null }>(sql, scope.params)
    : await queryOne<{ s: number | null }>(sql, scope.params);
  return Number(row?.s ?? 0);
}

export async function adjustCategoryTotal(input: AdjustTotalInput): Promise<AdjustTotalResult> {
  // 生活费收入不分细分；生活费开销必须带细分
  const subcategoryId = input.type === "income" ? null : (input.subcategoryId ?? null);
  await validateWrite(input.categoryId, input.type, subcategoryId, "调整记录");

  const roundFen = Math.round(input.amountFen);
  if (!Number.isFinite(roundFen)) throw new LedgerError("金额格式不正确");
  if (input.operation === "delta" && roundFen === 0) throw new LedgerError("调整金额不能为 0");

  const scope = scopedWhere(input.categoryId, input.type, subcategoryId, input.from, input.to);
  const previousFen = await sumScoped(null, scope);

  // 目标总额：按增减是在原值基础上算；改成总额则直接用输入值
  const targetFen = input.operation === "delta" ? previousFen + roundFen : roundFen;
  if (targetFen < 0) {
    throw new LedgerError("调整后总额会变成负数，请检查金额");
  }

  const label = subcategoryId
    ? ((await queryOne<{ name: string }>("SELECT name FROM subcategories WHERE id = ?", [
        subcategoryId,
      ]))?.name ?? "细分类型")
    : categoryName(input.categoryId);
  const note =
    input.operation === "delta"
      ? `${ADJUST_PREFIX_DELTA} ${label} ${roundFen > 0 ? "调增" : "调减"}`
      : `${ADJUST_PREFIX_SET} ${label}`;

  const now = Date.now();
  let changedRecords = 0;
  let totalFen = 0;

  await transaction(async (tx) => {
    const removed = await tx.execute(`DELETE FROM records WHERE ${scope.sql}`, scope.params);
    changedRecords = removed.count;

    if (targetFen > 0) {
      await tx.execute(
        `INSERT INTO records (type, category_id, subcategory_id, amount_fen, note, occurred_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.type, input.categoryId, subcategoryId, targetFen, note, now, now, now],
      );
    }

    totalFen = await sumScoped(tx, scope);
  });

  return {
    previousFen,
    totalFen: targetFen > 0 ? totalFen : 0,
    changedRecords,
  };
}

/** ---------- CSV 导出 ---------- */

export async function exportCsv(): Promise<string> {
  const rows = await query<RecordRow>("SELECT * FROM records ORDER BY occurred_at ASC, id ASC");
  const subNames = new Map<number, string>(
    (await query<SubcategoryRow>("SELECT id, category_id, name, sort FROM subcategories")).map(
      (s) => [Number(s.id), s.name],
    ),
  );
  const header = "日期,时间,方向,板块,细分类型,金额(元),备注";
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const lines = rows.map((row) => {
    const d = new Date(Number(row.occurred_at));
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const direction = row.type === "income" ? "收入" : "开销";
    const sub = row.subcategory_id ? (subNames.get(Number(row.subcategory_id)) ?? "") : "";
    const amount = (Number(row.amount_fen) / 100).toFixed(2);
    const note = `"${(row.note ?? "").replace(/"/g, '""')}"`;
    return [date, time, direction, categoryName(row.category_id), sub, amount, note].join(",");
  });
  return `\uFEFF${[header, ...lines].join("\r\n")}`;
}
