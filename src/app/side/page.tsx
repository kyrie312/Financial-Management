import { CategoryDetailClient } from "@/components/category-detail-client";
import { currentMonthKey, monthRange } from "@/lib/dates";
import { dataMonthKeys, listCategories, listRecords, summaryForRange } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default async function SidePage() {
  const monthKey = currentMonthKey();
  const { start, end } = monthRange(monthKey);

  const [categories, cumulative, monthSummary, monthKeys, initialIncome, initialExpense] =
    await Promise.all([
      listCategories(),
      summaryForRange(null, null, { includeSubcategories: false }),
      summaryForRange(start, end, { includeSubcategories: false }),
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
      cumulative={cumulative}
      monthSummary={monthSummary}
      initialIncome={initialIncome}
      initialExpense={initialExpense}
    />
  );
}
