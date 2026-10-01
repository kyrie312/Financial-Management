import { clearSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  return clearSession();
}
