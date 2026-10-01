import { CategoryDetailClient } from "@/components/category-detail-client";
import { currentMonthKey, monthRange } from "@/lib/dates";
import { dataMonthKeys, listCategories, listRecords, loadDashboard } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default async function SidePage() {
  const monthKey = currentMonthKey();
  const { start, end } = monthRange(monthKey);

  const [categories, dashboard, monthKeys, initialIncome, initialExpense] = await Promise.all([
    listCategories(),
    loadDashboard(start, end),
    dataMonthKeys(),
    listRecords({ categoryId: "side", type: "income", page: 1, pageSize: 10 }),
    listRecords({ categoryId: "side", type: "expense", page: 1, pageSize: 10 }),
  ]);

  return (
    <CategoryDetailClient
      categoryId="side"
      title="副业"
      description="总收入、总开销与逐笔收支明细（备注必填）"
      categories={categories}
      monthKeys={monthKeys}
      currentMonthKey={monthKey}
      cumulative={dashboard.cumulative}
      monthSummary={dashboard.month}
      initialIncome={initialIncome}
      initialExpense={initialExpense}
    />
  );
}
