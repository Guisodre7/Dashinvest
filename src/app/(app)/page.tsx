import Link from "next/link";
import { FlagUS } from "@/components/Icons";
import ContributionForm from "@/components/ContributionForm";
import StaleRefresher from "@/components/StaleRefresher";
import { GlobalFreshness, LiveQuotesProvider } from "@/components/LiveQuotes";
import { LiveHeroValue, LivePortfolioKpis, LivePortfolioProvider, LivePortfolioTable } from "@/components/LivePortfolio";
import SourceLinks from "@/components/SourceLinks";
import ValueRange from "@/components/ValueRange";
import AuditList from "@/components/AuditList";
import { listAudit } from "@/lib/data/audit";
import { getTheses, thesisStatuses } from "@/lib/data/theses";
import StanceCard from "@/components/StanceCard";
import { BuyCard, SellCard, type SummaryAsset } from "@/components/SummaryCards";
import WhereBoard, { overTarget, priorityFromStance, type BoardRow } from "@/components/WhereBoard";
import { AlertsList, RadarTable } from "@/components/sections";
import { allocate } from "@/lib/analysis/allocation";
import { requireUser } from "@/lib/auth";
import { loadContext } from "@/lib/data/load";
import { getCycleCapital, setCycleCapital } from "@/lib/data/cycleCapital";
import { loadStances, qualityPremiumOf, stanceActions } from "@/lib/data/stances";
import { parseMoneyInput } from "@/lib/userNumber";
import { dateBr, pct, tone, usd } from "@/lib/format";
import { freshnessConfig } from "@/lib/freshness-config";

// Abas desta página (navegadas pelo submenu da carteira; "alertas" pelo link do Resumo).
const TABS = [{ key: "resumo" }, { key: "aporte" }, { key: "carteira" }, { key: "alertas" }] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ aba?: string; valor?: string }> }) {
  const user = await requireUser();
  const { aba, valor } = await searchParams;
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
  const [cycle, previous, st, audit, theses] = await Promise.all([
    needsAllocation ? getCycleCapital(ctx.repo, "US") : null,
    tab === "aporte" ? ctx.repo.getLatestRecommendation().catch(() => null) : null,
    needsAllocation ? loadStances(ctx, ctx.repo) : null,
    tab === "aporte" ? listAudit(ctx.repo, "US") : [],
    tab === "aporte" ? getTheses(ctx.repo).catch(() => []) : [],
  ]);
  const thesisOf = st ? thesisStatuses(theses, st.stances, "US") : {};
  // Capital disponível NESTE ciclo: o valor vindo do plano mensal (Visão geral) ou o já informado
  // neste mês. Sem valor padrão, piso ou teto — a faixa de aportes do perfil é só contexto (spec §2).
  const fromPlan = parseMoneyInput(valor);
  const cycleAmount = fromPlan && fromPlan > 0 ? Math.round(fromPlan * 100) / 100 : cycle?.amount ?? null;
  if (needsAllocation && fromPlan && fromPlan > 0 && fromPlan !== cycle?.amount) await setCycleCapital(ctx.repo, "US", fromPlan);
  const preview = needsAllocation && cycleAmount ? allocate({
    contribution: cycleAmount, analyses, values: Object.fromEntries(portfolio.positions.map((p) => [p.ticker, p.valueUsd ?? 0])),
    existingOpportunityCash: ctx.opportunityCashBalance, settings: ctx.settings,
    globalBlockReasons: portfolio.missingPrices.length ? [`Sem preço para ${portfolio.missingPrices.join(", ")}.`] : [],
    stances: st ? stanceActions(st.stances) : undefined, qualityPremium: st ? qualityPremiumOf(st.stances) : undefined, mood: ctx.mood,
  }) : null;
  // Bloqueado: mostra a causa técnica (ex.: limite do fornecedor), sem esconder o problema.
  if (preview?.blocked) {
    const tech = [...new Set(ctx.errors.filter((e) => /cotação|fundamentos/.test(e)).map((e) => e.replace(/^[^:]+:\s*/, "").slice(0, 120)))].slice(0, 3);
    if (tech.length) preview.blockReasons.push(`Detalhe técnico das fontes: ${tech.join(" · ")}`);
  }
  // "Onde aportar": todo o radar (estratégia + legado), com o valuation de cada ativo dentro da linha.
  const board: BoardRow[] = tab === "aporte" ? analyses.filter((a) => a.strategy.enabled || a.strategy.is_legacy).map((a) => {
    const stance = st?.stances.find((x) => x.ticker === a.ticker) ?? null;
    const line = preview?.lines.find((l) => l.ticker === a.ticker);
    const waitWhy = line && line.amount <= 0 ? line.why.match(/aguardar \((.+)\)\./)?.[1] : undefined;
    return {
      thesis: thesisOf[a.ticker] ? { state: thesisOf[a.ticker].state, reason: thesisOf[a.ticker].reason, href: `/teses/${thesisOf[a.ticker].id}` } : null,
      id: `us-${a.ticker}`, ticker: a.ticker, bucket: a.strategy.is_legacy ? "Legado" : a.strategy.strategy_bucket,
      priority: a.strategy.is_legacy ? "BAIXA" : line ? line.priority : priorityFromStance(stance?.action, a.currentWeight, a.targetWeight),
      price: a.price, cur: "US$" as const, stance, current: a.currentWeight, target: a.targetWeight,
      note: a.strategy.is_legacy ? "Posição legada: não recebe aporte." : [stance?.headline, waitWhy ? `Espera: ${waitWhy}.` : !line && overTarget(a.currentWeight, a.targetWeight) ? "Espera: já na meta ou acima." : null].filter(Boolean).join(" ") || "Sem dados suficientes para valuation.",
      detail: (
        <>
          {stance ? <StanceCard s={stance} price={a.price} name={a.name} compact href={`/ativo/${encodeURIComponent(a.ticker)}#realizacao`} /> : <p className="small faint">Sem faixa de valuation (dados insuficientes).</p>}
          {!a.isEtf && !a.strategy.is_legacy && (
            <ValueRange cur="US$" price={a.price} low={a.fairValue.available ? a.fairValue.min : null} mid={a.fairValue.available ? a.fairValue.mean : null} high={a.fairValue.available ? a.fairValue.max : null}
              scenarios={a.fairValue.scenarios} methods={a.fairValue.estimates.map((e) => ({ label: e.method, value: e.value }))} confidence={a.confidence.level} note={a.fairValue.reason} />
          )}
          {a.signals.filter((x) => x.kind !== "STALE_DATA").length > 0 && (
            <ul className="clean xsmall">{a.signals.filter((x) => x.kind !== "STALE_DATA").slice(0, 3).map((x) => <li key={x.kind} className={x.tone === "positive" ? "pos" : x.tone === "negative" ? "neg" : "muted"}>{x.title}</li>)}</ul>
          )}
          <SourceLinks market="US" ticker={a.ticker} />
          <Link href={`/ativo/${encodeURIComponent(a.ticker)}`} className="small">Análise completa de {a.ticker} →</Link>
        </>
      ),
    };
  }) : [];
  const summaryAssets: SummaryAsset[] = (st?.stances ?? []).map((s) => {
    const a = analyses.find((x) => x.ticker === s.ticker);
    return { stance: s, price: a?.price ?? null, href: `/?aba=aporte#us-${s.ticker}`, weight: a?.currentWeight ?? null, maxWeight: a?.strategy.max_weight ?? null };
  });
  const fallbackPrices = Object.fromEntries(portfolio.positions.map((p) => [p.ticker, p.price]));
  const movers = [...analyses].filter((a) => a.quote?.change_pct != null).sort((a, b) => Math.abs(b.quote!.change_pct!) - Math.abs(a.quote!.change_pct!)).slice(0, 3);

  return (
    <LiveQuotesProvider initial={ctx.quotes} cfg={{ maxMarketDataAgeSec: freshnessConfig.maxMarketDataAgeSec, maxMarketDataAgeClosedSec: freshnessConfig.maxMarketDataAgeClosedSec }}>
      <LivePortfolioProvider positions={ctx.positions} strategy={ctx.strategy} dividends={ctx.dividends} usdBrl={ctx.fx?.rate ?? null} fallbackPrices={fallbackPrices}>
      {ctx.isDemo && <div className="banner banner-warn" style={{ marginTop: 12 }}><strong>DADOS SINTÉTICOS DE DEMONSTRAÇÃO</strong> — nada nesta tela é real.</div>}

      <section className="dash-head">
        <div className="dash-hero">
          <div className="hero-title"><FlagUS size={12} /> Carteira Internacional</div>
          <LiveHeroValue fxRate={ctx.fx?.rate ?? null} />
        </div>
        <div className="dash-fresh">
          <GlobalFreshness />
          <StaleRefresher computedAt={ctx.loadedAt} />
        </div>
      </section>
      <section className="grid grid-4 kpis-compact"><LivePortfolioKpis /></section>

      {tab === "resumo" && (
        <>
          <section className="section grid grid-2">
            <BuyCard items={summaryAssets} cur="US$" href="/?aba=aporte" />
            <SellCard items={summaryAssets} cur="US$" />
          </section>

          <section className="section grid grid-2">
            <div className="card stack">
              <div className="row-between"><h3>Próximo aporte{cycleAmount ? ` (${usd(cycleAmount, 0)})` : ""}</h3><Link href="/?aba=aporte" scroll={false} className="small">{cycleAmount ? "Ver divisão →" : "Informar capital →"}</Link></div>
              {preview && preview.lines.filter((l) => l.amount > 0).length ? (
                <ul className="decision-list">
                  {preview.lines.filter((l) => l.amount > 0).slice(0, 4).map((l) => (
                    <li key={l.ticker}><span className="ticker">{l.ticker}</span><span className="small">{l.action}</span><strong className="num">{usd(l.amount)}</strong></li>
                  ))}
                </ul>
              ) : <p className="small faint">{!cycleAmount ? "Capital disponível deste ciclo ainda não informado — informe quanto tem para aportar e o painel divide pela melhor relação risco/retorno." : preview?.blocked ? `Aporte bloqueado: ${preview.blockReasons[0] ?? "dados insuficientes"}` : "Sem sugestão de compra com os dados atuais."}</p>}
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

          <section className="section">
            <div className="card stack">
              <div className="row-between"><h3>Minhas posições</h3><Link href="/?aba=carteira" scroll={false} className="small">Tabela completa →</Link></div>
              <LivePortfolioTable heldOnly />
            </div>
          </section>
        </>
      )}

      {tab === "aporte" && (
        <section className="section stack">
          <div className="card"><ContributionForm defaultAmount={cycleAmount} previous={previous} /></div>
          <div className="section-head"><h2>Onde aportar</h2><span className="xsmall faint">todo o radar · toque no ativo para ver o valuation</span></div>
          {preview?.blocked && <div className="banner banner-warn small">{preview.blockReasons.join(" ")}</div>}
          <WhereBoard rows={board} />
          <details className="card">
            <summary className="small muted">Radar completo (valuation, fundamentos, momentum, analistas, drawdown)</summary>
            <div style={{ marginTop: 10 }}><RadarTable analyses={analyses} /></div>
          </details>
          <AuditList entries={audit} cur="US$" />
        </section>
      )}

      {tab === "carteira" && (
        <section className="section">
          <div className="section-head"><h2>Posições</h2><Link href="/carteira" className="small muted">Registrar compra/venda →</Link></div>
          <LivePortfolioTable heldOnly />
          <p className="xsmall faint" style={{ marginTop: 6 }}>Pesos sobre a carteira estratégica (exclui a posição legada VOO). Retorno total BRL = (1 + retorno do ativo) × (1 + retorno cambial) − 1.</p>
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
