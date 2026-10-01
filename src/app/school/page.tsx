import { CategoryDetailClient } from "@/components/category-detail-client";
import { currentMonthKey, monthRange } from "@/lib/dates";
import { dataMonthKeys, listCategories, listRecords, loadDashboard } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default async function SchoolPage() {
  const monthKey = currentMonthKey();
  const { start, end } = monthRange(monthKey);

  const [categories, dashboard, monthKeys, initialIncome, initialExpense] = await Promise.all([
    listCategories(),
    loadDashboard(start, end),
    dataMonthKeys(),
    listRecords({ categoryId: "school", type: "income", page: 1, pageSize: 10 }),
    listRecords({ categoryId: "school", type: "expense", page: 1, pageSize: 10 }),
  ]);

  return (
    <CategoryDetailClient
      categoryId="school"
      title="学校补助"
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
