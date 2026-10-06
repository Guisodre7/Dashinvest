import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serverConfig } from "@/lib/config";
import { getRepo } from "@/lib/db/repo";
import { parsePrefs } from "@/lib/notify/rules";
import { PREFS_KEY, pushConfigured, STATUS_KEY, type MonitorStatus } from "@/lib/notify/service";

export const dynamic = "force-dynamic";

/** Estado do sino: push configurado, preferências, monitor, não lidas e quantas hoje. */
export async function GET() {
  const { user, reason } = await getSessionUser();
  if (!user || reason) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const repo = await getRepo(user.id);
  const ready = await repo.notifyReady();
  const [prefs, status, unread, today] = ready
    ? await Promise.all([
        repo.getSetting(PREFS_KEY).then(parsePrefs),
        repo.getSetting<MonitorStatus>(STATUS_KEY),
        repo.countUnreadNotifications(),
        repo.listNotifications({ limit: 100, since: startOfDayBr() }).then((r) => r.filter((n) => n.delivery === "sent").length),
      ])
    : [parsePrefs(null), null, 0, 0];
  return NextResponse.json(
    { ready, configured: pushConfigured(), publicKey: serverConfig.vapidPublicKey || null, prefs, status, unread, today },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

function startOfDayBr() {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${d}T00:00:00-03:00`).toISOString();
}
