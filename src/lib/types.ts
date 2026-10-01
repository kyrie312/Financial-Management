import type { CategoryId, RecordType } from "@/lib/db";

export interface SubcategoryView {
  id: number;
  name: string;
}

export interface CategoryView {
  id: CategoryId;
  name: string;
  subcategories: SubcategoryView[];
}

export interface RecordView {
  id: number;
  type: RecordType;
  categoryId: CategoryId;
  categoryName: string;
  subcategoryId: number | null;
  subcategoryName: string | null;
  amountFen: number;
  note: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface AmountBreakdown {
  incomeFen: number;
  expenseFen: number;
  balanceFen: number;
}

export interface CategorySummary extends AmountBreakdown {
  id: CategoryId;
}

export interface SubcategorySummary {
  id: number;
  name: string;
  expenseFen: number;
}

export interface OverallSummary {
  total: AmountBreakdown;
  byCategory: CategorySummary[];
  bySubcategory: SubcategorySummary[];
}

export interface RecordPage {
  items: RecordView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type { CategoryId, RecordType };

/** 三个板块的主题色，全站统一 */
export const CATEGORY_THEME: Record<
  CategoryId,
  { bar: string; chip: string; soft: string; text: string }
> = {
  life: {
    bar: "bg-sky-500",
    chip: "bg-sky-50 text-sky-700 ring-sky-200",
    soft: "from-sky-50 to-white",
    text: "text-sky-700",
  },
  side: {
    bar: "bg-violet-500",
    chip: "bg-violet-50 text-violet-700 ring-violet-200",
    soft: "from-violet-50 to-white",
    text: "text-violet-700",
  },
  school: {
    bar: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    soft: "from-emerald-50 to-white",
    text: "text-emerald-700",
  },
};

/** 环形图配色（生活费 7 个细分） */
export const DONUT_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#6366f1",
  "#64748b",
];
