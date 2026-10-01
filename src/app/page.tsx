import { HomeClient } from "@/components/home-client";
import { currentMonthKey, monthRange } from "@/lib/dates";
import { listCategories, summaryForRange } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const categories = await listCategories();
  const monthKey = currentMonthKey();
  const { start, end } = monthRange(monthKey);

  const [cumulative, month] = await Promise.all([
    summaryForRange(null, null, { includeSubcategories: false }),
    summaryForRange(start, end, { includeSubcategories: false }),
  ]);

  return (
    <HomeClient
      categories={categories}
      cumulative={cumulative}
      month={month}
      monthKey={monthKey}
      syncedAt={Date.now()}
    />
  );
}
