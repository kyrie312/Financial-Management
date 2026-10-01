import { HomeClient } from "@/components/home-client";
import { currentMonthKey, monthRange } from "@/lib/dates";
import { listCategories, loadDashboard } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const monthKey = currentMonthKey();
  const { start, end } = monthRange(monthKey);

  // loadDashboard 用一条聚合 SQL 同时算出「累计」和「本月」；类别有进程内缓存
  const [categories, dashboard] = await Promise.all([
    listCategories(),
    loadDashboard(start, end),
  ]);

  return (
    <HomeClient
      categories={categories}
      cumulative={dashboard.cumulative}
      month={dashboard.month}
      monthKey={monthKey}
      syncedAt={Date.now()}
    />
  );
}
