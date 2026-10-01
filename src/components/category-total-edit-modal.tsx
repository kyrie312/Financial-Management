"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Modal } from "@/components/modal";
import { fenToPlain, fenToSymbol, normalizeYuanInput, parseYuanToFen } from "@/lib/money";
import type { CategoryId, RecordType } from "@/lib/types";

type Operation = "delta" | "setTotal";

function plainToFen(value: string): number | null {
  const parsed = parseYuanToFen(value);
  if (parsed !== null) return parsed;
  const trimmed = value.trim();
  if (trimmed === "0" || trimmed === "0.00") return 0;
  return null;
}

/**
 * 生活费板块的「改总额」弹窗。
 * 两种方式：按金额增减（加/减）或直接改成某个总额；区间跟随页面上的月份选择。
 */
export function CategoryTotalEditModal({
  categoryId,
  type,
  subcategoryId,
  label,
  currentFen,
  periodText,
  month,
  onClose,
}: {
  categoryId: CategoryId;
  type: RecordType;
  subcategoryId: number | null;
  label: string;
  currentFen: number;
  periodText: string;
  month: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [operation, setOperation] = useState<Operation>("delta");
  const [deltaSign, setDeltaSign] = useState<1 | -1>(1);
  const [delta, setDelta] = useState("");
  const [total, setTotal] = useState(fenToPlain(currentFen));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [operation]);

  const isIncome = type === "income";
  const actionText = isIncome ? "收入" : "开销";

  const parsedDelta = useMemo(() => plainToFen(delta), [delta]);
  const parsedTotal = useMemo(() => plainToFen(total), [total]);

  const previewFen = useMemo(() => {
    if (operation === "delta") {
      if (parsedDelta === null) return null;
      return currentFen + deltaSign * parsedDelta;
    }
    return parsedTotal;
  }, [operation, parsedDelta, deltaSign, currentFen, parsedTotal]);

  const submit = async () => {
    setError(null);

    if (operation === "delta") {
      if (parsedDelta === null || parsedDelta === 0) {
        setError("请输入要调整的金额（大于 0）");
        return;
      }
    } else if (parsedTotal === null) {
      setError("请输入新的总额（可以是 0，表示清零）");
      return;
    }
    if (previewFen !== null && previewFen < 0) {
      setError("调整后总额会变成负数，请检查金额");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/records/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          categoryId,
          type,
          subcategoryId,
          operation,
          amount:
            operation === "delta"
              ? fenToPlain((parsedDelta ?? 0) * deltaSign)
              : fenToPlain(parsedTotal ?? 0),
          month,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "修改失败，请重试");
        setSaving(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("网络异常，修改失败");
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`修改${label}${actionText}`}
      subtitle={`区间：${periodText} · 当前 ${fenToSymbol(currentFen)}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex-[1.4] rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "保存中…" : "确认修改"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setOperation("delta");
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
              operation === "delta" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            按金额增减
          </button>
          <button
            type="button"
            onClick={() => {
              setOperation("setTotal");
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
              operation === "setTotal" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            直接改成
          </button>
        </div>

        {operation === "delta" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeltaSign(1);
                  setError(null);
                }}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition ${
                  deltaSign === 1
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                ＋ 加
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeltaSign(-1);
                  setError(null);
                }}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition ${
                  deltaSign === -1
                    ? "border-rose-500 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                － 减
              </button>
            </div>

            <div>
              <label className="label" htmlFor="delta">
                调整金额（元）
              </label>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-400">
                <span className="num text-xl font-bold text-slate-400">
                  {deltaSign === 1 ? "＋" : "－"}¥
                </span>
                <input
                  id="delta"
                  ref={inputRef}
                  inputMode="decimal"
                  value={delta}
                  onChange={(event) => {
                    setDelta(normalizeYuanInput(event.target.value));
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submit();
                  }}
                  placeholder="0.00"
                  className="num w-full bg-transparent text-xl font-bold text-slate-900 outline-none placeholder:text-slate-300"
                />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="total">
              改成新的{actionText}总额（元）
            </label>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-400">
              <span className="num text-xl font-bold text-slate-400">¥</span>
              <input
                id="total"
                ref={inputRef}
                inputMode="decimal"
                value={total}
                onChange={(event) => {
                  setTotal(normalizeYuanInput(event.target.value));
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                placeholder="0.00"
                className="num w-full bg-transparent text-xl font-bold text-slate-900 outline-none placeholder:text-slate-300"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">填 0 表示把这个类目清零</p>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
          <span className="text-xs font-semibold text-slate-500">修改后</span>
          <span
            className={`num font-bold ${
              previewFen !== null && previewFen < 0 ? "text-rose-600" : "text-slate-900"
            }`}
          >
            {previewFen === null ? "—" : fenToSymbol(previewFen)}
          </span>
        </div>

        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
          改动会计入「{periodText}」这个区间：原有的同类记录会被这次结果替换，所以汇总、占比、余额都会立刻跟着变。
        </p>

        {error ? (
          <p className="animate-fade rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
