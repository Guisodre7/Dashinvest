import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

/** Chamado pelo service worker ao tocar na notificação: marca como aberta e lida. */
export async function POST(request: NextRequest) {
  const { user, reason } = await getSessionUser();
  if (!user || reason) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 20) : [];
  const repo = await getRepo(user.id);
  const now = new Date().toISOString();
  for (const id of ids) await repo.updateNotification(id, { opened_at: now, read_at: now });
  return NextResponse.json({ ok: true, unread: await repo.countUnreadNotifications() });
}
