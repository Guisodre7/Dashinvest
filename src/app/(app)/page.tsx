import Link from "next/link";
import ContributionForm from "@/components/ContributionForm";
import StaleRefresher from "@/components/StaleRefresher";
import { GlobalFreshness, LiveQuotesProvider } from "@/components/LiveQuotes";
import { LiveHeroValue, LivePortfolioKpis, LivePortfolioProvider, LivePortfolioTable } from "@/components/LivePortfolio";
import { AlertsList, MacroPanel, RadarTable, WhereToInvest } from "@/components/sections";
import { allocate } from "@/lib/analysis/allocation";
import { ACTION_META } from "@/lib/analysis/stance";
import { requireUser } from "@/lib/auth";
import { loadContext } from "@/lib/data/load";
import { loadStances } from "@/lib/data/stances";
import { dateBr, pct, tone, usd } from "@/lib/format";
import { freshnessConfig } from "@/lib/freshness-config";

const TABS = [
  { key: "resumo", label: "Resumo" }, { key: "aporte", label: "Aporte" }, { key: "carteira", label: "Carteira" },
  { key: "radar", label: "Radar" }, { key: "macro", label: "Macro" }, { key: "alertas", label: "Alertas" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const user = await requireUser();
  const { aba } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === aba) ? (aba as Tab) : "resumo";
  const ctx = await loadContext(user);
  const { portfolio, analyses } = ctx;

  // Alertas do sistema: um aviso agregado de dados atrasados (não um por ativo).
  const systemAlerts: { severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; title: string; message: string }[] = [];
  const stale = analyses.filter((a) => a.dataQuality.criticalStale).map((a) => a.ticker);
  if (stale.length) systemAlerts.push({ severity: "HIGH", title: "⚠️ Dados desatualizados", message: `${stale.join(", ")}: ${analyses.find((a) => a.dataQuality.criticalStale)?.freshness.label}. Decisão de aporte baseada em preço bloqueada para esses ativos.` });
  if (ctx.fxStale) systemAlerts.push({ severity: "MEDIUM", title: "Câmbio USD/BRL indisponível ou antigo", message: "Valores em BRL e retorno cambial podem não estar disponíveis." });
  for (const a of analyses) if (!a.strategy.is_legacy && a.strategy.enabled && a.daysToEarnings !== null && a.daysToEarnings <= 14) {
    systemAlerts.push({ severity: a.daysToEarnings <= 3 ? "HIGH" : "LOW", title: `${a.ticker}: earnings em ${a.daysToEarnings} dia(s)`, message: `${a.events[0]?.title ?? "Resultado"} em ${dateBr(a.events.find((e) => e.kind === "earnings")?.date)}.` });
  }
  const alertCount = systemAlerts.length + ctx.alerts.length;
  const important = [...systemAlerts.filter((a) => a.severity !== "LOW"), ...ctx.alerts.filter((a) => a.severity === "CRITICAL" || a.severity === "HIGH")];

  // Só o que a aba precisa é calculado.
  const needsAllocation = tab === "resumo" || tab === "aporte";
  const [savedAmount, previous, st] = await Promise.all([
    needsAllocation ? ctx.repo.getSetting<number>("default_contribution").catch(() => null) : null,
    tab === "aporte" ? ctx.repo.getLatestRecommendation().catch(() => null) : null,
    tab === "resumo" ? loadStances(ctx, ctx.repo) : null,
  ]);
  const defaultAmount = savedAmount ?? 550;
  const preview = needsAllocation ? allocate({
    contribution: defaultAmount, analyses, values: Object.fromEntries(portfolio.positions.map((p) => [p.ticker, p.valueUsd ?? 0])),
    existingOpportunityCash: ctx.opportunityCashBalance, settings: ctx.settings,
    globalBlockReasons: portfolio.missingPrices.length ? [`Sem preço para ${portfolio.missingPrices.join(", ")}.`] : [],
  }) : null;
  const decisions = (st?.stances ?? []).filter((s) => ["realizacao", "reduzir", "recompra", "comprar", "evitar", "sair"].includes(s.action))
    .sort((a, b) => ["realizacao", "reduzir", "recompra", "sair", "comprar", "evitar"].indexOf(a.action) - ["realizacao", "reduzir", "recompra", "sair", "comprar", "evitar"].indexOf(b.action));
  const fallbackPrices = Object.fromEntries(portfolio.positions.map((p) => [p.ticker, p.price]));
  const movers = [...analyses].filter((a) => a.quote?.change_pct != null).sort((a, b) => Math.abs(b.quote!.change_pct!) - Math.abs(a.quote!.change_pct!)).slice(0, 3);

  return (
    <LiveQuotesProvider initial={ctx.quotes} cfg={{ maxMarketDataAgeSec: freshnessConfig.maxMarketDataAgeSec, maxMarketDataAgeClosedSec: freshnessConfig.maxMarketDataAgeClosedSec }}>
      <LivePortfolioProvider positions={ctx.positions} strategy={ctx.strategy} dividends={ctx.dividends} usdBrl={ctx.fx?.rate ?? null} fallbackPrices={fallbackPrices}>
      {ctx.isDemo && <div className="banner banner-warn" style={{ marginTop: 12 }}><strong>DADOS SINTÉTICOS DE DEMONSTRAÇÃO</strong> — nada nesta tela é real.</div>}

      <section className="dash-head">
        <div className="dash-hero">
          <div className="hero-title">🇺🇸 Carteira Internacional</div>
          <LiveHeroValue fxRate={ctx.fx?.rate ?? null} />
        </div>
        <div className="dash-fresh">
          <GlobalFreshness />
          <StaleRefresher computedAt={ctx.loadedAt} />
        </div>
      </section>
      <section className="grid grid-4 kpis-compact"><LivePortfolioKpis /></section>

      <div className="row-wrap" style={{ marginTop: 12 }}>
        <Link href="/analisar" className="btn btn-primary btn-sm">🔎 Analisar nova compra</Link>
        <Link href="/teses" className="btn btn-sm">📓 Minhas teses</Link>
      </div>

      <nav className="tabs dash-tabs" aria-label="Seções do painel">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "resumo" ? "/" : `/?aba=${t.key}`} scroll={false} aria-current={tab === t.key ? "page" : undefined}>
            {t.label}{t.key === "alertas" && alertCount > 0 ? ` (${alertCount})` : ""}
          </Link>
        ))}
      </nav>

      {tab === "resumo" && (
        <>
          <section className="section grid grid-2">
            <div className="card stack">
              <div className="row-between"><h3>Decisões agora</h3><Link href="/oportunidades" className="small">Oportunidades →</Link></div>
              {decisions.length === 0 ? <p className="small faint">Nada pede ação: posições em faixa justa ou sem dados suficientes.</p> : (
                <ul className="decision-list">
                  {decisions.slice(0, 5).map((s) => (
                    <li key={s.ticker}>
                      <Link href={`/ativo/${encodeURIComponent(s.ticker)}#realizacao`} className="ticker">{s.ticker}</Link>
                      <span className={`badge action-${ACTION_META[s.action].group}`}>{ACTION_META[s.action].emoji} {ACTION_META[s.action].label}</span>
                      <span className="xsmall muted">{s.headline}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card stack">
              <div className="row-between"><h3>Alertas importantes</h3><Link href="/?aba=alertas" scroll={false} className="small">Todos ({alertCount}) →</Link></div>
              {important.length === 0 ? <p className="small faint">Nenhum alerta importante.</p> : (
                <ul className="decision-list">
                  {important.slice(0, 4).map((a, i) => <li key={i}><span className={`sev sev-${a.severity}`}>{a.severity}</span><span className="small">{a.title}</span></li>)}
                </ul>
              )}
              {movers.length > 0 && <p className="xsmall muted">Maiores movimentos hoje: {movers.map((a) => `${a.ticker} ${pct(a.quote!.change_pct, 1, true)}`).join(" · ")}</p>}
            </div>
          </section>

          <section className="section grid grid-2">
            <div className="card stack">
              <div className="row-between"><h3>Próximo aporte ({usd(defaultAmount, 0)})</h3><Link href="/?aba=aporte" scroll={false} className="small">Calcular →</Link></div>
              {preview && preview.lines.filter((l) => l.amount > 0).length ? (
                <ul className="decision-list">
                  {preview.lines.filter((l) => l.amount > 0).slice(0, 4).map((l) => (
                    <li key={l.ticker}><span className="ticker">{l.ticker}</span><span className="small">{l.action}</span><strong className="num">{usd(l.amount)}</strong></li>
                  ))}
                </ul>
              ) : <p className="small faint">{preview?.blocked ? `Aporte bloqueado: ${preview.blockReasons[0] ?? "dados insuficientes"}` : "Sem sugestão de compra com os dados atuais."}</p>}
            </div>
            <div className="card stack">
              <div className="row-between"><h3>Minhas posições</h3><Link href="/?aba=carteira" scroll={false} className="small">Tabela completa →</Link></div>
              <LivePortfolioTable heldOnly />
            </div>
          </section>
        </>
      )}

      {tab === "aporte" && (
        <section className="section stack">
          <div className="card"><ContributionForm defaultAmount={defaultAmount} previous={previous} /></div>
          {preview && <><div className="section-head"><h2>Onde aportar</h2><span className="xsmall faint">prévia para {usd(defaultAmount, 0)} · nenhuma ordem é executada</span></div><WhereToInvest preview={preview} analyses={analyses} /></>}
        </section>
      )}

      {tab === "carteira" && (
        <section className="section">
          <div className="section-head"><h2>Carteira</h2><Link href="/carteira" className="small muted">Editar posições →</Link></div>
          <LivePortfolioTable />
          <p className="xsmall faint" style={{ marginTop: 6 }}>Pesos sobre a carteira estratégica (exclui a posição legada VOO). Retorno total BRL = (1 + retorno do ativo) × (1 + retorno cambial) − 1.</p>
        </section>
      )}

      {tab === "radar" && (
        <section className="section">
          <div className="section-head"><h2>Radar</h2><span className="xsmall faint">valuation · fundamentos · momentum · analistas · drawdown</span></div>
          <RadarTable analyses={analyses} />
        </section>
      )}

      {tab === "macro" && (
        <section className="section" id="macro">
          <MacroPanel macro={ctx.macro} regime={ctx.regime} impacts={ctx.impacts} events={ctx.macroEvents} />
        </section>
      )}

      {tab === "alertas" && (
        <section className="section stack">
          <AlertsList alerts={ctx.alerts} extra={systemAlerts} />
          {ctx.errors.length > 0 && (
            <details className="small">
              <summary className="muted">Consultas sem dado ({ctx.errors.length}) — o sistema mostra “—” em vez de estimar</summary>
              <ul className="clean xsmall faint">{ctx.errors.slice(0, 60).map((e, i) => <li key={i}>{e}</li>)}</ul>
            </details>
          )}
        </section>
      )}
      </LivePortfolioProvider>
    </LiveQuotesProvider>
  );
}
