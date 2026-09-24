"use client";
import { CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { DailyBar } from "@/lib/market/types";

const RANGES = [
  { key: "3M", days: 63 },
  { key: "6M", days: 126 },
  { key: "1A", days: 252 },
  { key: "Tudo", days: 100_000 },
];

function smaSeries(bars: DailyBar[], period: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  bars.forEach((b, i) => {
    sum += b.close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) out.push({ time: toTs(b.time), value: sum / period });
  });
  return out;
}

const toTs = (d: string) => (Date.parse(`${d}T00:00:00Z`) / 1000) as UTCTimestamp;

/** Gráfico limpo: candles, volume, SMA20/50/200. Sem indicadores de day trade. */
export default function PriceChart({ bars }: { bars: DailyBar[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState("1A");

  useEffect(() => {
    const el = ref.current;
    if (!el || !bars.length) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: v("--text-2"), fontFamily: v("--sans"), attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: v("--border") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: { mode: 1 },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: v("--text-3"), downColor: v("--text"), borderVisible: false,
      wickUpColor: v("--text-3"), wickDownColor: v("--text"),
    });
    candles.setData(bars.map((b) => ({ time: toTs(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, color: v("--border") });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volume.setData(bars.map((b) => ({ time: toTs(b.time), value: b.volume })));
    const lines: [number, string][] = [[20, "#8aa4c8"], [50, "#c49a4a"], [200, "#6b4fa0"]];
    for (const [p, color] of lines) {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(smaSeries(bars, p));
    }
    const days = RANGES.find((r) => r.key === range)!.days;
    const from = bars[Math.max(0, bars.length - days)].time;
    chart.timeScale().setVisibleRange({ from: toTs(from), to: toTs(bars[bars.length - 1].time) });
    return () => chart.remove();
  }, [bars, range]);

  if (!bars.length) return <div className="empty">Histórico de preços indisponível.</div>;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div className="row-wrap xsmall muted">
          <span><span className="dot" style={{ background: "#8aa4c8" }} /> SMA20</span>
          <span><span className="dot" style={{ background: "#c49a4a" }} /> SMA50</span>
          <span><span className="dot" style={{ background: "#6b4fa0" }} /> SMA200</span>
        </div>
        <div className="row-wrap">
          {RANGES.map((r) => <button key={r.key} type="button" className={`btn btn-sm ${range === r.key ? "" : "btn-ghost"}`} onClick={() => setRange(r.key)}>{r.key}</button>)}
        </div>
      </div>
      <div ref={ref} className="chart" />
    </div>
  );
}
