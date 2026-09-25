"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { quoteFreshness, humanAge } from "@/lib/market/freshness";
import { getMarketStatus } from "@/lib/market/marketStatus";
import type { DataMeta, Quote } from "@/lib/market/types";
import { n, pct } from "@/lib/format";

interface FreshnessCfg { maxMarketDataAgeSec: number; maxMarketDataAgeClosedSec: number }

interface Ctx {
  quotes: Record<string, Quote | null>;
  now: number;
  cfg: FreshnessCfg;
  lastPoll: number | null;
  pollError: string | null;
}

const QuotesContext = createContext<Ctx | null>(null);

/**
 * Atualização "realtime" por polling server-side (as API keys ficam no backend).
 * Intervalo: 15s com mercado aberto, 60s fora do pregão (pausado com a aba oculta).
 */
export function LiveQuotesProvider({ initial, cfg, children }: { initial: Record<string, Quote | null>; cfg: FreshnessCfg; children: React.ReactNode }) {
  const [quotes, setQuotes] = useState(initial);
  // 0 até montar no cliente: evita divergência de hidratação com o relógio do servidor.
  const [now, setNow] = useState(0);
  const [lastPoll, setLastPoll] = useState<number | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const tickers = useMemo(() => Object.keys(initial).join(","), [initial]);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/quotes?tickers=${encodeURIComponent(tickers)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { quotes: Record<string, Quote | null> };
        if (!cancelled) {
          setQuotes((prev) => {
            const next = { ...prev };
            for (const [k, v] of Object.entries(body.quotes)) if (v) next[k] = v;
            return next;
          });
          setLastPoll(Date.now());
          setPollError(null);
        }
      } catch (err) {
        if (!cancelled) setPollError(err instanceof Error ? err.message : "erro");
      } finally {
        if (!cancelled) {
          const open = getMarketStatus() === "OPEN";
          timer = setTimeout(poll, document.hidden ? 120_000 : open ? 15_000 : 60_000);
        }
      }
    }
    // Primeira atualização imediata: a página pode ter vindo do cache de navegação.
    timer = setTimeout(poll, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tickers]);

  return <QuotesContext.Provider value={{ quotes, now, cfg, lastPoll, pollError }}>{children}</QuotesContext.Provider>;
}

function useQuotes() {
  const ctx = useContext(QuotesContext);
  if (!ctx) throw new Error("LiveQuotesProvider ausente");
  return ctx;
}

export function LivePrice({ ticker, fallback }: { ticker: string; fallback?: number | null }) {
  const { quotes } = useQuotes();
  const q = quotes[ticker];
  const price = q?.price ?? fallback ?? null;
  return (
    <span className="num">
      {n(price)}
      {q?.session === "EXTENDED" && <span className="badge badge-warn" style={{ marginLeft: 6 }} title="Preço de pré/pós-mercado, não da sessão regular">estendido</span>}
    </span>
  );
}

export function LiveChange({ ticker }: { ticker: string }) {
  const { quotes } = useQuotes();
  const v = quotes[ticker]?.change_pct ?? null;
  return <span className={`num ${v !== null && Math.abs(v) >= 3 ? (v > 0 ? "pos" : "neg") : "muted"}`}>{pct(v, 2, true)}</span>;
}

export function freshnessBadge(meta: DataMeta | null | undefined, now: number, cfg: FreshnessCfg) {
  const f = quoteFreshness(meta, new Date(now), undefined, cfg);
  const cls = f.level === "realtime" || f.level === "fresh" ? "badge" : f.level === "delayed" ? "badge badge-warn" : "badge badge-neg";
  return { f, cls };
}

export function LiveFreshness({ ticker }: { ticker: string }) {
  const { quotes, now, cfg } = useQuotes();
  const q = quotes[ticker];
  if (!now) return <span className="badge">…</span>;
  const { f, cls } = freshnessBadge(q?.meta, now, cfg);
  return <span className={cls} title={q ? `Fonte: ${q.meta.source} · realtime: ${q.meta.is_realtime ? "sim" : "não"}` : "sem dado"}>{f.level === "stale" || f.level === "missing" ? "⚠️ " : ""}{f.label}</span>;
}

/** Resumo global: pior frescor entre os ativos. */
export function GlobalFreshness() {
  const { quotes, now, cfg, lastPoll, pollError } = useQuotes();
  if (!now) return <span className="small faint">Verificando validade dos dados…</span>;
  const list = Object.values(quotes);
  const evaluated = list.map((q) => quoteFreshness(q?.meta, new Date(now), undefined, cfg));
  const blocked = evaluated.filter((f) => f.blocksPriceDecisions).length;
  const newest = list.filter(Boolean).map((q) => new Date(q!.meta.timestamp).getTime()).sort((a, b) => b - a)[0];
  const age = newest ? Math.round((now - newest) / 1000) : null;
  const status = getMarketStatus(new Date(now));
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="small">
        {age !== null ? <>Última cotação: há <strong className="num">{humanAge(age)}</strong> · {new Date(newest!).toLocaleTimeString("pt-BR", { timeZone: "America/New_York" })} ET</> : "Sem cotações"}
      </span>
      {blocked > 0 && (
        <span className="badge badge-neg badge-wrap">⚠️ {blocked} ativo(s) com dados {status === "OPEN" ? "atrasados/desatualizados" : "desatualizados"} — aporte baseado em preço bloqueado para eles</span>
      )}
      <span className="xsmall faint">
        {lastPoll ? `Verificado há ${Math.round((now - lastPoll) / 1000)}s` : "Atualização automática ativa"}{pollError ? ` · falha na atualização (${pollError})` : ""}
      </span>
    </div>
  );
}
