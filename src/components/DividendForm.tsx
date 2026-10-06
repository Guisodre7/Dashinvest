"use client";
import { useActionState, useState } from "react";
import { parseDividendText } from "@/lib/ocr/parseDividend";
import ReceiptReader from "./ReceiptReader";

type State = { ok: boolean; message: string | null };
type Fields = { ticker: string; kind: string; gross_amount: string; withholding_tax: string; amount_per_share: string; quantity: string; ex_date: string; pay_date: string };
const fmt = (v: number | null, d = 6) => (v === null ? "" : String(Number(v.toFixed(d))));

/** Dividendo/distribuição: manual ou pelo comprovante (campos preenchidos para conferência). */
export default function DividendForm({ action, tickers }: { action: (s: State, fd: FormData) => Promise<State>; tickers: string[] }) {
  const [state, formAction, pending] = useActionState(action, { ok: true, message: null });
  const [f, setF] = useState<Fields>({ ticker: tickers[0] ?? "", kind: "dividend", gross_amount: "", withholding_tax: "", amount_per_share: "", quantity: "", ex_date: "", pay_date: "" });
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function onText(text: string, confidence: number) {
    const d = parseDividendText(text, tickers);
    if (d.gross === null && !d.ticker) { setNotice({ ok: false, text: "Não encontrei os dados de um provento neste arquivo. Preencha manualmente." }); return; }
    setF({
      ticker: d.ticker ?? f.ticker, kind: d.kind, gross_amount: fmt(d.gross, 2), withholding_tax: fmt(d.tax, 2),
      amount_per_share: fmt(d.perShare), quantity: fmt(d.quantity), ex_date: d.exDate ?? "", pay_date: d.payDate ?? "",
    });
    const warnings = [...d.warnings, ...(confidence < 70 ? [`Leitura com baixa nitidez (${Math.round(confidence)}%).`] : [])];
    setNotice(d.verified && !warnings.length
      ? { ok: true, text: "Campos preenchidos e conferidos (bruto − imposto = líquido). Confirme o registro." }
      : { ok: false, text: `Informação não confirmada — revise antes de salvar.${warnings.length ? ` ${warnings.join(" ")}` : ""}` });
  }

  return (
    <div className="stack">
      <ReceiptReader label="Ler comprovante de provento" onText={onText} />
      {notice && <p className={`small ${notice.ok ? "pos" : "neg"}`}>{notice.text}</p>}
      <form action={formAction} className="form-grid">
        <label>Ticker<select name="ticker" value={f.ticker} onChange={set("ticker")} required>{tickers.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        <label>Tipo<select name="kind" value={f.kind} onChange={set("kind")}><option value="dividend">Dividendo (empresa)</option><option value="distribution">Distribuição (ETF)</option></select></label>
        <label>Valor bruto (US$)<input name="gross_amount" inputMode="decimal" value={f.gross_amount} onChange={set("gross_amount")} required /></label>
        <label>Imposto retido (US$)<input name="withholding_tax" inputMode="decimal" value={f.withholding_tax} onChange={set("withholding_tax")} /></label>
        <label>Por cota (US$)<input name="amount_per_share" inputMode="decimal" value={f.amount_per_share} onChange={set("amount_per_share")} /></label>
        <label>Cotas<input name="quantity" inputMode="decimal" value={f.quantity} onChange={set("quantity")} /></label>
        <label>Data ex<input name="ex_date" type="date" value={f.ex_date} onChange={set("ex_date")} /></label>
        <label>Pagamento<input name="pay_date" type="date" value={f.pay_date} onChange={set("pay_date")} /></label>
        <label className="check"><input type="checkbox" name="reinvested" /> Reinvestido</label>
        <div className="row span-2">
          <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Salvando…" : "Registrar provento"}</button>
          {state.message && <span className={`small ${state.ok ? "pos" : "neg"}`} role="status">{state.message}</span>}
        </div>
      </form>
    </div>
  );
}
