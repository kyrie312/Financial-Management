import { json } from "@/lib/http";
import { currentMonthKey, monthRange } from "@/lib/dates";
import { loadDashboard } from "@/lib/ledger";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 临时诊断接口：把 loadDashboard 的原始返回打出来（排查完删除） */
export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const monthKey = currentMonthKey();
  const { start, end } = monthRange(monthKey);
  try {
    const dashboard = await loadDashboard(start, end);
    return json({
      monthKey,
      start,
      end,
      monthKeys: dashboard.monthKeys,
      cumulativeTotal: dashboard.cumulative.total,
      cumulativeByCategory: dashboard.cumulative.byCategory,
      monthTotal: dashboard.month.total,
      monthByCategory: dashboard.month.byCategory,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
