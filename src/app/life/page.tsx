import { LifeDetailClient } from "@/components/life-detail-client";
import { currentMonthKey, monthRange } from "@/lib/dates";
import { loadDashboard } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default async function LifePage() {
  const monthKey = currentMonthKey();
  const { start, end } = monthRange(monthKey);

  // 一条聚合 SQL 同时得到累计、本月、月份列表
  const dashboard = await loadDashboard(start, end);

  return (
    <LifeDetailClient
      monthKeys={dashboard.monthKeys}
      currentMonthKey={monthKey}
      cumulative={dashboard.cumulative}
      monthSummary={dashboard.month}
    />
  );
}
