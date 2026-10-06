import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import StanceCard from "@/components/StanceCard";
import { requireUser } from "@/lib/auth";
import { ACTION_META, type Stance } from "@/lib/analysis/stance";
import { loadBrazil } from "@/lib/data/brazil";
import { loadContext } from "@/lib/data/load";
import { loadStances } from "@/lib/data/stances";
import { saveTaxRules } from "./actions";

const GROUPS: { key: (typeof ACTION_META)[keyof typeof ACTION_META]["group"]; title: string; empty: string }[] = [
  { key: "comprar", title: "🟢 Comprar — ativos atrativos", empty: "Nenhum ativo em faixa atrativa com qualidade e tese preservadas." },
  { key: "recomprar", title: "🟢 Recomprar — reduzidos antes, de volta a faixa interessante", empty: "Nenhuma recompra potencial." },
  { key: "realizar", title: "🟠 Realizar parcialmente — bons, mas esticados", empty: "Nenhum ativo com realização parcial sugerida." },
  { key: "manter", title: "🟡 Manter — corretamente precificados ou sem aumentar", empty: "—" },
  { key: "evitar", title: "🔴 Evitar — fundamentos deteriorados ou risco/retorno ruim", empty: "Nenhum." },
  { key: "aguardar", title: "⚪ Aguardar dados", empty: "—" },
];

export default async function OportunidadesPage() {
  const user = await requireUser();
  const ctx = await loadContext(user);
  const [{ stances, tax }, br] = await Promise.all([loadStances(ctx, ctx.repo), loadBrazil(ctx.repo)]);
  const byGroup = (g: string) => stances.filter((s) => ACTION_META[s.action].group === g);
  const name = (t: string) => ctx.analyses.find((a) => a.ticker === t)?.name;
  const price = (t: string) => ctx.analyses.find((a) => a.ticker === t)?.price ?? null;
  const brAssets = br.strategy.assets.filter((a) => a.enabled);
  const pct = (v: number) => String(Math.round(v * 1000) / 10);

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero">
        <div>
          <h1>Oportunidades agora</h1>
          <p className="muted small">Qualidade do ativo + faixa de valuation + tese + peso na carteira. Variação de preço não é valuation; nada aqui é ordem. Horizonte: semanas a anos, não day trade.</p>
          <p className="small"><Link href="/mudancas">O que mudou?</Link> · <Link href="/estrategia">Pesos-alvo (Estratégia)</Link> · <Link href="/notificacoes">Notificações</Link></p>
        </div>
      </section>

      {GROUPS.map((g) => {
        const list: Stance[] = byGroup(g.key);
        if (!list.length && (g.key === "manter" || g.key === "aguardar")) return null;
        return (
          <section key={g.key} className="section">
            <div className="section-head"><h2>{g.title}</h2><span className="xsmall faint">{list.length} ativo(s)</span></div>
            {list.length === 0 ? <p className="small faint">{g.empty}</p> : (
              <div className="grid grid-2">{list.map((s) => <StanceCard key={s.ticker} s={s} price={price(s.ticker)} name={name(s.ticker)} compact />)}</div>
            )}
          </section>
        );
      })}

      <section className="section">
        <div className="section-head"><h2>🇧🇷 Carteira Brasil</h2></div>
        <div className="card small stack">
          <p>⚪ <strong>Aguardar dados</strong> — {brAssets.map((a) => a.code).join(", ")}.</p>
          <p className="muted">A fonte gratuita da B3 (brapi) entrega cotações, mas não os fundamentos (P/L, P/VP, ROE, lucro, histórico de dividendos) necessários para faixas de valuation confiáveis. Sem esses dados, o sistema não classifica — não inventa. Próximo passo possível: P/VP e dividendos de FIIs por outra fonte gratuita, ou preenchimento manual.</p>
          <Link href="/brasil" className="small">Ver Carteira Brasil →</Link>
        </div>
      </section>

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
