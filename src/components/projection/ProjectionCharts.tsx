"use client";
import { AreaSeries, ColorType, createChart, LineSeries, type IChartApi } from "lightweight-charts";
import { useEffect, useRef } from "react";

export interface LineDef {
  name: string;
  color: string; // nome de variável CSS (ex.: "--pos") ou cor literal
  values: number[]; // um valor por mês (mês 1..N)
  area?: boolean;
  dashed?: boolean;
}

function cssColor(v: string, css: CSSStyleDeclaration) {
  return v.startsWith("--") ? css.getPropertyValue(v).trim() : v;
}

/** Data (YYYY-MM-DD) do mês t a partir do mês atual — eixo X da projeção. */
export function monthDate(t: number, start = new Date()) {
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + t, 1));
  return d.toISOString().slice(0, 10);
}

/** Gráfico de linhas mensal (patrimônio ao longo do tempo), mesmo estilo dos demais gráficos. */
export function MonthlyLinesChart({ lines, initial, height = 320 }: { lines: LineDef[]; initial?: number; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !lines.length || !lines[0].values.length) return;
    const css = getComputedStyle(document.documentElement);
    const chart: IChartApi = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: css.getPropertyValue("--text-2").trim(), fontFamily: css.getPropertyValue("--sans").trim() },
      grid: { vertLines: { visible: false }, horzLines: { color: css.getPropertyValue("--border").trim() } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      localization: { priceFormatter: (p: number) => `R$ ${Math.round(p).toLocaleString("pt-BR")}` },
      handleScroll: false,
      handleScale: false,
    });
    for (const l of lines) {
      const color = cssColor(l.color, css);
      const data = [
        ...(initial !== undefined ? [{ time: monthDate(0), value: initial }] : []),
        ...l.values.map((v, i) => ({ time: monthDate(i + 1), value: v })),
      ];
      const s = l.area
        ? chart.addSeries(AreaSeries, { lineColor: color, topColor: `${color}40`, bottomColor: `${color}08`, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: l.name })
        : chart.addSeries(LineSeries, { color, lineWidth: 2, lineStyle: l.dashed ? 2 : 0, priceLineVisible: false, lastValueVisible: true, title: l.name });
      s.setData(data);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [lines, initial]);
  return (
    <div>
      <div className="row-wrap xsmall muted" style={{ marginBottom: 6 }}>
        {lines.map((l) => (
          <span key={l.name} className="row" style={{ gap: 6 }}>
            <span className="dot" style={{ background: l.color.startsWith("--") ? `var(${l.color})` : l.color }} />{l.name}
          </span>
        ))}
      </div>
      <div ref={ref} className="mchart" style={{ width: "100%", height }} />
    </div>
  );
}
