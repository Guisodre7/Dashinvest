"use client";
import { useActionState, useState } from "react";

type State = { ok: boolean; message: string | null };
type Cls = "acao" | "fii" | "renda_fixa" | "caixa";

const KINDS: Record<Cls, { value: string; label: string }[]> = {
  acao: [{ value: "buy", label: "Compra" }, { value: "sell", label: "Venda" }, { value: "dividend", label: "Dividendo / JCP" }],
  fii: [{ value: "buy", label: "Compra" }, { value: "sell", label: "Venda" }, { value: "income", label: "Rendimento" }],
  renda_fixa: [
    { value: "contribution", label: "Aporte" }, { value: "redemption", label: "Resgate" },
    { value: "balance", label: "Atualizar saldo" }, { value: "income", label: "Juros/cupom pago" },
  ],
  caixa: [{ value: "contribution", label: "Depósito" }, { value: "redemption", label: "Retirada" }, { value: "balance", label: "Atualizar saldo" }],
};

/**
 * Registro de movimentação da carteira Brasil. Ações/FIIs: quantidade × preço.
 * Renda fixa/caixa: valor (aporte, resgate) ou saldo atual (não é fluxo de caixa).
 */
export default function LedgerForm({ action, fixedIncome, suggestions }: {
  action: (s: State, fd: FormData) => Promise<State>;
  fixedIncome: { code: string; name: string | null }[];
  suggestions: string[];
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true, message: null });
  const [cls, setCls] = useState<Cls>("acao");
  const [kind, setKind] = useState("buy");
  const [existing, setExisting] = useState("");
  const priced = cls === "acao" || cls === "fii";
  const flowOnly = kind === "dividend" || kind === "income";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="form-grid" key={state.ok && state.message ? state.message : "f"}>
      <label>Classe
        <select name="asset_class" value={cls} onChange={(e) => { const c = e.target.value as Cls; setCls(c); setKind(KINDS[c][0].value); }}>
          <option value="acao">Ação</option><option value="fii">FII</option><option value="renda_fixa">Renda fixa</option><option value="caixa">Caixa</option>
        </select>
      </label>
      <label>Movimentação
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS[cls].map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </label>

      {priced ? (
        <label>Ticker<input name="code" list="br-tickers" required autoCapitalize="characters" placeholder="ITUB4" /></label>
      ) : (
        <>
          {fixedIncome.length > 0 && (
            <label>Título/fundo
              <select name="existing_code" value={existing} onChange={(e) => setExisting(e.target.value)}>
                <option value="">Novo…</option>
                {fixedIncome.map((f) => <option key={f.code} value={f.code}>{f.name ?? f.code}</option>)}
              </select>
            </label>
          )}
          {!existing && <label>Nome do título/fundo<input name="name" required placeholder="CDB Banco X 2028" /></label>}
          {!existing && <label>CNPJ (opcional)<input name="cnpj" inputMode="numeric" /></label>}
          {!existing && <label>Emissor/gestor (opcional)<input name="issuer" /></label>}
        </>
      )}

      <label>Data<input name="trade_date" type="date" defaultValue={today} max={today} required /></label>
      {priced && !flowOnly && <label>Quantidade<input name="quantity" inputMode="decimal" required /></label>}
      {priced && !flowOnly && <label>Preço (R$)<input name="price" inputMode="decimal" required /></label>}
      {(!priced || flowOnly) && (
        <label>{kind === "balance" ? "Saldo atual (R$)" : "Valor (R$)"}<input name="amount" inputMode="decimal" required /></label>
      )}
      {kind !== "balance" && !flowOnly && <label>Custos/taxas (R$)<input name="fees" inputMode="decimal" placeholder="0" /></label>}
      <label className="span-2">Observação<input name="notes" maxLength={200} /></label>
      <datalist id="br-tickers">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>

      <div className="row span-2">
        <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Salvando…" : "Registrar"}</button>
        {state.message && <span className={`small ${state.ok ? "pos" : "neg"}`} role="status">{state.message}</span>}
      </div>
      {kind === "balance" && <p className="xsmall faint span-2">O saldo atualiza o valor da posição; não conta como aporte nem como resgate.</p>}
    </form>
  );
}
