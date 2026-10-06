import { NextResponse, type NextRequest } from "next/server";
import { serverConfig } from "@/lib/config";
import { cronAuthorized } from "@/lib/cronAuth";
import { getServiceRepo } from "@/lib/db/repo";
import { runMonitor } from "@/lib/notify/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Monitor de notificações: uma rotina central (carteira, preços, valuation,
 * notícias, macro, Brasil). Chamado pelo agendamento do Supabase (pg_cron,
 * de hora em hora) e pelo cron diário da Vercel. Protegido por CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) return NextResponse.json({ error: "OWNER_USER_ID ausente" }, { status: 500 });
  const repo = getServiceRepo(ownerId);
  if (!repo) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY ausente" }, { status: 500 });
  try {
    const result = await runMonitor(repo, { id: ownerId, email: serverConfig.allowedEmail, aal: "aal2" });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
