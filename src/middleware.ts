import { NextResponse, type NextRequest } from "next/server";

import { isLocalDevPreview } from "@/lib/dev-preview";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

/**
 * 只放行已登录用户；登录页除外。校验逻辑只用 Web Crypto，因此中间件可以跑在 Edge Runtime。
 */
export async function middleware(request: NextRequest) {
  const previewBypass = isLocalDevPreview(request.headers.get("host"));
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = await verifySessionToken(token);
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!payload && !isLoginPage && !previewBypass) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (payload && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 只拦页面。接口（/api/*）不在这里拦：
     * 1) 接口需要自己返回 401 JSON，被重定向成 HTML 会让客户端解析失败；
     * 2) 每个接口内部都用 requireUser() 校验，不会漏防护。
     */
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|apple-icon.png|robots.txt).*)",
  ],
};
