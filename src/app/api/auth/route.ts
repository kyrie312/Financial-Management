import { json } from "@/lib/http";

import { DEFAULT_PASSWORD, changeOwnPassword, ensureDefaultUser } from "@/lib/auth";
import { requireUser, usingDefaultPassword } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  await ensureDefaultUser();
  const auth = await requireUser();
  if (auth.response) return auth.response;
  return json({
    username: auth.user.username,
    usingDefaultPassword: usingDefaultPassword(),
    defaultPassword: usingDefaultPassword() ? DEFAULT_PASSWORD : null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式不正确" }, { status: 400 });
  }

  const { currentPassword, newPassword } = (body ?? {}) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return json({ error: "请填写当前密码和新密码" }, { status: 400 });
  }

  try {
    await changeOwnPassword(auth.user.id, currentPassword, newPassword);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "修改失败" },
      { status: 400 },
    );
  }
  return json({ ok: true });
}
