"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ defaultUsername }: { defaultUsername: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "登录失败");
        setBusy(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("网络异常，请重试");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-6">
      <div className="mb-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-lg font-black text-white">
          账
        </span>
        <h1 className="mt-3 text-lg font-bold text-slate-900">生活开销记账</h1>
        <p className="mt-1 text-xs text-slate-500">登录后即可记账，登录状态保持 30 天</p>
      </div>

      <label className="label" htmlFor="username">
        账号
      </label>
      <input
        id="username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
        className="mt-1.5 mb-4 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-slate-400"
      />

      <label className="label" htmlFor="password">
        密码
      </label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        placeholder="请输入密码"
        className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-slate-400"
      />

      {error ? (
        <p className="animate-fade mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? "登录中…" : "登录"}
      </button>

      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
        首次使用：账号 <span className="num font-bold">{defaultUsername}</span>，密码
        <span className="num font-bold"> admin123</span>。登录后请到「设置」里改成自己的密码。
      </p>
    </form>
  );
}
