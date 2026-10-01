import { fenToSymbol } from "@/lib/money";

export type TileTone = "neutral" | "income" | "expense" | "balance";

const TONE: Record<TileTone, { label: string; value: string; ring: string }> = {
  neutral: { label: "text-slate-500", value: "text-slate-900", ring: "ring-slate-100" },
  income: { label: "text-emerald-600", value: "text-emerald-700", ring: "ring-emerald-100" },
  expense: { label: "text-rose-600", value: "text-rose-700", ring: "ring-rose-100" },
  balance: { label: "text-slate-500", value: "text-slate-900", ring: "ring-slate-100" },
};

export function StatTile({
  label,
  fen,
  tone = "neutral",
  hint,
}: {
  label: string;
  fen: number;
  tone?: TileTone;
  hint?: string;
}) {
  const theme = TONE[tone];
  const negative = fen < 0;
  return (
    <div className={`card ring-1 ${theme.ring} px-3.5 py-3`}>
      <p className={`text-[11px] font-semibold ${theme.label}`}>{label}</p>
      <p
        className={`num mt-1 text-lg font-black ${
          negative && tone !== "income" ? "text-rose-600" : theme.value
        }`}
      >
        {fenToSymbol(fen)}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}
