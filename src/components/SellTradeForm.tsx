"use client";
import { useActionState, useState } from "react";
import { normalizeTicker } from "@/lib/ocr/normalize";
import { parseTradeText } from "@/lib/ocr/parseText";
import ReceiptReader from "./ReceiptReader";

type State = { ok: boolean; message: string | null };
type Fields = { ticker: string; quantity: string; price: string; fees: string; fx_rate: string; trade_date: string; notes: string; trade_id: string };
const EMPTY: Fields = { ticker: "", quantity: "", price: "", fees: "", fx_rate: "", trade_date: "", notes: "", trade_id: "" };
const fmt = (v: number | null | undefined, d = 6) => (v === null || v === undefined ? "" : String(Number(v.toFixed(d))));

/**
 * Registro de venda (carteira internacional), manual ou pelo comprovante da
 * corretora. Venda nunca é gravada sozinha: os campos são preenchidos e você confirma.
 */
export default function SellTradeForm({ action, positions }: {
  action: (s: State, fd: FormData) => Promise<State>;
  positions: { ticker: string; quantity: number }[];
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true, message: null });
  const [f, setF] = useState<Fields>({ ...EMPTY, ticker: positions[0]?.ticker ?? "" });
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function onText(text: string, confidence: number) {
    const tickers = positions.map((p) => p.ticker);
    const raw = parseTradeText(text, tickers);
    if (raw.side === "buy") { setNotice({ ok: false, text: "Este comprovante é de COMPRA — use \"Registrar compra\"." }); return; }
    const ticker = normalizeTicker(raw.ticker);
    if (!ticker || !raw.quantity || !raw.price) { setNotice({ ok: false, text: "Não encontrei ativo, quantidade e preço neste comprovante. Preencha manualmente ou tente um print mais nítido." }); return; }
    const pos = positions.find((p) => p.ticker === ticker);
    const warnings: string[] = [];
    if (!pos) warnings.push(`${ticker} não está na sua carteira.`);
    else if (raw.quantity > pos.quantity + 1e-9) warnings.push(`Quantidade (${raw.quantity}) maior que a posição (${pos.quantity}).`);
    if (raw.side !== "sell") warnings.push("Não ficou claro se é uma venda — confira.");
    if (raw.gross_amount && Math.abs(raw.quantity * raw.price - raw.gross_amount) > Math.max(0.02, raw.gross_amount * 0.005)) warnings.push("Quantidade × preço não bate com o valor do comprovante.");
    if (confidence < 70) warnings.push(`Leitura com baixa nitidez (${Math.round(confidence)}%).`);
    setF({
      ticker: pos ? ticker : f.ticker, quantity: fmt(raw.quantity), price: fmt(raw.price, 4), fees: fmt(raw.fees, 2), fx_rate: fmt(raw.fx_rate, 4),
      trade_date: raw.trade_date ?? "", notes: "", trade_id: raw.trade_id ?? "",
    });
    setNotice({ ok: warnings.length === 0, text: warnings.length ? `Informação não confirmada — revise antes de salvar: ${warnings.join(" ")}` : "Campos preenchidos pelo comprovante. Confira e confirme a venda." });
  }

  return (
    <div className="stack">
      <ReceiptReader label="Ler comprovante de venda" onText={onText} />
      {notice && <p className={`small ${notice.ok ? "pos" : "neg"}`}>{notice.text}</p>}
      <form action={formAction} className="form-grid" onSubmit={(e) => { if (!window.confirm("Registrar esta venda? Nenhuma ordem é enviada à corretora.")) e.preventDefault(); }}>
        <label>Ticker<select name="ticker" value={f.ticker} onChange={set("ticker")} required>{positions.map((p) => <option key={p.ticker} value={p.ticker}>{p.ticker} ({fmt(p.quantity, 4)})</option>)}</select></label>
        <label>Quantidade vendida<input name="quantity" inputMode="decimal" value={f.quantity} onChange={set("quantity")} required /></label>
        <label>Preço de venda (US$)<input name="price" inputMode="decimal" value={f.price} onChange={set("price")} required /></label>
        <label>Taxas (US$)<input name="fees" inputMode="decimal" value={f.fees} onChange={set("fees")} /></label>
        <label>Câmbio (R$/US$)<input name="fx_rate" inputMode="decimal" value={f.fx_rate} onChange={set("fx_rate")} /></label>
        <label>Data<input name="trade_date" type="date" value={f.trade_date} onChange={set("trade_date")} /></label>
        <label className="span-2">Observação<input name="notes" value={f.notes} onChange={set("notes")} /></label>
        <input type="hidden" name="trade_id" value={f.trade_id} />
        <div className="row span-2">
          <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Salvando…" : "Registrar venda"}</button>
          {state.message && <span className={`small ${state.ok ? "pos" : "neg"}`} role="status">{state.message}</span>}
        </div>
      </form>
    </div>
  );
}
