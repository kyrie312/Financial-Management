import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { DEFAULT_PASSWORD, SESSION_COOKIE, SESSION_DAYS, createSessionToken, verifySessionToken } from "./auth";
import { queryOne } from "./db";
import { isLocalDevPreview } from "./dev-preview";
import { json } from "./http";

export interface SessionUser {
  id: number;
  username: string;
}

/** 未登录时返回 401 响应，已登录时返回当前用户。 */
export async function requireUser(): Promise<
  { user: SessionUser; response?: never } | { user?: never; response: NextResponse }
> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = await verifySessionToken(token);
  if (!payload) {
    // 开发环境本机预览：允许免登录访问，方便截图和调试（生产构建下不会走到这里）
    if (isLocalDevPreview((await headers()).get("host"))) {
      return { user: { id: 0, username: "本机预览" } };
    }
    return { response: json({ error: "未登录" }, { status: 401 }) };
  }
  const row = await queryOne<{ id: number; username: string }>(
    "SELECT id, username FROM users WHERE id = ?",
    [payload.userId],
  );
  if (!row) {
    return { response: json({ error: "登录状态已失效" }, { status: 401 }) };
  }
  return { user: { id: Number(row.id), username: row.username } };
}

export async function issueSession(userId: number): Promise<NextResponse> {
  const { token, expiresAt } = await createSessionToken(userId, SESSION_DAYS);
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
  return response;
}

export function clearSession(): NextResponse {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}

export function usingDefaultPassword(): boolean {
  return !process.env.APP_PASSWORD || process.env.APP_PASSWORD.trim() === DEFAULT_PASSWORD;
}
