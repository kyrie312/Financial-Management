"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LedgerShell } from "@/components/ledger-shell";
import { MonthSelector } from "@/components/month-selector";
import { RecordList } from "@/components/record-list";
import { StatTile } from "@/components/stat-tile";
import { monthLabel } from "@/lib/dates";
import type { CategoryView, OverallSummary, RecordPage } from "@/lib/types";

interface DetailProps {
  categoryId: "side" | "school";
  title: string;
  description: string;
  categories: CategoryView[];
  monthKeys: string[];
  currentMonthKey: string;
  cumulative: OverallSummary;
  monthSummary: OverallSummary;
  initialIncome: RecordPage;
  initialExpense: RecordPage;
}

export function CategoryDetailClient({
  categoryId,
  title,
  description,
  categories,
  monthKeys,
  currentMonthKey,
  cumulative,
  monthSummary,
  initialIncome,
  initialExpense,
}: DetailProps) {
  const [month, setMonth] = useState<string | null>(null);
  const [summary, setSummary] = useState<OverallSummary>(monthSummary);
  const [income, setIncome] = useState<RecordPage>(initialIncome);
  const [expense, setExpense] = useState<RecordPage>(initialExpense);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 服务端刷新（增删改后调用 router.refresh()）会送来新的分页数据，这里同步过来 */
  const signature = `${initialIncome.items.map((i) => i.id).join(",")}|${initialExpense.items
    .map((i) => i.id)
    .join(",")}|${initialIncome.total}|${initialExpense.total}`;
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    setIncome(initialIncome);
    setExpense(initialExpense);
    setSummary(monthSummary);
  }, [signature, initialIncome, initialExpense, monthSummary]);

  const cumulativeForCategory = useMemo(
    () =>
      cumulative.byCategory.find((item) => item.id === categoryId) ?? {
        incomeFen: 0,
        expenseFen: 0,
        balanceFen: 0,
      },
    [cumulative, categoryId],
  );
  const monthForCategory = useMemo(
    () =>
      summary.byCategory.find((item) => item.id === categoryId) ?? {
        incomeFen: 0,
        expenseFen: 0,
        balanceFen: 0,
      },
    [summary, categoryId],
  );

  const months = useMemo(() => {
    const set = new Set<string>([currentMonthKey, ...monthKeys]);
    return [...set].sort().reverse();
  }, [monthKeys, currentMonthKey]);

  const requestId = useRef(0);
  const fetchData = useCallback(
    async (nextMonth: string | null, incomePage: number, expensePage: number) => {
      const ticket = ++requestId.current;
      setBusy(true);
      setError(null);
      const monthQuery = nextMonth ? `month=${nextMonth}` : "month=all";
      try {
        const [summaryResponse, incomeResponse, expenseResponse] = await Promise.all([
          fetch(`/api/summary?${monthQuery}&subcategories=0`, {
            cache: "no-store",
            credentials: "same-origin",
          }),
          fetch(
            `/api/records?categoryId=${categoryId}&type=income&page=${incomePage}&${monthQuery}`,
            { cache: "no-store", credentials: "same-origin" },
          ),
          fetch(
            `/api/records?categoryId=${categoryId}&type=expense&page=${expensePage}&${monthQuery}`,
            { cache: "no-store", credentials: "same-origin" },
          ),
        ]);
        if ([summaryResponse, incomeResponse, expenseResponse].some((r) => r.status === 401)) {
          window.location.href = "/login";
          return;
        }
        if (!summaryResponse.ok || !incomeResponse.ok || !expenseResponse.ok) {
          throw new Error("读取失败");
        }
        const summaryPayload = (await summaryResponse.json()) as { summary: OverallSummary };
        const incomePayload = (await incomeResponse.json()) as { page: RecordPage };
        const expensePayload = (await expenseResponse.json()) as { page: RecordPage };
        if (ticket !== requestId.current) return;
        setSummary(summaryPayload.summary);
        setIncome(incomePayload.page);
        setExpense(expensePayload.page);
      } catch {
        if (ticket !== requestId.current) return;
        setError("数据刷新失败，请检查网络或稍后重试");
      } finally {
        if (ticket === requestId.current) setBusy(false);
      }
    },
    [categoryId],
  );

  const onMonthChange = (next: string | null) => {
    setMonth(next);
    void fetchData(next, 1, 1);
  };

  const onIncomePage = (page: number) => {
    const next = { ...income, page };
    setIncome(next);
    void fetchData(month, page, expense.page);
  };

  const onExpensePage = (page: number) => {
    const next = { ...expense, page };
    setExpense(next);
    void fetchData(month, income.page, page);
  };

  const rangeLabel = month ? monthLabel(month) : "累计（全部时间）";

  return (
    <LedgerShell title={title} subtitle={description} backHref="/">
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatTile label="总收入（累计）" fen={cumulativeForCategory.incomeFen} tone="income" />
        <StatTile label="总开销（累计）" fen={cumulativeForCategory.expenseFen} tone="expense" />
        <StatTile
          label="余额（累计）"
          fen={cumulativeForCategory.balanceFen}
          tone="balance"
          hint={cumulativeForCategory.balanceFen < 0 ? "已超支" : "收入 − 开销"}
        />
      </section>

      <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3">
        <div>
          <p className="text-[11px] font-semibold text-slate-400">查看区间</p>
          <p className="text-sm font-bold text-slate-900">{rangeLabel}</p>
        </div>
        <MonthSelector
          months={months}
          value={month}
          onChange={onMonthChange}
          includeAllTime
          allTimeLabel="累计（全部时间）"
        />
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2.5">
        <StatTile label="区间收入" fen={monthForCategory.incomeFen} tone="income" />
        <StatTile label="区间开销" fen={monthForCategory.expenseFen} tone="expense" />
        <StatTile label="区间结余" fen={monthForCategory.balanceFen} tone="balance" />
      </section>

      {error ? (
        <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}

      <div className={`mt-5 space-y-4 transition-opacity ${busy ? "opacity-60" : ""}`}>
        <RecordList
          title="收入明细"
          type="income"
          records={income.items}
          page={income.page}
          totalPages={income.totalPages}
          total={income.total}
          pageSize={income.pageSize}
          categories={categories}
          onPageChange={onIncomePage}
          emptyHint={`还没有${title}收入记录`}
        />
        <RecordList
          title="开销明细"
          type="expense"
          records={expense.items}
          page={expense.page}
          totalPages={expense.totalPages}
          total={expense.total}
          pageSize={expense.pageSize}
          categories={categories}
          onPageChange={onExpensePage}
          emptyHint={`还没有${title}开销记录`}
        />
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        收入与开销分开展示，各自分页（每页 10 条），按时间从新到旧排列
      </p>
    </LedgerShell>
  );
}
