import Link from "next/link";
import { FlagBR, FlagUS } from "@/components/Icons";
import ActionForm from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { getTheses } from "@/lib/data/theses";
import { effectiveThesisState } from "@/lib/thesis/logic";
import { BASE_THESES } from "@/lib/thesis/baseTheses";
import { createThesis, importBaseTheses } from "./actions";

export default async function TesesPage({ searchParams }: { searchParams: Promise<{ nova?: string; mercado?: string; ativo?: string; preco?: string; banda?: string; qualidade?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const list = await getTheses(await getRepo(user.id));
  const showForm = sp.nova === "1";
  const missingBase = BASE_THESES.filter((b) => !list.some((t) => t.ticker === b.ticker && t.market === b.market && t.status === "ativa")).length;
  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero">
        <div>
          <h1>Minhas teses</h1>
          <p className="muted small">Por que você tem cada ativo — e, meses depois, o que você acreditava × o que aconteceu. Seu diário de aprendizado.</p>
        </div>
        {!showForm && <Link href="/teses?nova=1" className="btn btn-primary btn-sm">Nova tese</Link>}
      </section>

      <section className="section card stack">
        <div className="row-between"><strong>Teses-base das carteiras</strong><span className="xsmall faint">{BASE_THESES.length} ativos · contexto qualitativo, nunca gatilho de compra</span></div>
        <p className="xsmall muted" style={{ margin: 0 }}>
          {missingBase > 0 ? `${missingBase} tese(s)-base ainda não carregada(s). ` : "Todas as teses-base estão carregadas. "}
          Carregar não apaga nada: teses suas recebem só os campos que faltam (papel, o que invalida, o que monitorar, como valorar).
        </p>
        <ActionForm action={importBaseTheses} submitLabel={missingBase > 0 ? "Carregar teses-base" : "Complementar teses com a base"} className="row-wrap"><span /></ActionForm>
      </section>

      {showForm && (
        <section className="section card stack">
          <h3>Nova tese</h3>
          <ActionForm action={createThesis} submitLabel="Salvar tese">
            <label>Mercado<select name="market" defaultValue={sp.mercado === "BR" ? "BR" : "US"}><option value="US">Internacional</option><option value="BR">Brasil</option></select></label>
            <label>Ativo<input name="ticker" defaultValue={sp.ativo ?? ""} required placeholder="NU, ITUB4…" autoCapitalize="characters" /></label>
            <label>Preço na data<input name="price" inputMode="decimal" defaultValue={sp.preco ?? ""} /></label>
            <label>Quantidade (opcional)<input name="quantity" inputMode="decimal" /></label>
            <label className="span-2">Tese — por que comprei / quero comprar<textarea name="text" rows={3} required placeholder="Comprei NU porque acredito na expansão internacional do Nubank, crescimento da base de clientes…" /></label>
            <label className="span-2">Premissas (uma por linha) — o que precisa continuar verdadeiro<textarea name="premises" rows={4} required placeholder={"Base de clientes crescendo acima de 15% ao ano\nExpansão no México e na Colômbia\nInadimplência sob controle"} /></label>
            <label className="span-2">Expectativa<input name="expectation" placeholder="Lucro crescendo 25%+ ao ano nos próximos 3 anos" /></label>
            <label className="span-2">Riscos que enxergo (um por linha)<textarea name="risks" rows={3} placeholder={"Regulação de juros do cartão\nConcorrência de bancos digitais"} /></label>
            <label className="span-2">O que confirmaria a tese<input name="confirms" placeholder="Clientes ativos e receita por cliente crescendo; lucro subindo trimestre a trimestre" /></label>
            <label className="span-2">O que invalidaria a tese (me faria mudar de ideia)<input name="change" placeholder="Inadimplência subindo por 2 trimestres seguidos" /></label>
            <label>Horizonte<input name="horizon" placeholder="3–5 anos" /></label>
            <input type="hidden" name="band" value={sp.banda ?? ""} /><input type="hidden" name="quality" value={sp.qualidade ?? ""} />
          </ActionForm>
        </section>
      )}

      <section className="section">
        {list.length === 0 ? <p className="small faint">Nenhuma tese registrada ainda.</p> : (
          <ul className="m-list">
            {list.map((t) => {
              return (
                <li key={t.id} className="m-row">
                  <Link href={`/teses/${t.id}`} className="row-between">
                    <span><span className="ticker">{t.market === "BR" ? <FlagBR size={11} /> : <FlagUS size={11} />} {t.ticker}</span> <span className="xsmall faint">{new Date(t.created_at).toLocaleDateString("pt-BR")}{t.status === "encerrada" ? " · encerrada" : ""}</span></span>
                    <span className={`badge thesis-${effectiveThesisState(t, null).state.replace(/\s/g, "-")}`}>Tese {effectiveThesisState(t, null).state}</span>
                  </Link>
                  <div className="m-row-sub small muted">{t.role ? <><strong>Papel:</strong> {t.role}</> : <>{t.text.slice(0, 160)}{t.text.length > 160 ? "…" : ""}</>}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
