import { NextResponse } from "next/server";

/**
 * 统一 JSON 响应：显式声明 charset=utf-8。
 * 某些客户端（例如 Windows PowerShell 5.1 的 Invoke-RestMethod）在没有 charset 时会按
 * 系统 ANSI 编码解析响应体，导致中文变成乱码。
 */
export function json<T>(data: T, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(data, {
    status: init?.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}
