"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LedgerShell({
  title,
  subtitle,
  backHref,
  backLabel = "返回上一页",
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const logout = async () => {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#f3f5f9]/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          {backHref ? (
            <Link
              href={backHref}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              {backLabel}
            </Link>
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-black text-white">
              账
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-slate-900 sm:text-base">{title}</h1>
            {subtitle ? (
              <p className="truncate text-[11px] text-slate-500 sm:text-xs">{subtitle}</p>
            ) : null}
          </div>

          <nav className="flex shrink-0 items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 这是文件下载接口，不是页面 */}
            <a
              href="/api/records?format=csv"
              className="hidden rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 sm:block"
              title="导出全部记录为 CSV（可用 Excel 打开）"
            >
              导出
            </a>
            <Link
              href="/settings"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              设置
            </Link>
            <button
              type="button"
              onClick={logout}
              disabled={signingOut}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {signingOut ? "退出中" : "退出"}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5">{children}</main>
    </div>
  );
}
