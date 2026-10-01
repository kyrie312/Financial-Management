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

/**
 * 一次查询取回「板块 + 细分类型」。
 * 类别是静态数据（只有 3 + 7 行），所以在进程内缓存，避免每次页面加载都发一次往返。
 * 跨区域数据库每次往返约 200ms，这一项对响应速度影响很明显。
 */
let categoryTreeCache: {
  categories: CategoryView[];
  subNames: Map<number, string>;
} | null = null;

async function loadCategoryTree(): Promise<{ categories: CategoryView[]; subNames: Map<number, string> }> {
  if (categoryTreeCache) return categoryTreeCache;

  const rows = await query<{
    id: CategoryId;
    name: string;
    sort: number;
    sub_id: number | null;
    sub_name: string | null;
    sub_sort: number | null;
  }>(
    `SELECT c.id, c.name, c.sort,
            s.id AS sub_id, s.name AS sub_name, s.sort AS sub_sort
       FROM categories c
       LEFT JOIN subcategories s ON s.category_id = c.id
      ORDER BY c.sort ASC, c.id ASC, s.sort ASC, s.id ASC`,
  );

  const categories: CategoryView[] = [];
  const subNames = new Map<number, string>();
  for (const row of rows) {
    let category = categories.find((item) => item.id === row.id);
    if (!category) {
      category = { id: row.id, name: row.name, subcategories: [] };
      categories.push(category);
    }
    if (row.sub_id !== null && row.sub_name !== null) {
      const subId = Number(row.sub_id);
      category.subcategories.push({ id: subId, name: row.sub_name });
      subNames.set(subId, row.sub_name);
    }
  }

  categoryTreeCache = { categories, subNames };
  return categoryTreeCache;
}

export async function listCategories(): Promise<CategoryView[]> {
  return (await loadCategoryTree()).categories;
}

async function isSubcategoryOf(subcategoryId: number, categoryId: CategoryId): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    "SELECT id FROM subcategories WHERE id = ? AND category_id = ?",
    [subcategoryId, categoryId],
  );
  return Boolean(row);
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

  const [rows, tree] = await Promise.all([
    query<RecordRow>(`SELECT * ${base} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`, [
      ...params,
      pageSize,
      (page - 1) * pageSize,
    ]),
    loadCategoryTree(),
  ]);

  return {
    items: rows.map((row) => mapRecord(row, tree.subNames)),
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function getRecordView(id: number): Promise<RecordView | null> {
  const row = await queryOne<RecordRow>("SELECT * FROM records WHERE id = ?", [id]);
  if (!row) return null;
  const tree = await loadCategoryTree();
  return mapRecord(row, tree.subNames);
}

/** ---------- 统计汇总（合并成一次查询，减少跨区域往返） ---------- */


/** 一次查询同时取回：分板块收支汇总、7 个细分类型开销、出现过的月份
 *
 * 分桶规则（重要）：
 *   桶 '0' = 累计：**每条记录都算进去**
 *   桶 '1' = 指定区间（如本月）：记录落在区间内时**额外**算一份
 * 所以区间内的记录会同时出现在两个桶里，这样「累计」和「本月」才能各自独立成立。
 * （早期版本误把两个桶做成互斥的，导致本月记的账在累计里看不到。）
 */
async function snapshotFor(
  from: number | null,
  to: number | null,
  column: string,
): Promise<{
  byCategory: Array<{ id: CategoryId; bucket: string; entry: AmountBreakdown }>;
  bySubcategory: Array<{ id: number; name: string; bucket: string; expenseFen: number }>;
  monthKeys: MonthKey[];
  totalByBucket: Map<string, AmountBreakdown>;
}> {
  const [tree, rows] = await Promise.all([
    loadCategoryTree(),
    query<{ kind: string; key: string; type: string | null; s: number }>(
      `WITH scoped AS (
         SELECT *, (${column}) AS in_range FROM records
          WHERE (?::bigint IS NULL OR occurred_at >= ?)
            AND (?::bigint IS NULL OR occurred_at < ?)
       ),
       bucketed AS (
         SELECT *, '0' AS bucket FROM scoped
         UNION ALL
         SELECT *, '1' AS bucket FROM scoped WHERE in_range
       )
       SELECT 'category' AS kind, bucket || '|' || category_id AS key, type, SUM(amount_fen) AS s
         FROM bucketed GROUP BY bucket, category_id, type
       UNION ALL
       SELECT 'subcategory' AS kind, bucket || '|' || subcategory_id::text AS key,
              NULL AS type, SUM(amount_fen) AS s
         FROM bucketed WHERE type = 'expense' AND subcategory_id IS NOT NULL
        GROUP BY bucket, subcategory_id
       UNION ALL
       SELECT 'month' AS kind,
              to_char(to_timestamp(occurred_at / 1000.0), 'YYYY-MM') AS key,
              NULL AS type, NULL AS s
         FROM bucketed WHERE bucket = '0' GROUP BY 2`,
      [from, from, to, to],
    ),
  ]);

  const sums = new Map<string, AmountBreakdown>();
  const subSums = new Map<string, number>();
  const monthKeys = new Set<MonthKey>();

  for (const row of rows) {
    if (row.kind === "category") {
      const entry = sums.get(row.key) ?? emptyBreakdown();
      if (row.type === "income") entry.incomeFen += Number(row.s ?? 0);
      else entry.expenseFen += Number(row.s ?? 0);
      sums.set(row.key, entry);
    } else if (row.kind === "subcategory") {
      subSums.set(row.key, Number(row.s ?? 0));
    } else if (row.kind === "month") {
      monthKeys.add(row.key as MonthKey);
    }
  }

  const buckets = new Set<string>();
  const byCategory: Array<{ id: CategoryId; bucket: string; entry: AmountBreakdown }> = [];
  for (const [key, entry] of sums) {
    const [bucket, categoryId] = key.split("|");
    buckets.add(bucket);
    entry.balanceFen = entry.incomeFen - entry.expenseFen;
    byCategory.push({ id: categoryId as CategoryId, bucket, entry });
  }

  const totalByBucket = new Map<string, AmountBreakdown>();
  for (const bucket of buckets) {
    const total = emptyBreakdown();
    for (const item of byCategory) {
      if (item.bucket !== bucket) continue;
      total.incomeFen += item.entry.incomeFen;
      total.expenseFen += item.entry.expenseFen;
      total.balanceFen += item.entry.balanceFen;
    }
    totalByBucket.set(bucket, total);
  }

  const bySubcategory: Array<{ id: number; name: string; bucket: string; expenseFen: number }> = [];
  for (const category of tree.categories) {
    for (const sub of category.subcategories) {
      for (const bucket of buckets.size > 0 ? buckets : new Set(["0"])) {
        bySubcategory.push({
          id: sub.id,
          name: sub.name,
          bucket,
          expenseFen: subSums.get(`${bucket}|${sub.id}`) ?? 0,
        });
      }
    }
  }

  return {
    byCategory,
    bySubcategory,
    monthKeys: [...monthKeys].sort().reverse(),
    totalByBucket,
  };
}

function snapshotToSummary(
  snapshot: Awaited<ReturnType<typeof snapshotFor>>,
  bucket: string,
  includeSubcategories: boolean,
): OverallSummary {
  const byCategory: CategorySummary[] = snapshot.byCategory
    .filter((item) => item.bucket === bucket)
    .map((item) => ({ id: item.id, ...item.entry }));

  return {
    total: snapshot.totalByBucket.get(bucket) ?? emptyBreakdown(),
    byCategory,
    bySubcategory: includeSubcategories
      ? snapshot.bySubcategory
          .filter((item) => item.bucket === bucket)
          .map((item) => ({ id: item.id, name: item.name, expenseFen: item.expenseFen }))
      : [],
  };
}

/** 首页/详情页数据：1 条聚合 SQL 同时算「累计」和「指定区间」 */
export async function loadDashboard(
  from: number | null,
  to: number | null,
): Promise<{ cumulative: OverallSummary; month: OverallSummary; monthKeys: MonthKey[] }> {
  const hasRange = typeof from === "number" && typeof to === "number";
  const column = hasRange
    ? `occurred_at >= ${Number(from)} AND occurred_at < ${Number(to)}`
    : "true";
  const snapshot = await snapshotFor(from, to, column);
  return {
    cumulative: snapshotToSummary(snapshot, "0", true),
    month: hasRange ? snapshotToSummary(snapshot, "1", true) : snapshotToSummary(snapshot, "0", true),
    monthKeys: snapshot.monthKeys,
  };
}

export async function summaryForRange(
  from: number | null,
  to: number | null,
  options: { includeSubcategories?: boolean } = {},
): Promise<OverallSummary> {
  const snapshot = await snapshotFor(from, to, "false");
  return snapshotToSummary(snapshot, "0", options.includeSubcategories !== false);
}

/** 数据里出现过的月份，最新在前（用户可能补记历史记录，所以不能只列最近 12 个月） */
export async function dataMonthKeys(limit = 240): Promise<MonthKey[]> {
  const rows = await query<{ month_key: string }>(
    `SELECT DISTINCT to_char(to_timestamp(occurred_at / 1000.0), 'YYYY-MM') AS month_key
       FROM records ORDER BY month_key DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => row.month_key as MonthKey);
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
