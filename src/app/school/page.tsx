import { CategoryDetailClient } from "@/components/category-detail-client";
import { currentMonthKey, monthRange } from "@/lib/dates";
import { dataMonthKeys, listCategories, listRecords, summaryForRange } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default async function SchoolPage() {
  const monthKey = currentMonthKey();
  const { start, end } = monthRange(monthKey);

  const [categories, cumulative, monthSummary, monthKeys, initialIncome, initialExpense] =
    await Promise.all([
      listCategories(),
      summaryForRange(null, null, { includeSubcategories: false }),
      summaryForRange(start, end, { includeSubcategories: false }),
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
      cumulative={cumulative}
      monthSummary={monthSummary}
      initialIncome={initialIncome}
      initialExpense={initialExpense}
    />
  );
}
