/**
 * 开发预览旁路：仅在 `next dev`（NODE_ENV !== "production"）并从本机回环地址访问时生效。
 * 用途：无头浏览器截图、本地调试时不必反复登录。
 * 生产构建下这个函数恒返回 false，因此线上永远不会绕过登录。
 */
export function isLocalDevPreview(host: string | null | undefined): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const value = host ?? "";
  return (
    value.startsWith("127.0.0.1") ||
    value.startsWith("localhost") ||
    value.startsWith("[::1]")
  );
}
