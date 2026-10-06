import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import BrFundamentalsLine from "@/components/BrFundamentalsLine";
import StanceCard from "@/components/StanceCard";
import { requireUser } from "@/lib/auth";
import { ACTION_META, type Stance } from "@/lib/analysis/stance";
import { loadBrazil } from "@/lib/data/brazil";
import { loadBrStances } from "@/lib/data/brStances";
import { loadContext } from "@/lib/data/load";
import { loadStances } from "@/lib/data/stances";
import { saveTaxRules } from "./actions";
import { RadarTable } from "@/components/sections";

const GROUPS: { key: (typeof ACTION_META)[keyof typeof ACTION_META]["group"]; title: string; empty: string }[] = [
  { key: "comprar", title: "🟢 Comprar — ativos atrativos", empty: "Nenhum ativo em faixa atrativa com qualidade e tese preservadas." },
  { key: "recomprar", title: "🟢 Recomprar — reduzidos antes, de volta a faixa interessante", empty: "Nenhuma recompra potencial." },
  { key: "realizar", title: "🟠 Realizar parcialmente — bons, mas esticados", empty: "Nenhum ativo com realização parcial sugerida." },
  { key: "manter", title: "🟡 Manter — corretamente precificados ou sem aumentar", empty: "—" },
  { key: "evitar", title: "🔴 Evitar — fundamentos deteriorados ou risco/retorno ruim", empty: "Nenhum." },
  { key: "aguardar", title: "⚪ Aguardar dados", empty: "—" },
];

export default async function OportunidadesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requireUser();
  const { m } = await searchParams;
  const showUS = m !== "BR", showBR = m !== "US";
  const ctx = await loadContext(user);
  const [{ stances, tax }, br] = await Promise.all([loadStances(ctx, ctx.repo), showBR ? loadBrazil(ctx.repo) : null]);
  const brs = br ? await loadBrStances(br, ctx.repo) : { views: [], errors: {} as Record<string, string> };
  const byGroup = (g: string) => stances.filter((s) => ACTION_META[s.action].group === g);
  const name = (t: string) => ctx.analyses.find((a) => a.ticker === t)?.name;
  const price = (t: string) => ctx.analyses.find((a) => a.ticker === t)?.price ?? null;
  const pct = (v: number) => String(Math.round(v * 1000) / 10);

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero">
        <div>
          <h1>{m === "US" ? "🇺🇸 Valuation e oportunidades" : m === "BR" ? "🇧🇷 Valuation e oportunidades" : "Oportunidades agora — Brasil + Exterior"}</h1>
          <p className="muted small">Qualidade do ativo + faixa de valuation + tese + peso na carteira. Variação de preço não é valuation; nada aqui é ordem. Horizonte: semanas a anos, não day trade.</p>
          <p className="small"><Link href="/analisar">Analisar compra</Link> · <Link href="/teses">Minhas teses</Link> · <Link href="/mudancas">O que mudou?</Link> · <Link href="/estrategia">Pesos-alvo (Estratégia)</Link> · <Link href="/notificacoes">Notificações</Link></p>
        </div>
      </section>

      {GROUPS.map((g) => {
        const list: Stance[] = showUS ? byGroup(g.key) : [];
        const brList = showBR ? brs.views.filter((v) => ACTION_META[v.stance.action].group === g.key) : [];
        if (!list.length && !brList.length && (g.key === "manter" || g.key === "aguardar")) return null;
        return (
          <section key={g.key} className="section">
            <div className="section-head"><h2>{g.title}</h2><span className="xsmall faint">{list.length + brList.length} ativo(s)</span></div>
            {list.length + brList.length === 0 ? <p className="small faint">{g.empty}</p> : (
              <div className="grid grid-2">
                {list.map((s) => <StanceCard key={s.ticker} s={s} price={price(s.ticker)} name={`🇺🇸 ${name(s.ticker) ?? ""}`} compact />)}
                {brList.map((v) => (
                  <StanceCard key={v.code} s={v.stance} price={v.price} cur="R$" name={`🇧🇷 ${v.name ?? ""}`} compact href={`/brasil#br-${v.code}`}>
                    <BrFundamentalsLine v={v} error={brs.errors[v.code]} />
                  </StanceCard>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {showUS && m === "US" && (
        <section className="section">
          <div className="section-head"><h2>Radar</h2><span className="xsmall faint">valuation · fundamentos · momentum · analistas · drawdown</span></div>
          <RadarTable analyses={ctx.analyses} />
        </section>
      )}

      <section className="section grid grid-2">
        <div>
          <div className="section-head"><h2>Premissas de custos e impostos</h2></div>
          <div className="card stack">
            <p className="xsmall faint">Usadas para avaliar se uma venda parcial é eficiente. Regras tributárias mudam: confirme as vigentes com seu contador.</p>
            <ActionForm action={saveTaxRules} submitLabel="Salvar premissas">
              <label>EUA: taxa por ordem (US$)<input name="us_fee" inputMode="decimal" defaultValue={tax.US.feePerOrder} /></label>
              <label>EUA: imposto sobre ganho (%)<input name="us_rate" inputMode="decimal" defaultValue={pct(tax.US.gainTaxRate)} /></label>
              <label>EUA: ordem mínima (US$)<input name="us_min" inputMode="decimal" defaultValue={tax.US.minTicket} /></label>
              <label>BR: custo por ordem (R$)<input name="br_fee" inputMode="decimal" defaultValue={tax.BR_ACAO.feePerOrder} /></label>
              <label>Ações BR: imposto (%)<input name="br_rate" inputMode="decimal" defaultValue={pct(tax.BR_ACAO.gainTaxRate)} /></label>
              <label>Ações BR: isenção mensal (R$)<input name="br_exempt" inputMode="decimal" defaultValue={tax.BR_ACAO.monthlyExemption ?? ""} /></label>
              <label>FIIs: imposto (%)<input name="fii_rate" inputMode="decimal" defaultValue={pct(tax.BR_FII.gainTaxRate)} /></label>
              <label>BR: ordem mínima (R$)<input name="br_min" inputMode="decimal" defaultValue={tax.BR_ACAO.minTicket} /></label>
            </ActionForm>
            <ul className="clean xsmall muted">{[tax.US.note, tax.BR_ACAO.note, tax.BR_FII.note].map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        </div>
        <div>
          <div className="section-head"><h2>Como ler</h2></div>
          <div className="card small stack">
            <p><strong>Excelente + cara</strong> não é "vender tudo": se a posição pesa pouco, só não aumentar; se pesa demais, realização parcial em faixa (ex.: 10–20%).</p>
            <p><strong>Barata</strong> não é oportunidade se a qualidade é fraca ou a tese deteriorou.</p>
            <p><strong>Recompra</strong> em degraus: não tenta acertar o fundo.</p>
            <Link href="/mudancas">O que mudou desde a última análise →</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
