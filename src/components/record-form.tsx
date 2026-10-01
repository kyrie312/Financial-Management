"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/modal";
import { fenToPlain, normalizeYuanInput, parseYuanToFen } from "@/lib/money";
import {
  CATEGORY_THEME,
  type CategoryId,
  type CategoryView,
  type RecordType,
  type RecordView,
} from "@/lib/types";

export type RecordFormMode =
  | { kind: "create"; type: RecordType; presetCategoryId?: CategoryId }
  | { kind: "edit"; record: RecordView };

/** 副业与学校补助的收支都必须写备注（原文强制要求），生活费开销备注可选。 */
function noteRequired(categoryId: CategoryId): boolean {
  return categoryId === "side" || categoryId === "school";
}

function stepTitle(
  mode: RecordFormMode,
  step: 0 | 1 | 2,
  category?: CategoryView,
): { title: string; subtitle: string } {
  const action = mode.kind === "create" ? (mode.type === "income" ? "收入" : "开销") : "记录";
  if (mode.kind === "edit") {
    return { title: "修改这笔记录", subtitle: "金额、备注、板块、细分类型都可以改" };
  }
  if (step === 0) {
    return {
      title: `记一笔${action}`,
      subtitle: mode.type === "income" ? "先选择这笔收入属于哪个板块" : "先选择这笔开销从哪个板块出",
    };
  }
  if (step === 1) {
    return { title: "选择细分类型", subtitle: `${action} · ${category?.name ?? ""}` };
  }
  return {
    title: `填写${category?.name ?? ""}${action}金额`,
    subtitle: noteRequired(category?.id ?? "life")
      ? mode.type === "income"
        ? "备注必填：请写明这笔钱的来源"
        : "备注必填：请写明这笔开销用于做什么"
      : "备注可选，可留空",
  };
}

export function RecordFormModal({
  mode,
  categories,
  onClose,
}: {
  mode: RecordFormMode;
  categories: CategoryView[];
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = mode.kind === "edit";
  const editing = isEdit ? mode.record : null;
  const actionType: RecordType = isEdit ? (editing?.type ?? "expense") : mode.type;

  const [step, setStep] = useState<0 | 1 | 2>(isEdit ? 2 : mode.presetCategoryId ? (actionType === "expense" && mode.presetCategoryId === "life" ? 1 : 2) : 0);
  const [categoryId, setCategoryId] = useState<CategoryId | null>(
    isEdit ? (editing?.categoryId ?? null) : (mode.presetCategoryId ?? null),
  );
  const [subcategoryId, setSubcategoryId] = useState<number | null>(
    isEdit ? (editing?.subcategoryId ?? null) : null,
  );
  const [amount, setAmount] = useState(isEdit && editing ? fenToPlain(editing.amountFen) : "");
  const [note, setNote] = useState(isEdit ? (editing?.note ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const category = useMemo(
    () => categories.find((item) => item.id === categoryId) ?? undefined,
    [categories, categoryId],
  );
  const needsSubcategory = categoryId === "life" && actionType === "expense";
  const mustNote = categoryId ? noteRequired(categoryId) : false;

  useEffect(() => {
    if (step === 2) amountRef.current?.focus();
  }, [step]);

  const goCategory = (id: CategoryId) => {
    setCategoryId(id);
    setSubcategoryId(null);
    setError(null);
    setDirty(true);
    if (id === "life" && actionType === "expense") setStep(1);
    else setStep(2);
  };

  const goSubcategory = (id: number) => {
    setSubcategoryId(id);
    setError(null);
    setDirty(true);
    setStep(2);
  };

  const back = () => {
    setError(null);
    if (step === 2 && needsSubcategory) setStep(1);
    else if (step >= 1) setStep(0);
  };

  const requestClose = () => {
    if (dirty && !saving) {
      const ok = window.confirm("这次填写还没保存，确定关闭吗？");
      if (!ok) return;
    }
    onClose();
  };

  const submit = async () => {
    if (!categoryId) {
      setStep(0);
      setError("请先选择板块");
      return;
    }
    if (needsSubcategory && !subcategoryId) {
      setStep(1);
      setError("生活费开销必须选择细分类型");
      return;
    }
    const amountFen = parseYuanToFen(amount);
    if (amountFen === null) {
      setError("请输入正确的金额，最多两位小数，且大于 0");
      return;
    }
    if (mustNote && !note.trim()) {
      setError(actionType === "income" ? "这笔收入的来源必须填写" : "这笔开销的用途必须填写");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        isEdit && editing ? `/api/records/${editing.id}` : "/api/records",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: actionType,
            categoryId,
            subcategoryId: needsSubcategory ? subcategoryId : null,
            amount: fenToPlain(amountFen),
            note: note.trim(),
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "保存失败，请重试");
        setSaving(false);
        return;
      }
      setDirty(false);
      router.refresh();
      onClose();
    } catch {
      setError("网络异常，保存失败");
      setSaving(false);
    }
  };

  const { title, subtitle } = stepTitle(mode, step, category);
  const isIncome = actionType === "income";
  const accent = categoryId ? CATEGORY_THEME[categoryId] : null;

  return (
    <Modal
      open
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      onRequestClose={requestClose}
      footer={
        step === 0 ? (
          <button
            type="button"
            onClick={requestClose}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            取消
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={back}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ← 返回上一步
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className={`flex-[1.4] rounded-xl py-3 text-sm font-bold text-white shadow-sm transition disabled:opacity-60 ${
                isIncome ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              {saving ? "保存中…" : isEdit ? "保存修改" : "确认提交"}
            </button>
          </>
        )
      }
    >
      {step === 0 ? (
        <div className="space-y-3">
          {categories.map((item) => {
            const theme = CATEGORY_THEME[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goCategory(item.id)}
                className={`flex w-full items-center justify-between rounded-xl border border-slate-200 bg-gradient-to-r ${theme.soft} px-4 py-4 text-left transition hover:border-slate-300 hover:shadow-sm`}
              >
                <span className="text-base font-bold text-slate-900">{item.name}</span>
                <span className={`text-xs font-semibold ${theme.text}`}>
                  {isIncome ? "记收入" : "记开销"} →
                </span>
              </button>
            );
          })}
          <p className="pt-1 text-center text-xs text-slate-400">
            选择后可以随时用「返回上一步」重新选
          </p>
        </div>
      ) : null}

      {step === 1 && category ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {category.subcategories.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => goSubcategory(sub.id)}
              className={`rounded-xl border px-3 py-3.5 text-sm font-semibold transition ${
                subcategoryId === sub.id
                  ? "border-sky-500 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {sub.name}
            </button>
          ))}
        </div>
      ) : null}

      {step === 2 && category ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${accent?.chip ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}>
              {category.name}
            </span>
            {needsSubcategory && subcategoryId ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                {category.subcategories.find((s) => s.id === subcategoryId)?.name}
              </span>
            ) : null}
            <span
              className={`rounded-full px-2.5 py-1 font-semibold ${
                isIncome ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              {isIncome ? "收入" : "开销"}
            </span>
          </div>

          <div>
            <label htmlFor="amount" className="label">
              金额（元）
            </label>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-400">
              <span className="num text-2xl font-bold text-slate-400">¥</span>
              <input
                id="amount"
                ref={amountRef}
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(normalizeYuanInput(event.target.value));
                  setDirty(true);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                placeholder="0.00"
                className="num w-full bg-transparent text-2xl font-bold text-slate-900 outline-none placeholder:text-slate-300"
              />
            </div>
          </div>

          <div>
            <label htmlFor="note" className="label">
              {mustNote ? (isIncome ? "收入来源（必填）" : "开销用途（必填）") : "备注（可选）"}
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setDirty(true);
                setError(null);
              }}
              rows={2}
              placeholder={
                mustNote
                  ? isIncome
                    ? "例如：帮同学做的毕业设计"
                    : "例如：买了台显示器"
                  : "想写就写，可留空"
              }
              className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 placeholder:text-slate-300"
            />
            {mustNote && !note.trim() ? (
              <p className="mt-1.5 text-xs text-amber-600">
                这个板块的{isIncome ? "收入来源" : "开销用途"}是必填的，填好才能提交
              </p>
            ) : null}
          </div>

          <p className="text-xs text-slate-400">
            时间会自动记录为现在（{new Date().toLocaleString("zh-CN", { hour12: false })}），不需要手动填写。
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="animate-fade mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
