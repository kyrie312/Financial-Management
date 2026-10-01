import { DEFAULT_USERNAME, ensureDefaultUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "登录 · 生活开销记账" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // 首次访问时用 .env.local 里的 APP_PASSWORD 初始化账号（已有账号则不动）
  await ensureDefaultUser();

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <LoginForm defaultUsername={DEFAULT_USERNAME} />
    </div>
  );
}
