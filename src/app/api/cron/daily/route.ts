import { NextResponse, type NextRequest } from "next/server";
import { serverConfig } from "@/lib/config";
import { cronAuthorized } from "@/lib/cronAuth";
import { refreshFundBalances } from "@/lib/data/fundQuotas";
import { loadContext } from "@/lib/data/load";
import { getServiceRepo } from "@/lib/db/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job diário (Vercel Cron): grava snapshot da carteira, histórico de
 * estimativas/analistas e alertas; atualiza o saldo dos fundos de renda fixa pela cota
 * da CVM. Protegido por CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) return NextResponse.json({ error: "OWNER_USER_ID ausente" }, { status: 500 });
  const repo = getServiceRepo(ownerId);
  if (!repo) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY ausente" }, { status: 500 });

  // Cota da CVM primeiro (com limite de tempo): uma falha aqui não impede o resto do job.
  const funds = await refreshFundBalances(repo, new Date(), AbortSignal.timeout(30_000)).catch((e) => ({ ok: false, message: String(e), updated: [] }));
  const ctx = await loadContext({ id: ownerId, email: serverConfig.allowedEmail, aal: "aal2" }, { repo });
  const p = ctx.portfolio;
  if (p.missingPrices.length === 0 && p.totalUsd > 0) {
    await repo.saveSnapshot({
      as_of: new Date().toISOString(),
      total_usd: p.totalUsd, total_brl: p.totalBrl, cost_usd: p.costUsd, cost_brl: p.costBrl, usd_brl: p.usdBrl,
      positions: p.positions.map((x) => ({ ticker: x.ticker, quantity: x.quantity, price: x.price, value: x.valueUsd })),
    });
  }
  return NextResponse.json({
    ok: true,
    snapshot: p.missingPrices.length === 0 && p.totalUsd > 0,
    missing_prices: p.missingPrices,
    analyses: ctx.analyses.length,
    alerts: ctx.alerts.length,
    errors: ctx.errors.length,
    funds: { ok: funds.ok, updated: funds.updated.length, message: funds.message },
  });
}
