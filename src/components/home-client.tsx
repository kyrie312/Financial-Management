"use client";

import Link from "next/link";
import { useState } from "react";

import { LedgerShell } from "@/components/ledger-shell";
import { RecordFormModal, type RecordFormMode } from "@/components/record-form";
import { formatDateTime, monthLabel } from "@/lib/dates";
import { fenToSymbol } from "@/lib/money";
import {
  CATEGORY_THEME,
  type CategorySummary,
  type CategoryView,
  type OverallSummary,
} from "@/lib/types";

function findCategory(summary: OverallSummary, id: string): CategorySummary {
  return (
    summary.byCategory.find((item) => item.id === id) ?? {
      id: id as CategorySummary["id"],
      incomeFen: 0,
      expenseFen: 0,
      balanceFen: 0,
    }
  );
}

export function HomeClient({
  categories,
  cumulative,
  month,
  monthKey,
  syncedAt,
}: {
  categories: CategoryView[];
  cumulative: OverallSummary;
  month: OverallSummary;
  monthKey: string;
  syncedAt: number;
}) {
  const [form, setForm] = useState<RecordFormMode | null>(null);
  const monthLabelText = monthLabel(monthKey);

  return (
    <LedgerShell title="生活开销记账" subtitle="累计余额为主 · 卡片角标显示本月变化">
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-5 py-5 text-white">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold tracking-wider text-white/60">
              当前可支配总额（累计）
            </span>
            <span className="num rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
              {monthLabelText}数据已就绪
            </span>
          </div>
          <p
            className={`num mt-2 text-4xl font-black tracking-tight sm:text-5xl ${
              cumulative.total.balanceFen < 0 ? "text-rose-300" : "text-white"
            }`}
          >
            {fenToSymbol(cumulative.total.balanceFen)}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-white/60">累计收入</p>
              <p className="num mt-0.5 text-sm font-bold text-emerald-300">
                {fenToSymbol(cumulative.total.incomeFen)}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-white/60">累计开销</p>
              <p className="num mt-0.5 text-sm font-bold text-rose-300">
                {fenToSymbol(cumulative.total.expenseFen)}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-white/60">{monthLabelText}收入</p>
              <p className="num mt-0.5 text-sm font-bold text-emerald-300">
                {fenToSymbol(month.total.incomeFen)}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <p className="text-white/60">{monthLabelText}开销</p>
              <p className="num mt-0.5 text-sm font-bold text-rose-300">
                {fenToSymbol(month.total.expenseFen)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3.5 sm:grid-cols-3">
        {categories.map((category) => {
          const theme = CATEGORY_THEME[category.id];
          const totalEntry = findCategory(cumulative, category.id);
          const monthEntry = findCategory(month, category.id);
          return (
            <Link
              key={category.id}
              href={`/${category.id}`}
              className="card group relative overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className={`absolute inset-x-0 top-0 h-1 ${theme.bar}`} />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{category.name}</h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">当前余额（累计）</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${theme.chip}`}>
                  查看明细 →
                </span>
              </div>

              <p
                className={`num mt-2 text-2xl font-black ${
                  totalEntry.balanceFen < 0 ? "text-rose-600" : "text-slate-900"
                }`}
              >
                {fenToSymbol(totalEntry.balanceFen)}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span>
                  累计收入{" "}
                  <span className="num font-semibold text-emerald-600">
                    {fenToSymbol(totalEntry.incomeFen)}
                  </span>
                </span>
                <span>
                  累计开销{" "}
                  <span className="num font-semibold text-rose-600">
                    {fenToSymbol(totalEntry.expenseFen)}
                  </span>
                </span>
              </div>

              <div
                className={`mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r ${theme.soft} px-2.5 py-1.5 text-[11px]`}
              >
                <span className={`font-semibold ${theme.text}`}>{monthLabelText}变化</span>
                <span
                  className={`num font-bold ${
                    monthEntry.balanceFen < 0 ? "text-rose-600" : "text-slate-800"
                  }`}
                >
                  {monthEntry.balanceFen >= 0 ? "+" : "−"}
                  {fenToSymbol(Math.abs(monthEntry.balanceFen))}
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      <p className="mt-3 text-center text-[11px] text-slate-400">
        点击卡片进入该板块的详细统计（内含按月份查看）
      </p>

      <p className="num mt-6 text-center text-[11px] text-slate-400">
        数据读取时间：{formatDateTime(syncedAt)} · 换设备打开同一网址即可看到同样内容
      </p>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setForm({ kind: "create", type: "income" })}
            className="flex-1 rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99]"
          >
            ＋ 收入
          </button>
          <button
            type="button"
            onClick={() => setForm({ kind: "create", type: "expense" })}
            className="flex-1 rounded-xl bg-rose-600 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700 active:scale-[0.99]"
          >
            － 开销
          </button>
        </div>
      </div>

      {form ? (
        <RecordFormModal mode={form} categories={categories} onClose={() => setForm(null)} />
      ) : null}
    </LedgerShell>
  );
}
