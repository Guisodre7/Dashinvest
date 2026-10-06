"use client";
import { useMemo, useState, useTransition } from "react";
import { saveLadder } from "@/app/(app)/oportunidades/actions";

type Step = { price: string; pct: string };
const fmt = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const toNum = (s: string) => Number(s.replace(",", "."));

/**
 * Estratégia de escada: vender X% em degraus de preço e recomprar em degraus
 * mais baixos. Mostra o cenário completo antes de salvar. É só um plano: o
 * monitor avisa quando o preço chega a um degrau; nenhuma ordem é enviada.
 */
export default function LadderPlanner({ ticker, price, fairMean, quantity, avgCost, fee, taxRate, saved }: {
  ticker: string; price: number; fairMean: number | null; quantity: number; avgCost: number; fee: number; taxRate: number;
  saved: { sell: { price: number; pct: number }[]; rebuy: { price: number; pct: number }[] } | null;
}) {
  const anchor = fairMean ?? price;
  const def = (xs: [number, number][]) => xs.map(([m, p]) => ({ price: (anchor * m).toFixed(2), pct: String(p) }));
  const [sell, setSell] = useState<Step[]>(saved?.sell.length ? saved.sell.map((s) => ({ price: String(s.price), pct: String(s.pct) })) : def([[1.15, 10], [1.3, 10], [1.45, 10]]));
  const [rebuy, setRebuy] = useState<Step[]>(saved?.rebuy.length ? saved.rebuy.map((s) => ({ price: String(s.price), pct: String(s.pct) })) : def([[1.0, 25], [0.92, 35], [0.85, 40]]));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const sim = useMemo(() => {
    let shares = quantity, cash = 0, tax = 0, sold = 0;
    const sellRows = sell.map((s) => {
      const p = toNum(s.price), pct = toNum(s.pct);
      const q = Math.floor(quantity * pct / 100 * 1e4) / 1e4;
      if (!(p > 0) || !(q > 0)) return null;
      const t = Math.max(0, (p - avgCost) * q) * taxRate;
      shares -= q; sold += q; cash += q * p - fee - t; tax += t;
      return { p, q, after: shares };
    });
    let cost = quantity * avgCost - sold * avgCost;
    const rebuyRows = rebuy.map((s) => {
      const p = toNum(s.price), pct = toNum(s.pct);
      const q = Math.floor(sold * pct / 100 * 1e4) / 1e4;
      if (!(p > 0) || !(q > 0)) return null;
      shares += q; cash -= q * p + fee; cost += q * p;
      return { p, q, after: shares };
    });
    return { sellRows, rebuyRows, shares, cash, tax, sold, avg: shares > 0 ? cost / shares : 0 };
  }, [sell, rebuy, quantity, avgCost, fee, taxRate]);

  const rowsTable = (steps: Step[], set: (s: Step[]) => void, rows: typeof sim.sellRows, unit: string) => (
    <table className="ladder">
      <thead><tr><th>Preço (US$)</th><th>% {unit}</th><th className="num">Cotas</th><th className="num">Posição depois</th></tr></thead>
      <tbody>{steps.map((s, i) => (
        <tr key={i}>
          <td><input aria-label="Preço" inputMode="decimal" value={s.price} onChange={(e) => set(steps.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} /></td>
          <td><input aria-label="Percentual" inputMode="decimal" value={s.pct} onChange={(e) => set(steps.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} /></td>
          <td className="num">{rows[i] ? fmt(rows[i]!.q, 4) : "—"}</td>
          <td className="num">{rows[i] ? fmt(rows[i]!.after, 4) : "—"}</td>
        </tr>
      ))}</tbody>
    </table>
  );

  return (
    <div className="card stack">
      <div className="row-between"><h3>Estratégia de escada</h3><span className="xsmall faint">planejamento — não é ordem</span></div>
      <p className="xsmall faint">Degraus sugeridos a partir do valor justo estimado (US$ {fmt(anchor)}). Ajuste à vontade. % da venda é sobre a posição atual; % da recompra é sobre o total vendido.</p>
      <strong className="small">Venda parcial</strong>
      {rowsTable(sell, setSell, sim.sellRows, "da posição")}
      <strong className="small">Recompra</strong>
      {rowsTable(rebuy, setRebuy, sim.rebuyRows, "do vendido")}
      <div className="callout small">
        <strong>Cenário se todos os degraus acontecerem</strong>
        <span>Vende {fmt(sim.sold, 4)} cotas · imposto estimado US$ {fmt(sim.tax)} · termina com {fmt(sim.shares, 4)} cotas (hoje {fmt(quantity, 4)}) e {sim.cash >= 0 ? "caixa extra" : "custo adicional"} de US$ {fmt(Math.abs(sim.cash))} · preço médio ≈ US$ {fmt(sim.avg)}.</span>
        <span className="xsmall faint">Se o preço só subir, você mantém {fmt(quantity - sim.sold, 4)} cotas expostas à alta. Se cair até os degraus de recompra, recompõe a posição com custo menor.</span>
      </div>
      <div className="row-wrap">
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => {
          const conv = (xs: Step[]) => xs.map((x) => ({ price: toNum(x.price), pct: toNum(x.pct) }));
          const r = await saveLadder(ticker, conv(sell), conv(rebuy));
          setMsg({ ok: r.ok, text: r.message ?? "" });
        })}>{pending ? "Salvando…" : "Salvar plano e avisar nos degraus"}</button>
        {saved && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { const r = await saveLadder(ticker, [], []); setMsg({ ok: r.ok, text: r.message ?? "" }); })}>Remover plano</button>}
        {msg && <span className={`small ${msg.ok ? "pos" : "neg"}`} role="status">{msg.text}</span>}
      </div>
    </div>
  );
}
