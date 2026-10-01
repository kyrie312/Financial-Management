import { DONUT_COLORS } from "@/lib/types";
import { fenToSymbol } from "@/lib/money";

export interface DonutDatum {
  label: string;
  valueFen: number;
}

/**
 * 纯 SVG 环形图（不引入图表库）：中间显示总额，右侧图例显示金额与占比。
 * 每个扇形用 stroke-dasharray 画在同一个圆上，避免复杂的 path 计算。
 */
export function DonutChart({
  data,
  centerLabel = "总开销",
  size = 200,
}: {
  data: DonutDatum[];
  centerLabel?: string;
  size?: number;
}) {
  const total = data.reduce((sum, item) => sum + Math.max(item.valueFen, 0), 0);
  const stroke = 26;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = data.filter((item) => item.valueFen > 0).length > 1 ? 1.5 : 0;

  let offset = 0;
  const segments = data.map((item, index) => {
    const value = Math.max(item.valueFen, 0);
    const fraction = total > 0 ? value / total : 0;
    const length = Math.max(fraction * circumference - gap, 0);
    const segment = {
      key: `${item.label}-${index}`,
      color: DONUT_COLORS[index % DONUT_COLORS.length],
      dash: `${length} ${circumference - length}`,
      offset: -offset,
      fraction,
      item,
    };
    offset += fraction * circumference;
    return segment;
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#eef2f7"
            strokeWidth={stroke}
          />
          {total > 0
            ? segments
                .filter((segment) => segment.fraction > 0)
                .map((segment) => (
                  <circle
                    key={segment.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={stroke}
                    strokeDasharray={segment.dash}
                    strokeDashoffset={segment.offset}
                    strokeLinecap="butt"
                  >
                    <title>{`${segment.item.label} ${fenToSymbol(segment.item.valueFen)}`}</title>
                  </circle>
                ))
            : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-semibold text-slate-400">{centerLabel}</span>
          <span className="num mt-0.5 text-lg font-bold text-slate-900">
            {fenToSymbol(total)}
          </span>
        </div>
      </div>

      <ul className="w-full space-y-2">
        {data.map((item, index) => {
          const fraction = total > 0 ? Math.max(item.valueFen, 0) / total : 0;
          return (
            <li key={`${item.label}-legend`} className="flex items-center gap-2.5 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }}
              />
              <span className="w-14 shrink-0 text-slate-700">{item.label}</span>
              <span className="num flex-1 text-right font-semibold text-slate-900">
                {fenToSymbol(item.valueFen)}
              </span>
              <span className="num w-14 shrink-0 text-right text-xs text-slate-500">
                {(fraction * 100).toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
