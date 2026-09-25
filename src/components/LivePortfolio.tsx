"use client";
import { createContext, useContext, useMemo } from "react";
import type { StrategyRow } from "@/lib/analysis/analyze";
import { brl, n, pct, tone, usd } from "@/lib/format";
import { computePortfolio, type DividendRow, type PortfolioSummary, type PositionRow } from "@/lib/portfolio/calc";
import { useQuotes } from "./LiveQuotes";
import { Kpi, PortfolioTable } from "./sections";

const PortfolioContext = createContext<PortfolioSummary | null>(null);

/**
 * Recalcula o patrimônio no navegador a cada cotação nova (mesma função do
 * servidor): se o VOO sobe US$ 1, valor, L/P, retornos e pesos acompanham.
 * Sem cotação ao vivo para um ativo, usa o último preço vindo do servidor.
 */
export function LivePortfolioProvider({ positions, strategy, dividends, usdBrl, fallbackPrices, children }: {
  positions: PositionRow[]; strategy: StrategyRow[]; dividends: DividendRow[]; usdBrl: number | null;
  fallbackPrices: Record<string, number | null>; children: React.ReactNode;
}) {
  const { quotes } = useQuotes();
  const portfolio = useMemo(() => {
    const prices = Object.fromEntries(positions.map((p) => [p.ticker, quotes[p.ticker]?.price ?? fallbackPrices[p.ticker] ?? null]));
    return computePortfolio(positions, prices, strategy, dividends, usdBrl);
  }, [positions, strategy, dividends, usdBrl, fallbackPrices, quotes]);
  return <PortfolioContext.Provider value={portfolio}>{children}</PortfolioContext.Provider>;
}

function useLivePortfolio() {
  const p = useContext(PortfolioContext);
  if (!p) throw new Error("LivePortfolioProvider ausente");
  return p;
}

export function LiveHeroValue({ fxRate }: { fxRate: number | null }) {
  const portfolio = useLivePortfolio();
  return (
    <>
      <div className="hero-value num">{usd(portfolio.totalUsd)}</div>
      <div className="row-wrap small muted">
        <span className="num">{portfolio.totalBrl !== null ? brl(portfolio.totalBrl) : "BRL indisponível"}{fxRate !== null && <span className="faint"> · USD/BRL {n(fxRate, 4)}</span>}</span>
        <span className={`num ${tone(portfolio.assetReturn)}`}>Ativos {pct(portfolio.assetReturn, 2, true)}</span>
        <span className={`num ${tone(portfolio.fxReturn)}`}>Câmbio {pct(portfolio.fxReturn, 2, true)}</span>
        <span className={`num ${tone(portfolio.totalReturnBrl)}`}>Total BRL {pct(portfolio.totalReturnBrl, 2, true)}</span>
      </div>
    </>
  );
}

export function LivePortfolioKpis() {
  const portfolio = useLivePortfolio();
  return (
    <>
      <Kpi label="Custo investido" value={usd(portfolio.costUsd)} sub={portfolio.costBrl !== null ? brl(portfolio.costBrl) : "câmbio de compra não informado"} />
      <Kpi label="Lucro / prejuízo" value={usd(portfolio.pnlUsd)} cls={tone(portfolio.pnlUsd)} sub="retorno do ativo em US$" />
      <Kpi label="Proventos recebidos" value={usd(portfolio.dividendsUsd)} sub="dividendos + distribuições líquidos" />
      <Kpi label="Posição legada / Anchor" value={usd(portfolio.legacyUsd)} sub="VOO — monitorado, fora dos aportes" />
    </>
  );
}

export function LivePortfolioTable() {
  return <PortfolioTable portfolio={useLivePortfolio()} />;
}

/** Valor de uma posição com o preço ao vivo (página do ativo). */
export function LivePositionValue({ ticker, quantity, fallbackPrice }: { ticker: string; quantity: number; fallbackPrice: number | null }) {
  const { quotes } = useQuotes();
  const price = quotes[ticker]?.price ?? fallbackPrice;
  return <>{usd(price !== null ? quantity * price : null)}</>;
}
