import Link from "next/link";
import { Kpi, WeightBar } from "@/components/sections";
import { requireUser } from "@/lib/auth";
import { loadBrazil } from "@/lib/data/brazil";
import { loadContext } from "@/lib/data/load";
import { brl, n, pct, tone, usd } from "@/lib/format";

/** Agrupamento do exterior pelas faixas da estratégia internacional. */
const US_GROUP: Record<string, string> = {
  CRESCIMENTO: "Growth (ações EUA)", "RENDA VIA OPÇÕES": "Income (JEPQ)", "CRÉDITO CORPORATIVO": "Crédito EUA (LQD)",
  "REAL ESTATE": "REITs (VNQ)", LEGADO: "VOO (legado)",
};

export default async function GeralPage() {
  const user = await requireUser();
  const ctx = await loadContext(user);
  const br = await loadBrazil(ctx.repo);
  const fx = ctx.fx?.rate ?? null;
  const us = ctx.portfolio;
  const b = br.summary;

  const usBrl = fx !== null ? us.totalUsd * fx : null;
  const totalBrl = usBrl !== null ? b.currentValue + usBrl : null;
  const totalUsd = fx !== null && totalBrl !== null ? totalBrl / fx : null;
  const share = (v: number | null) => (v !== null && totalBrl ? (v / totalBrl) * 100 : null);

  // Classes consolidadas (R$).
  const groups = new Map<string, number>();
  const add = (k: string, v: number | null) => { if (v !== null && v > 0) groups.set(k, (groups.get(k) ?? 0) + v); };
  for (const c of b.classes) add(`${{ renda_fixa: "Renda fixa (BR)", acao: "Ações Brasil", fii: "FIIs", etf: "ETFs (BR)", caixa: "Caixa (BR)" }[c.asset_class]}`, c.value);
  if (fx !== null) for (const p of us.positions) add(US_GROUP[p.bucket] ?? `${p.bucket} (EUA)`, p.valueUsd !== null ? p.valueUsd * fx : null);
  const rows = [...groups.entries()].sort((a, c) => c[1] - a[1]);

  // Exposição a riscos (aproximada pela classe de cada posição).
  const v = (k: string) => groups.get(k) ?? 0;
  const exposure = [
    { label: "Renda fixa / crédito", value: v("Renda fixa (BR)") + v("Crédito EUA (LQD)") },
    { label: "Ações", value: v("Ações Brasil") + v("Growth (ações EUA)") + v("Income (JEPQ)") + v("VOO (legado)") },
    { label: "Imobiliário (FIIs + REITs)", value: v("FIIs") + v("REITs (VNQ)") },
    { label: "Dólar (todo o exterior)", value: usBrl ?? 0 },
  ];

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero">
        <div>
          <div className="hero-title">Visão geral — Brasil + Exterior</div>
          <div className="hero-value num">{totalBrl !== null ? brl(totalBrl) : "—"}</div>
          <div className="row-wrap small muted">
            <span className="num">{totalUsd !== null ? usd(totalUsd) : "US$ indisponível"}{fx !== null && <span className="faint"> · USD/BRL {n(fx, 4)} ({ctx.fx?.source})</span>}</span>
          </div>
          {fx === null && <p className="xsmall neg">Sem câmbio USD/BRL disponível: não é possível somar as duas carteiras agora.</p>}
          {(b.missingValues.length > 0 || us.missingPrices.length > 0) && <p className="xsmall neg">Patrimônio parcial — sem preço para {[...b.missingValues, ...us.missingPrices].join(", ")}.</p>}
        </div>
      </section>

      <section className="section grid grid-4">
        <Kpi label="🇧🇷 Brasil" value={brl(b.currentValue)} sub={`${n(share(b.currentValue), 1)}% do total`} />
        <Kpi label="🇺🇸 Exterior" value={usd(us.totalUsd)} sub={usBrl !== null ? `${brl(usBrl)} · ${n(share(usBrl), 1)}% do total` : "câmbio indisponível"} />
        <Kpi label="Renda gerada (Brasil)" value={brl(b.income)} sub={`exterior: ${usd(us.dividendsUsd)} em proventos`} />
        <Kpi label="Ganho de mercado (Brasil)" value={b.marketGain !== null ? brl(b.marketGain) : "—"} cls={tone(b.marketGain)} sub={`exterior: ${usd(us.pnlUsd)} (${pct(us.assetReturn, 1, true)})`} />
      </section>

      <section className="section grid grid-2">
        <div>
          <div className="section-head"><h2>Composição</h2></div>
          <div className="card stack">
            {rows.length === 0 && <p className="small faint">Sem posições com valor conhecido.</p>}
            {rows.map(([k, val]) => (
              <div key={k} className="alloc-row">
                <div className="alloc-label"><strong>{k}</strong><span className="xsmall faint num">{brl(val)}</span></div>
                <WeightBar current={share(val)} target={0} />
                <div className="num small alloc-nums">{n(share(val), 1)}%</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="section-head"><h2>Minha exposição total ao risco</h2></div>
          <div className="card stack">
            {exposure.map((e) => (
              <div key={e.label} className="alloc-row">
                <div className="alloc-label"><strong>{e.label}</strong><span className="xsmall faint num">{brl(e.value)}</span></div>
                <WeightBar current={share(e.value)} target={0} />
                <div className="num small alloc-nums">{n(share(e.value), 1)}%</div>
              </div>
            ))}
            <p className="xsmall faint">Aproximação pela classe de cada posição. Exposição setorial (bancos, commodities, tecnologia) entra quando os ativos tiverem classificação por setor.</p>
          </div>
        </div>
      </section>

      <p className="xsmall faint section">Detalhes: <Link href="/brasil">Carteira Brasil</Link> · <Link href="/">Carteira Internacional</Link></p>
    </div>
  );
}
