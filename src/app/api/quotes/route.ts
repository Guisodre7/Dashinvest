import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market";

export const dynamic = "force-dynamic";

/** Cotações para o polling do painel. Autenticado; API keys só no servidor. */
export async function GET(request: NextRequest) {
  const { user, reason } = await getSessionUser();
  if (!user || reason) return NextResponse.json({ error: reason ?? "unauthenticated" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = [...new Set(raw.split(",").map((t) => t.trim().toUpperCase()).filter((t) => /^[A-Z.]{1,10}$/.test(t)))].slice(0, 30);
  const provider = getMarketDataProvider();
  const entries = await Promise.all(tickers.map(async (t) => {
    try { return [t, await provider.getQuote(t)] as const; } catch { return [t, null] as const; }
  }));
  return NextResponse.json(
    { quotes: Object.fromEntries(entries), served_at: new Date().toISOString() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
