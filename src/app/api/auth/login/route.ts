import { json } from "@/lib/http";

import { DEFAULT_USERNAME, authenticate } from "@/lib/auth";
import { issueSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式不正确" }, { status: 400 });
  }

  const { username, password } = (body ?? {}) as {
    username?: unknown;
    password?: unknown;
  };
  if (typeof password !== "string" || password.length === 0) {
    return json({ error: "请输入密码" }, { status: 400 });
  }

  const name = typeof username === "string" && username.trim() ? username.trim() : DEFAULT_USERNAME;
  const user = await authenticate(name, password);
  if (!user) {
    return json({ error: "账号或密码不正确" }, { status: 401 });
  }

  return issueSession(user.id);
}
