import { LifeDetailClient } from "@/components/life-detail-client";
import { currentMonthKey, monthRange } from "@/lib/dates";
import { dataMonthKeys, summaryForRange } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default async function LifePage() {
  const monthKey = currentMonthKey();
  const { start, end } = monthRange(monthKey);

  const [monthKeys, cumulative, monthSummary] = await Promise.all([
    dataMonthKeys(),
    summaryForRange(null, null),
    summaryForRange(start, end),
  ]);

  return (
    <LifeDetailClient
      monthKeys={monthKeys}
      currentMonthKey={monthKey}
      cumulative={cumulative}
      monthSummary={monthSummary}
    />
  );
}
