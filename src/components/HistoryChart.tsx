"use client";
import { AreaSeries, ColorType, createChart, LineSeries, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";

/** Patrimônio (US$) vs custo acumulado — mostra quanto do crescimento veio de aportes. */
export default function HistoryChart({ points }: { points: { t: string; usd: number; cost: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || points.length < 2) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: v("--text-2"), fontFamily: v("--sans") },
      grid: { vertLines: { visible: false }, horzLines: { color: v("--border") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
    });
    // Um ponto por timestamp (segundos), ordenado.
    const dedupe = new Map<number, { usd: number; cost: number }>();
    for (const p of points) dedupe.set(Math.floor(Date.parse(p.t) / 1000), { usd: p.usd, cost: p.cost });
    const rows = [...dedupe.entries()].sort((a, b) => a[0] - b[0]);
    const accent = v("--accent");
    const area = chart.addSeries(AreaSeries, { lineColor: accent, topColor: `${accent}33`, bottomColor: `${accent}00`, lineWidth: 2 });
    area.setData(rows.map(([t, r]) => ({ time: t as UTCTimestamp, value: r.usd })));
    const cost = chart.addSeries(LineSeries, { color: v("--text-3"), lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    cost.setData(rows.map(([t, r]) => ({ time: t as UTCTimestamp, value: r.cost })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points]);
  return (
    <div>
      <div className="row-wrap xsmall muted"><span>— Patrimônio (US$)</span><span className="faint">- - Custo acumulado (aportes)</span></div>
      <div ref={ref} style={{ width: "100%", height: 260 }} />
    </div>
  );
}
