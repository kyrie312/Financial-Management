import postgres from "postgres";
import type { Sql } from "postgres";

/**
 * 数据库层：Supabase Postgres（通过连接池连接，serverless 环境必须）
 * - 表结构在首次使用时自动建好（幂等，多实例并发也安全）
 * - 金额统一用整数「分」存储，避免浮点误差
 * - 类别设计成独立表，日后要支持自定义类别不需要改表结构
 */

export type CategoryId = "life" | "side" | "school";
export type RecordType = "income" | "expense";

export interface CategoryRow {
  id: CategoryId;
  name: string;
  sort: number;
}

export interface SubcategoryRow {
  id: number;
  category_id: CategoryId;
  name: string;
  sort: number;
}

export interface RecordRow {
  id: number;
  type: RecordType;
  category_id: CategoryId;
  subcategory_id: number | null;
  amount_fen: number;
  note: string;
  occurred_at: number;
  created_at: number;
  updated_at: number;
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "缺少 DATABASE_URL 环境变量。请在 .env.local（本机）或 Vercel 环境变量（线上）里配置 Supabase 连接串。",
    );
  }
  return url;
}

const globalForDb = globalThis as unknown as {
  __ledgerSql?: Sql;
  __ledgerReady?: Promise<void>;
};

function createClient(): Sql {
  return postgres(getDatabaseUrl(), {
    // 连接池模式（PgBouncer transaction）不支持预处理语句
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idle_timeout: 20,
    connect_timeout: 20,
    max_lifetime: 60 * 10,
    // bigint 一律按 JS number 处理（毫秒时间戳在安全整数范围内）
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (value: number | string) => String(value),
        parse: (value: string) => Number(value),
      },
    },
    onnotice: () => {},
  });
}

export function getSql(): Sql {
  if (!globalForDb.__ledgerSql) {
    globalForDb.__ledgerSql = createClient();
  }
  return globalForDb.__ledgerSql;
}

/** 首次使用前确保表结构与基础类别存在（每个进程只执行一次） */
export async function ready(): Promise<void> {
  if (!globalForDb.__ledgerReady) {
    globalForDb.__ledgerReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS categories (
          id    text PRIMARY KEY,
          name  text NOT NULL,
          sort  integer NOT NULL DEFAULT 0
        )`;

      await sql`
        CREATE TABLE IF NOT EXISTS subcategories (
          id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          category_id text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          name        text NOT NULL,
          sort        integer NOT NULL DEFAULT 0,
          UNIQUE (category_id, name)
        )`;

      await sql`
        CREATE TABLE IF NOT EXISTS records (
          id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          type           text NOT NULL CHECK (type IN ('income','expense')),
          category_id    text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          subcategory_id integer REFERENCES subcategories(id) ON DELETE SET NULL,
          amount_fen     bigint NOT NULL CHECK (amount_fen > 0),
          note           text NOT NULL DEFAULT '',
          occurred_at    bigint NOT NULL,
          created_at     bigint NOT NULL,
          updated_at     bigint NOT NULL
        )`;

      await sql`CREATE INDEX IF NOT EXISTS idx_records_scope
                  ON records (category_id, type, occurred_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_records_sub ON records (subcategory_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          username      text NOT NULL UNIQUE,
          password_hash text NOT NULL,
          created_at    bigint NOT NULL
        )`;

      await seed();
    })().catch((error) => {
      // 初始化失败时清掉缓存，下次请求可以重试
      globalForDb.__ledgerReady = undefined;
      throw error;
    });
  }
  return globalForDb.__ledgerReady;
}

/** 首版固定类别：3 个来源 + 生活费 7 个细分 */
const SEED_CATEGORIES: Array<{ id: CategoryId; name: string; sort: number }> = [
  { id: "life", name: "生活费", sort: 1 },
  { id: "side", name: "副业", sort: 2 },
  { id: "school", name: "学校补助", sort: 3 },
];

const SEED_SUBCATEGORIES: Record<CategoryId, string[]> = {
  life: ["吃饭", "交通", "网购", "住宿", "礼物", "会员", "生活"],
  side: [],
  school: [],
};

const CATEGORY_NAME_BY_ID: Record<CategoryId, string> = {
  life: "生活费",
  side: "副业",
  school: "学校补助",
};

export function categoryName(id: CategoryId): string {
  return CATEGORY_NAME_BY_ID[id] ?? id;
}

async function seed(): Promise<void> {
  const sql = getSql();
  for (const category of SEED_CATEGORIES) {
    await sql`
      INSERT INTO categories (id, name, sort)
      VALUES (${category.id}, ${category.name}, ${category.sort})
      ON CONFLICT (id) DO NOTHING`;
    const names = SEED_SUBCATEGORIES[category.id] ?? [];
    for (let index = 0; index < names.length; index += 1) {
      await sql`
        INSERT INTO subcategories (category_id, name, sort)
        VALUES (${category.id}, ${names[index]}, ${index + 1})
        ON CONFLICT (category_id, name) DO NOTHING`;
    }
  }
}

function withPlaceholders(text: string): string {
  let index = 0;
  return text.replace(/\?/g, () => `$${(index += 1)}`);
}

/** 只读查询：自动就绪 + 支持 ? 占位符（沿用项目里熟悉的写法） */
export async function query<T>(text: string, params: readonly unknown[] = []): Promise<T[]> {
  await ready();
  const rows = await getSql().unsafe(withPlaceholders(text), params as never[]);
  return rows as unknown as T[];
}

export async function queryOne<T>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

export interface ExecuteResult {
  count: number;
  rows: Record<string, unknown>[];
}

/** 写入（INSERT / UPDATE / DELETE），返回受影响行数 */
export async function execute(
  text: string,
  params: readonly unknown[] = [],
): Promise<ExecuteResult> {
  await ready();
  const result = await getSql().unsafe(withPlaceholders(text), params as never[]);
  return { count: result.count ?? 0, rows: result as unknown as Record<string, unknown>[] };
}

export interface Tx {
  query<T>(text: string, params?: readonly unknown[]): Promise<T[]>;
  queryOne<T>(text: string, params?: readonly unknown[]): Promise<T | undefined>;
  execute(text: string, params?: readonly unknown[]): Promise<ExecuteResult>;
}

function makeTx(sql: Sql): Tx {
  const run = async (text: string, params: readonly unknown[]) => {
    return sql.unsafe(withPlaceholders(text), params as never[]);
  };
  return {
    async query<T>(text: string, params: readonly unknown[] = []) {
      return (await run(text, params)) as unknown as T[];
    },
    async queryOne<T>(text: string, params: readonly unknown[] = []) {
      const rows = await run(text, params);
      return (rows as unknown as T[])[0];
    },
    async execute(text: string, params: readonly unknown[] = []) {
      const result = await run(text, params);
      return { count: result.count ?? 0, rows: result as unknown as Record<string, unknown>[] };
    },
  };
}

/** 事务：多个写操作要么全成功，要么全回滚 */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  await ready();
  const result = await getSql().begin(async (sql) => fn(makeTx(sql as unknown as Sql)));
  return result as unknown as T;
}

/** 关闭连接（脚本收尾用，避免进程不退出） */
export async function closeDatabase(): Promise<void> {
  if (globalForDb.__ledgerSql) {
    await globalForDb.__ledgerSql.end();
    globalForDb.__ledgerSql = undefined;
    globalForDb.__ledgerReady = undefined;
  }
}
