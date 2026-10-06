import Link from "next/link";
import { FlagBR, FlagUS } from "@/components/Icons";
import ActionForm from "@/components/ActionForm";
import { Kpi, MacroPanel, WeightBar } from "@/components/sections";
import { splitMonthly } from "@/lib/allocation/split";
import { loadBrStances } from "@/lib/data/brStances";
import { loadStances } from "@/lib/data/stances";
import { parseUserNumber } from "@/lib/userNumber";
import { saveSplitTarget } from "./actions";
import { requireUser } from "@/lib/auth";
import { loadBrazil } from "@/lib/data/brazil";
import { loadContext } from "@/lib/data/load";
import { brl, n, pct, tone, usd } from "@/lib/format";

/** Agrupamento do exterior pelas faixas da estratégia internacional. */
const US_GROUP: Record<string, string> = {
  CRESCIMENTO: "Growth (ações EUA)", "RENDA VIA OPÇÕES": "Income (JEPQ)", "CRÉDITO CORPORATIVO": "Crédito EUA (LQD)",
  "REAL ESTATE": "REITs (VNQ)", LEGADO: "VOO (legado)",
};

export default async function GeralPage({ searchParams }: { searchParams: Promise<{ total?: string }> }) {
  const { total: totalRaw } = await searchParams;
  const user = await requireUser();
  const ctx = await loadContext(user);
  const br = await loadBrazil(ctx.repo);
  const [splitSaved, projection] = await Promise.all([ctx.repo.getSetting<number>("split_target").catch(() => null), ctx.repo.getProjectionSettings().catch(() => null)]);
  const splitTarget = splitSaved ?? projection?.brazilPct ?? 50;
  const monthly = parseUserNumber(totalRaw);
  // Oportunidades só são calculadas quando o plano é pedido (fundamentos da B3 têm cache de 24h).
  let plan: ReturnType<typeof splitMonthly> | null = null;
  if (monthly && monthly > 0) {
    const [us, brv] = await Promise.all([loadStances(ctx, ctx.repo), loadBrStances(br, ctx.repo)]);
    const opp = (a: string) => a === "comprar" || a === "recompra";
    plan = splitMonthly({
      totalBrl: monthly, brValue: br.summary.currentValue, usValueBrl: ctx.fx ? ctx.portfolio.totalUsd * ctx.fx.rate : 0,
      targetBrPct: splitTarget, fxRate: ctx.fx?.rate ?? null, fxChange1m: ctx.fx?.change_1m ?? null,
      brOpportunities: brv.views.filter((v) => opp(v.stance.action)).length, usOpportunities: us.stances.filter((x) => opp(x.action)).length,
    });
  }
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

      <section className="section card stack" id="plano">
        <h2>Plano de aporte do mês</h2>
        <p className="small muted">Quanto vai para cada carteira, pelo desvio da meta e pelo contexto (câmbio, oportunidades). Depois, cada carteira divide o valor entre os ativos.</p>
        <form className="contrib" method="get" action="/geral#plano">
          <div className="stack" style={{ gap: 4 }}>
            <span className="small muted">Quanto vou aportar este mês (total)?</span>
            <div className="money"><span>R$</span><input name="total" inputMode="decimal" defaultValue={totalRaw ?? ""} placeholder="5.000" aria-label="Aporte mensal total em reais" /></div>
          </div>
          <button className="btn btn-primary" style={{ alignSelf: "flex-end", padding: "12px 20px" }}>DIVIDIR</button>
        </form>
        {plan && (
          <>
            <div className="grid grid-2">
              <div className="callout"><div className="kpi-label"><FlagBR size={11} /> Brasil</div><div className="kpi-value num">{brl(plan.brBrl)}</div>
                {plan.brBrl > 0 && <a className="btn btn-sm" href={`/brasil?aba=aporte&valor=${plan.brBrl}`}>Distribuir na carteira Brasil →</a>}</div>
              <div className="callout"><div className="kpi-label"><FlagUS size={11} /> Exterior</div><div className="kpi-value num">{brl(plan.usBrl)}{plan.usUsd !== null && <span className="small muted"> ≈ {usd(plan.usUsd)}</span>}</div>
                {plan.usUsd !== null && plan.usUsd > 0 && <a className="btn btn-sm" href={`/?aba=aporte&valor=${plan.usUsd}`}>Distribuir na carteira internacional →</a>}</div>
            </div>
            <ul className="clean small">{plan.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="xsmall faint">Sugestão do modelo para o cenário atual — não é garantia de retorno nem ordem.</p>
          </>
        )}
        <details className="small">
          <summary className="muted">Meta Brasil × Exterior: {splitTarget}% / {100 - splitTarget}%</summary>
          <ActionForm action={saveSplitTarget} submitLabel="Salvar meta" className="row">
            <label>% Brasil<input name="br_pct" inputMode="decimal" defaultValue={splitTarget} /></label>
          </ActionForm>
        </details>
      </section>

      <section className="section grid grid-4">
        <Kpi label={<><FlagBR size={11} /> Brasil</>} value={brl(b.currentValue)} sub={`${n(share(b.currentValue), 1)}% do total`} />
        <Kpi label={<><FlagUS size={11} /> Exterior</>} value={usd(us.totalUsd)} sub={usBrl !== null ? `${brl(usBrl)} · ${n(share(usBrl), 1)}% do total` : "câmbio indisponível"} />
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
      <section className="section" id="macro">
        <details>
          <summary className="section-head" style={{ cursor: "pointer" }}><h2 style={{ display: "inline" }}>🌎 Contexto macro</h2> <span className="xsmall faint">juros, câmbio, índices — abrir</span></summary>
          <MacroPanel macro={ctx.macro} regime={ctx.regime} impacts={ctx.impacts} events={ctx.macroEvents} />
        </details>
      </section>
    </div>
  );
}
