import Link from "next/link";
import ContributionForm from "@/components/ContributionForm";
import StaleRefresher from "@/components/StaleRefresher";
import { GlobalFreshness, LiveQuotesProvider } from "@/components/LiveQuotes";
import { LiveHeroValue, LivePortfolioKpis, LivePortfolioProvider, LivePortfolioTable } from "@/components/LivePortfolio";
import { AlertsList, MacroPanel, RadarTable, WhereToInvest } from "@/components/sections";
import { allocate } from "@/lib/analysis/allocation";
import { requireUser } from "@/lib/auth";
import { loadContext } from "@/lib/data/load";
import { dateBr, pct, tone, usd } from "@/lib/format";
import { freshnessConfig } from "@/lib/freshness-config";

export default async function Dashboard() {
  const user = await requireUser();
  const ctx = await loadContext(user);
  const { portfolio, analyses } = ctx;
  const values = Object.fromEntries(portfolio.positions.map((p) => [p.ticker, p.valueUsd ?? 0]));
  const [savedAmount, previous] = await Promise.all([
    ctx.repo.getSetting<number>("default_contribution").catch(() => null),
    ctx.repo.getLatestRecommendation().catch(() => null),
  ]);
  const defaultAmount = savedAmount ?? 550;
  const preview = allocate({
    contribution: defaultAmount, analyses, values, existingOpportunityCash: ctx.opportunityCashBalance, settings: ctx.settings,
    globalBlockReasons: portfolio.missingPrices.length ? [`Sem preço para ${portfolio.missingPrices.join(", ")}.`] : [],
  });

  const strategic = analyses.filter((a) => !a.strategy.is_legacy && a.strategy.enabled);
  const systemAlerts: { severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; title: string; message: string }[] = [];
  const stale = analyses.filter((a) => a.dataQuality.criticalStale).map((a) => a.ticker);
  if (stale.length) systemAlerts.push({ severity: "HIGH", title: "⚠️ Dados desatualizados", message: `${stale.join(", ")}: ${analyses.find((a) => a.dataQuality.criticalStale)?.freshness.label}. Decisão de aporte baseada em preço bloqueada para esses ativos.` });
  if (ctx.fxStale) systemAlerts.push({ severity: "MEDIUM", title: "Câmbio USD/BRL indisponível ou antigo", message: "Valores em BRL e retorno cambial podem não estar disponíveis." });
  for (const a of strategic) if (a.daysToEarnings !== null && a.daysToEarnings <= 14) {
    systemAlerts.push({ severity: a.daysToEarnings <= 3 ? "HIGH" : "LOW", title: `${a.ticker}: earnings em ${a.daysToEarnings} dia(s)`, message: `${a.events[0]?.title ?? "Resultado"} em ${dateBr(a.events.find((e) => e.kind === "earnings")?.date)}.` });
  }
  const providerErrors = ctx.errors.length;

  // Resumo "o que mudou" (respostas rápidas)
  const movers = [...analyses].filter((a) => a.quote?.change_pct != null).sort((a, b) => Math.abs(b.quote!.change_pct!) - Math.abs(a.quote!.change_pct!)).slice(0, 3);
  const importantNews = analyses.flatMap((a) => a.news.filter((x) => x.impact === "CRITICAL" || x.impact === "HIGH").map((x) => ({ ...x, t: a.ticker })));
  const fundChanges = analyses.filter((a) => a.trend.direction === "falling" || a.trend.direction === "rising");
  const moreInteresting = strategic.filter((a) => a.signals.some((s) => s.kind === "OPPORTUNITY" || s.kind === "VALUATION_COMPRESSION"));
  const stretched = analyses.filter((a) => a.signals.some((s) => s.kind === "ANTI_FOMO") || a.zones.current === "D");
  const nextEvents = [...analyses.flatMap((a) => a.events.map((e) => ({ ...e }))), ...ctx.macroEvents].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const fallbackPrices = Object.fromEntries(portfolio.positions.map((p) => [p.ticker, p.price]));
  const daysTo = (d: string) => Math.round((new Date(`${d}T12:00:00Z`).getTime() - new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`).getTime()) / 86_400_000);

  return (
    <LiveQuotesProvider initial={ctx.quotes} cfg={{ maxMarketDataAgeSec: freshnessConfig.maxMarketDataAgeSec, maxMarketDataAgeClosedSec: freshnessConfig.maxMarketDataAgeClosedSec }}>
      <LivePortfolioProvider positions={ctx.positions} strategy={ctx.strategy} dividends={ctx.dividends} usdBrl={ctx.fx?.rate ?? null} fallbackPrices={fallbackPrices}>
      {ctx.isDemo && <div className="banner banner-warn" style={{ marginTop: 16 }}><strong>DADOS SINTÉTICOS DE DEMONSTRAÇÃO</strong> — nenhum preço, notícia ou estimativa desta tela é real. Configure as API keys para dados reais.</div>}

      <section className="hero">
        <div>
          <div className="hero-title">Carteira Internacional — Guilherme</div>
          <LiveHeroValue fxRate={ctx.fx?.rate ?? null} />
        </div>
        <div className="card card-tight">
          <GlobalFreshness />
          <StaleRefresher computedAt={ctx.loadedAt} />
          <div className="xsmall faint" style={{ marginTop: 6 }}>Fonte: {ctx.providerName || "nenhum fornecedor configurado"}{providerErrors ? ` · ${providerErrors} consulta(s) sem dado` : ""}</div>
        </div>
      </section>

      {!ctx.providerName && <div className="banner banner-neg">Nenhum fornecedor de dados configurado. Defina FINNHUB_API_KEY e/ou ALPHA_VANTAGE_API_KEY.</div>}

      <section className="section grid grid-4">
        <LivePortfolioKpis />
      </section>

      <section className="section">
        <div className="section-head"><h2>💰 Aporte do mês</h2><span className="xsmall faint">Nenhuma ordem é executada — apenas recomendação.</span></div>
        <div className="card"><ContributionForm defaultAmount={defaultAmount} previous={previous} /></div>
      </section>

      <section className="section grid grid-2">
        <div>
          <div className="section-head"><h2>🎯 Onde aportar</h2><span className="xsmall faint">prévia para {usd(defaultAmount, 0)} · ordenado por prioridade</span></div>
          <WhereToInvest preview={preview} analyses={analyses} />
        </div>
        <div>
          <div className="section-head"><h2>🧭 O que mudou</h2></div>
          <div className="card stack small">
            <div><span className="kpi-label">Maiores movimentos</span><div className="row-wrap">{movers.length ? movers.map((a) => <span key={a.ticker} style={{ marginRight: 12 }}><Link href={`/ativo/${a.ticker}`}><strong>{a.ticker}</strong></Link> <span className={tone(a.quote!.change_pct, 2)}>{pct(a.quote!.change_pct, 2, true)}</span></span>) : <span className="faint">sem cotações</span>}</div></div>
            <div><span className="kpi-label">Notícias importantes</span><div>{importantNews.length ? importantNews.slice(0, 3).map((x) => <div key={x.id}><strong>{x.t}</strong> · {x.title} <span className="faint">({x.source})</span></div>) : <span className="faint">Sem notícia recente de alto impacto.</span>}</div></div>
            <div><span className="kpi-label">Fundamentos / estimativas</span><div className="row-wrap">{fundChanges.length ? fundChanges.map((a) => <span key={a.ticker} className={a.trend.direction === "falling" ? "neg" : "pos"} style={{ marginRight: 12 }}>{a.ticker} EPS {a.trend.direction === "falling" ? "↓" : "↑"} <span className="xsmall">30d {pct(a.trend.eps_rev_30d, 1, true)} · 90d {pct(a.trend.eps_rev_90d, 1, true)}</span></span>) : <span className="faint">Sem revisões relevantes detectadas.</span>}</div></div>
            <div><span className="kpi-label">Ficaram mais interessantes</span><div>{moreInteresting.length ? moreInteresting.map((a) => a.ticker).join(", ") : <span className="faint">nenhum sinal de compressão de valuation</span>}</div></div>
            <div><span className="kpi-label">Esticados</span><div>{stretched.length ? stretched.map((a) => a.ticker).join(", ") : <span className="faint">nenhum</span>}</div></div>
            <div><span className="kpi-label">Próximos eventos</span><div>{nextEvents.length ? nextEvents.map((e) => <div key={`${e.ticker}-${e.date}-${e.kind}`}>{e.ticker ?? "Macro"} · {e.title} — em {daysTo(e.date)} dia(s)</div>) : <span className="faint">Nenhum evento no calendário disponível.</span>}</div></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>🚨 Alertas</h2></div>
        <AlertsList alerts={ctx.alerts} extra={systemAlerts} />
      </section>

      <section className="section">
        <div className="section-head"><h2>📊 Carteira</h2><Link href="/carteira" className="small muted">Editar posições →</Link></div>
        <LivePortfolioTable />
        <p className="xsmall faint" style={{ marginTop: 6 }}>Pesos calculados sobre a carteira estratégica (exclui a posição legada VOO). Retorno total BRL = (1 + retorno do ativo) × (1 + retorno cambial) − 1.</p>
      </section>

      <section className="section">
        <div className="section-head"><h2>🧠 Radar</h2><span className="xsmall faint">valuation · fundamentos · momentum · analistas · drawdown</span></div>
        <RadarTable analyses={analyses} />
      </section>

      <section className="section">
        <div className="section-head"><h2>🌎 Macro</h2></div>
        <MacroPanel macro={ctx.macro} regime={ctx.regime} impacts={ctx.impacts} events={ctx.macroEvents} />
      </section>

      {ctx.errors.length > 0 && (
        <details className="section small">
          <summary className="muted">Consultas sem dado ({ctx.errors.length}) — o sistema mostra “—” em vez de estimar</summary>
          <ul className="clean xsmall faint">{ctx.errors.slice(0, 60).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </details>
      )}
      </LivePortfolioProvider>
    </LiveQuotesProvider>
  );
}
