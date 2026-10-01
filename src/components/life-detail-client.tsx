"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CategoryTotalEditModal } from "@/components/category-total-edit-modal";
import { DonutChart } from "@/components/donut-chart";
import { LedgerShell } from "@/components/ledger-shell";
import { MonthSelector } from "@/components/month-selector";
import { StatTile } from "@/components/stat-tile";
import { periodLabel } from "@/lib/period-label";
import { fenToSymbol } from "@/lib/money";
import type { CategoryId, OverallSummary, RecordType, SubcategorySummary } from "@/lib/types";

interface EditTarget {
  type: RecordType;
  subcategoryId: number | null;
  label: string;
  currentFen: number;
}

/** 带「修改」按钮的统计块（生活费页的汇总是可以直接改的，不用翻明细） */
function EditableTile({
  label,
  fen,
  tone,
  hint,
  onEdit,
}: {
  label: string;
  fen: number;
  tone: "income" | "expense";
  hint?: string;
  onEdit: () => void;
}) {
  const accent = tone === "income" ? "text-emerald-700" : "text-rose-700";
  const ring = tone === "income" ? "ring-emerald-100" : "ring-rose-100";
  return (
    <div className={`card ring-1 ${ring} px-3.5 py-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold ${accent}`}>{label}</p>
          <p className={`num mt-1 text-lg font-black ${fen < 0 ? "text-rose-600" : "text-slate-900"}`}>
            {fenToSymbol(fen)}
          </p>
          {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
        </div>
        <button
          type="button"
          onClick={onEdit}
          title="修改这个数值"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          ✏️ 修改
        </button>
      </div>
    </div>
  );
}

export function LifeDetailClient({
  monthKeys,
  currentMonthKey,
  cumulative,
  monthSummary,
}: {
  monthKeys: string[];
  currentMonthKey: string;
  cumulative: OverallSummary;
  monthSummary: OverallSummary;
}) {
  const [month, setMonth] = useState<string | null>(null);
  const [summary, setSummary] = useState<OverallSummary>(monthSummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const months = useMemo(() => {
    const set = new Set<string>([currentMonthKey, ...monthKeys]);
    return [...set].sort().reverse();
  }, [monthKeys, currentMonthKey]);

  const cumulativeLife = useMemo(
    () =>
      cumulative.byCategory.find((item) => item.id === "life") ?? {
        incomeFen: 0,
        expenseFen: 0,
        balanceFen: 0,
      },
    [cumulative],
  );
  const life = useMemo(
    () =>
      summary.byCategory.find((item) => item.id === "life") ?? {
        incomeFen: 0,
        expenseFen: 0,
        balanceFen: 0,
      },
    [summary],
  );

  // 服务端刷新（改完总额后 router.refresh()）会送来新数据，这里同步过来
  const serverSignature = `${monthSummary.total.incomeFen}|${monthSummary.total.expenseFen}|${monthSummary.bySubcategory
    .map((item) => item.expenseFen)
    .join(",")}`;
  const lastSignature = useRef(`init|${serverSignature}`);
  useEffect(() => {
    if (lastSignature.current === serverSignature) return;
    lastSignature.current = serverSignature;
    setSummary(monthSummary);
  }, [serverSignature, monthSummary]);

  const requestId = useRef(0);
  const load = useCallback(async (nextMonth: string | null) => {
    const ticket = ++requestId.current;
    setBusy(true);
    setError(null);
    try {
      const query = nextMonth ? `month=${nextMonth}` : "month=all";
      const response = await fetch(`/api/summary?${query}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error("读取失败");
      const payload = (await response.json()) as { summary: OverallSummary };
      if (ticket !== requestId.current) return;
      setSummary(payload.summary);
    } catch {
      if (ticket !== requestId.current) return;
      setError("数据刷新失败，请稍后重试");
    } finally {
      if (ticket === requestId.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  const onMonthChange = (next: string | null) => {
    setMonth(next);
    void load(next);
  };

  const subcategories: SubcategorySummary[] = summary.bySubcategory;
  const sortedSubs = [...subcategories].sort((a, b) => b.expenseFen - a.expenseFen);
  const subTotal = subcategories.reduce((sum, item) => sum + item.expenseFen, 0);
  const rangeText = periodLabel(month);

  return (
    <LedgerShell
      title="生活费"
      subtitle="汇总统计与各细分类型占比（收入与各类开销都能直接改数值）"
      backHref="/"
    >
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatTile label="总收入（累计）" fen={cumulativeLife.incomeFen} tone="income" />
        <StatTile label="总开销（累计）" fen={cumulativeLife.expenseFen} tone="expense" />
        <StatTile
          label="余额（累计）"
          fen={cumulativeLife.balanceFen}
          tone="balance"
          hint={cumulativeLife.balanceFen < 0 ? "已超支" : "收入 − 开销"}
        />
      </section>

      <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3">
        <div>
          <p className="text-[11px] font-semibold text-slate-400">环形图与细分统计区间</p>
          <p className="text-sm font-bold text-slate-900">{rangeText}</p>
        </div>
        <MonthSelector
          months={months}
          value={month}
          onChange={onMonthChange}
          includeAllTime
          allTimeLabel="累计（全部时间）"
        />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <EditableTile
          label="区间收入"
          fen={life.incomeFen}
          tone="income"
          onEdit={() =>
            setEditing({
              type: "income",
              subcategoryId: null,
              label: "生活费",
              currentFen: life.incomeFen,
            })
          }
        />
        <StatTile label="区间开销" fen={life.expenseFen} tone="expense" />
        <StatTile label="区间结余" fen={life.balanceFen} tone="balance" />
      </section>

      {error ? (
        <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}

      <section className={`card mt-5 p-5 transition-opacity ${busy ? "opacity-60" : ""}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-900">开销构成 · {rangeText}</h2>
          <span className="num text-[11px] text-slate-400">合计 {fenToSymbol(subTotal)}</span>
        </div>

        {subTotal === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            这个区间还没有生活费开销记录，记一笔后这里会自动出现扇形图
          </p>
        ) : (
          <DonutChart
            data={subcategories.map((item) => ({ label: item.name, valueFen: item.expenseFen }))}
            centerLabel="区间总开销"
          />
        )}
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">各细分类型（可修改）</h2>
          <span className="text-[11px] text-slate-400">点「✏️ 修改」可直接改数值</span>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {sortedSubs.map((item) => {
            const share = subTotal > 0 ? (item.expenseFen / subTotal) * 100 : 0;
            return (
              <div key={item.id} className="card px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800">{item.name}</span>
                      <span className="num text-sm font-bold text-slate-900">
                        {fenToSymbol(item.expenseFen)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600"
                        style={{ width: `${Math.min(share, 100)}%` }}
                      />
                    </div>
                    <p className="num mt-1 text-[11px] text-slate-400">占比 {share.toFixed(1)}%</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        type: "expense",
                        subcategoryId: item.id,
                        label: item.name,
                        currentFen: item.expenseFen,
                      })
                    }
                    title={`修改${item.name}的金额`}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    ✏️ 修改
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        7 个细分开销之和 = 区间总开销 {fenToSymbol(subTotal)} · 修改区间为「{rangeText}」
      </p>

      {editing ? (
        <CategoryTotalEditModal
          categoryId={"life" satisfies CategoryId}
          type={editing.type}
          subcategoryId={editing.subcategoryId}
          label={editing.label}
          currentFen={editing.currentFen}
          periodText={rangeText}
          month={month}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </LedgerShell>
  );
}
