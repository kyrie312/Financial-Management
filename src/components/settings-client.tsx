"use client";

import { useEffect, useState } from "react";

import { LedgerShell } from "@/components/ledger-shell";

export function SettingsClient() {
  const [username, setUsername] = useState("admin");
  const [usingDefault, setUsingDefault] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/auth", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        username: string;
        usingDefaultPassword: boolean;
      };
      setUsername(payload.username);
      setUsingDefault(payload.usingDefaultPassword);
    })();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (newPassword !== repeatPassword) {
      setMessage({ kind: "error", text: "两次输入的新密码不一致" });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage({ kind: "error", text: payload.error ?? "修改失败" });
        return;
      }
      setMessage({ kind: "ok", text: "密码已更新，下次登录请使用新密码" });
      setUsingDefault(false);
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
    } catch {
      setMessage({ kind: "error", text: "网络异常，请重试" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <LedgerShell title="设置" subtitle="账号密码与数据备份" backHref="/">
      {usingDefault ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
          你现在还在用默认密码，建议立刻改成自己的密码。
        </p>
      ) : null}

      <section className="card p-5">
        <h2 className="text-sm font-bold text-slate-900">修改登录密码</h2>
        <p className="mt-1 text-xs text-slate-500">当前账号：{username}</p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="current">
              当前密码
            </label>
            <input
              id="current"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <div>
            <label className="label" htmlFor="next">
              新密码（至少 6 位）
            </label>
            <input
              id="next"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <div>
            <label className="label" htmlFor="repeat">
              再输一次新密码
            </label>
            <input
              id="repeat"
              type="password"
              value={repeatPassword}
              onChange={(event) => setRepeatPassword(event.target.value)}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-slate-400"
            />
          </div>

          {message ? (
            <p
              className={`animate-fade rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                message.kind === "ok"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
            >
              {message.text}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? "提交中…" : "保存新密码"}
          </button>
        </form>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-sm font-bold text-slate-900">数据备份</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          所有记录都保存在这台电脑的项目目录里。建议定期导出一份 CSV 存到网盘，万一电脑出问题也能恢复查看。
        </p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 这是文件下载接口，不是页面 */}
        <a
          href="/api/records?format=csv"
          className="mt-3 inline-block rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          导出全部记录（CSV，Excel 可直接打开）
        </a>
      </section>
    </LedgerShell>
  );
}
