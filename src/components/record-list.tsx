"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { fenToPlain, fenToSymbol } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import type { CategoryView, RecordType, RecordView } from "@/lib/types";
import { RecordFormModal } from "@/components/record-form";

const PAGE_SIZE = 10;

type PanelMode = "compact" | "full";

export function RecordList({
  title,
  type,
  records,
  page,
  totalPages,
  total,
  pageSize = PAGE_SIZE,
  categories,
  defaultMode = "full",
  emptyHint,
  onPageChange,
}: {
  title: string;
  type: RecordType;
  records: RecordView[];
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  categories: CategoryView[];
  defaultMode?: PanelMode;
  emptyHint?: string;
  onPageChange?: (page: number) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<PanelMode>(defaultMode);
  const [editing, setEditing] = useState<RecordView | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isIncome = type === "income";
  const accentText = isIncome ? "text-emerald-600" : "text-rose-600";

  const remove = async (record: RecordView) => {
    setBusyId(record.id);
    setError(null);
    try {
      const response = await fetch(`/api/records/${record.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "删除失败");
        return;
      }
      setConfirmingId(null);
      router.refresh();
    } catch {
      setError("网络异常，删除失败");
    } finally {
      setBusyId(null);
    }
  };

  const visible = mode === "compact" ? records.slice(0, 4) : records;

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isIncome ? "bg-emerald-500" : "bg-rose-500"}`} />
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            共 {total} 笔
          </span>
        </div>
        {records.length > 0 ? (
          <button
            type="button"
            onClick={() => setMode(mode === "compact" ? "full" : "compact")}
            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            {mode === "compact" ? "展开全部" : "收起"}
          </button>
        ) : null}
      </header>

      {error ? (
        <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700">
          {error}
        </p>
      ) : null}

      {records.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          {emptyHint ?? "还没有记录"}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visible.map((record) => {
            const isConfirming = confirmingId === record.id;
            return (
              <li key={record.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="num text-[11px] text-slate-400">
                        {formatDateTime(record.occurredAt)}
                      </span>
                      {record.subcategoryName ? (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          {record.subcategoryName}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm break-words text-slate-700">
                      {record.note || <span className="text-slate-400">（无备注）</span>}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className={`num text-base font-bold ${accentText}`}>
                      {isIncome ? "+" : "−"}
                      {fenToSymbol(record.amountFen)}
                    </p>
                    <div className="mt-1 flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(record)}
                        className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(isConfirming ? null : record.id)}
                        className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-rose-500 transition hover:bg-rose-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>

                {isConfirming ? (
                  <div className="animate-fade mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                    <span className="text-xs font-medium text-rose-700">
                      删除后，这块的收入/开销/余额/图表都会跟着重算，确定删除这笔
                      {fenToPlain(record.amountFen)} 元吗？
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={busyId === record.id}
                        onClick={() => void remove(record)}
                        className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
                      >
                        {busyId === record.id ? "删除中…" : "确定删除"}
                      </button>
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {mode === "full" && total > pageSize && onPageChange ? (
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <span className="num text-[11px] text-slate-500">
            第 {page} / {totalPages} 页 · 每页 {pageSize} 条
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </footer>
      ) : null}

      {editing ? (
        <RecordFormModal
          mode={{ kind: "edit", record: editing }}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}
