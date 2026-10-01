"use client";

import { monthLabel } from "@/lib/dates";

export function MonthSelector({
  months,
  value,
  onChange,
  includeAllTime = false,
  allTimeLabel = "全部时间（累计）",
}: {
  months: string[];
  value: string | null;
  onChange: (month: string | null) => void;
  includeAllTime?: boolean;
  allTimeLabel?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      <select
        value={value ?? "__all__"}
        onChange={(event) => onChange(event.target.value === "__all__" ? null : event.target.value)}
        className="cursor-pointer bg-transparent text-xs font-semibold text-slate-800 outline-none"
      >
        {includeAllTime ? <option value="__all__">{allTimeLabel}</option> : null}
        {months.map((month) => (
          <option key={month} value={month}>
            {monthLabel(month)}
          </option>
        ))}
      </select>
    </label>
  );
}
