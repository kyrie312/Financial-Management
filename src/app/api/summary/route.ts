import { json } from "@/lib/http";

import { isMonthKey, monthRange } from "@/lib/dates";
import { listCategories, summaryForRange } from "@/lib/ledger";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 汇总接口：month 省略或为 all 时返回累计数据，否则返回该月数据 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const includeSub = url.searchParams.get("subcategories") !== "0";

  const range = isMonthKey(month) ? monthRange(month) : { start: null, end: null };
  const [summary, categories] = await Promise.all([
    summaryForRange(range.start, range.end, { includeSubcategories: includeSub }),
    listCategories(),
  ]);

  return json({ summary, categories }, { headers: { "Cache-Control": "no-store" } });
}
