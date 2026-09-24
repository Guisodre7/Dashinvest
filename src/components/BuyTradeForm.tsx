"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { normalizeTrade, type NormalizedTrade, type TradeDraft } from "@/lib/ocr/normalize";
import { parseTradeText } from "@/lib/ocr/parseText";

type State = { ok: boolean; message: string | null };
type Fields = { ticker: string; quantity: string; price: string; fx_rate: string; trade_date: string; fees: string; broker: string; notes: string };
const EMPTY: Fields = { ticker: "", quantity: "", price: "", fx_rate: "", trade_date: "", fees: "", broker: "", notes: "" };

/** Reduz fotos grandes (e converte HEIC quando o navegador consegue decodificar) para JPEG ≤ 2000px. */
async function compressImage(file: File): Promise<Blob> {
  if (file.type === "application/pdf") return file;
  if (file.size < 1.2 * 1024 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

const fmt = (v: number | null, digits = 6) => (v === null ? "" : String(Number(v.toFixed(digits))));

export default function BuyTradeForm({
  action, tickers, aiAvailable = false,
}: {
  action: (s: State, fd: FormData) => Promise<State>;
  tickers: string[];
  /** Leitura com IA (paga) disponível no servidor — opcional, só como segunda tentativa. */
  aiAvailable?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true, message: null });
  const [fields, setFields] = useState<Fields>({ ...EMPTY, ticker: tickers[0] ?? "" });
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extraTicker, setExtraTicker] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [incomplete, setIncomplete] = useState(false);
  const [pasted, setPasted] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Após registrar com sucesso, limpa o formulário.
  useEffect(() => {
    if (state.ok && state.message) {
      setFields({ ...EMPTY, ticker: tickers[0] ?? "" });
      setFilled(new Set()); setWarnings([]); setPreview(null); setExtraTicker(null);
    }
  }, [state, tickers]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
    setFilled((s) => { const n = new Set(s); n.delete(k); return n; });
  };

  /** Aplica o rascunho validado aos campos (destacando o que foi preenchido). */
  function applyDraft(n: NormalizedTrade, extraWarnings: string[] = []) {
    const d: TradeDraft = n.draft;
    const next: Partial<Fields> = {};
    if (d.ticker) {
      next.ticker = d.ticker;
      setExtraTicker(tickers.includes(d.ticker) ? null : d.ticker);
    }
    if (d.quantity !== null) next.quantity = fmt(d.quantity, 8);
    if (d.price !== null) next.price = fmt(d.price, 6);
    if (d.fx_rate !== null) next.fx_rate = fmt(d.fx_rate, 4);
    if (d.trade_date) next.trade_date = d.trade_date;
    if (d.fees !== null) next.fees = fmt(d.fees, 2);
    if (d.broker) next.broker = d.broker;
    if (n.filled.length) next.notes = "Lido do comprovante";
    // Cada leitura parte do formulário limpo — nunca mistura valores de leituras anteriores.
    setFields({ ...EMPTY, ticker: tickers[0] ?? "", ...next });
    setFilled(new Set(n.filled));
    setWarnings([...extraWarnings, ...n.warnings]);
    setIncomplete(!d.ticker || d.quantity === null || d.price === null);
  }

  function resetRead() {
    setReadError(null); setWarnings([]); setIncomplete(false);
  }

  /** Leitura gratuita, no próprio aparelho: OCR local (imagem/PDF escaneado) ou texto do PDF. */
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    resetRead(); setReading(true); setLastFile(file);
    setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    try {
      const { ocrImage, readPdf } = await import("@/lib/ocr/localOcr");
      const onProgress = (label: string, frac: number | null) => setProgress(frac === null ? label : `${label} ${Math.round(frac * 100)}%`);
      const r = file.type === "application/pdf"
        ? await readPdf(file, onProgress)
        : await ocrImage(await compressImage(file), onProgress);
      const n = normalizeTrade(parseTradeText(r.text, tickers), tickers);
      if (!n.ok) {
        setReadError("Não encontrei os dados de uma ordem neste arquivo. Tente um print mais nítido, recortado na confirmação da ordem, ou cole o texto abaixo.");
        setIncomplete(true);
        return;
      }
      applyDraft(n, r.confidence < 70 ? [`Leitura com baixa nitidez (${Math.round(r.confidence)}%) — confira cada campo.`] : []);
    } catch {
      setReadError("Não foi possível ler o arquivo neste aparelho. Tente outro formato (JPG/PNG/PDF) ou cole o texto.");
    } finally {
      setReading(false); setProgress(null);
    }
  }

  /** Texto colado (e-mail de confirmação, notificação da corretora…). */
  function onPaste() {
    resetRead();
    const n = normalizeTrade(parseTradeText(pasted, tickers), tickers);
    if (!n.ok) { setReadError("Não encontrei os dados de uma ordem no texto colado."); return; }
    applyDraft(n);
  }

  /** Segunda tentativa opcional com IA (servidor; somente se configurada). */
  async function onAi() {
    if (!lastFile) return;
    resetRead(); setReading(true); setProgress("Lendo com IA");
    try {
      const blob = await compressImage(lastFile);
      const body = new FormData();
      body.append("file", blob, blob === lastFile ? lastFile.name : "comprovante.jpg");
      const res = await fetch("/api/ocr/trade", { method: "POST", body });
      const data = await res.json().catch(() => ({ error: "Resposta inválida do servidor." }));
      if (!res.ok) { setReadError(data.error ?? `Falha na leitura (HTTP ${res.status}).`); return; }
      applyDraft(data as NormalizedTrade);
    } catch {
      setReadError("Não foi possível enviar o arquivo. Verifique a conexão e tente de novo.");
    } finally {
      setReading(false); setProgress(null);
    }
  }

  const cls = (k: keyof Fields) => (filled.has(k) ? "ocr-filled" : undefined);
  const tickerOptions = [...tickers, ...(extraTicker ? [extraTicker] : [])];

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="ocr-drop">
        <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onFile} hidden />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={reading}>
          {reading ? (progress ?? "Lendo comprovante…") : "📷 Ler comprovante"}
        </button>
        <span className="xsmall faint">Foto, print ou PDF. Leitura gratuita feita no seu aparelho — a imagem não é enviada a ninguém. Os campos são preenchidos para você revisar; nada é registrado sem sua confirmação.</span>
      </div>
      <details className="ocr-paste">
        <summary className="small muted">Ou cole o texto da confirmação (e-mail, notificação)</summary>
        <textarea rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Ex.: Compra executada · NVDA · Quantidade 2,5 · Preço US$ 180,00 · 20/09/2026" />
        <button type="button" className="btn btn-sm" onClick={onPaste} disabled={!pasted.trim()}>Preencher com o texto</button>
      </details>
      {preview && <img src={preview} alt="Comprovante enviado" className="ocr-preview" />}
      {readError && <div className="banner banner-neg small">{readError}</div>}
      {aiAvailable && lastFile && incomplete && !reading && (
        <button type="button" className="btn btn-sm" onClick={onAi} style={{ alignSelf: "flex-start" }}>Tentar leitura com IA (usa a API configurada)</button>
      )}
      {warnings.length > 0 && (
        <div className="banner banner-warn small">
          <strong>Revise antes de registrar:</strong>
          <ul className="clean">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      <form action={formAction} className="form-grid">
        <label>Ticker
          <select name="ticker" required value={fields.ticker} onChange={set("ticker")} className={cls("ticker")}>
            {tickerOptions.map((t) => <option key={t} value={t}>{t}{t === extraTicker ? " (não cadastrado)" : ""}</option>)}
          </select>
        </label>
        <label>Quantidade<input name="quantity" inputMode="decimal" required value={fields.quantity} onChange={set("quantity")} className={cls("quantity")} /></label>
        <label>Preço (US$)<input name="price" inputMode="decimal" required value={fields.price} onChange={set("price")} className={cls("price")} /></label>
        <label>Câmbio (R$/US$)<input name="fx_rate" inputMode="decimal" value={fields.fx_rate} onChange={set("fx_rate")} className={cls("fx_rate")} /></label>
        <label>Data<input name="trade_date" type="date" value={fields.trade_date} onChange={set("trade_date")} className={cls("trade_date")} /></label>
        <label>Taxas (US$)<input name="fees" inputMode="decimal" value={fields.fees} onChange={set("fees")} className={cls("fees")} /></label>
        <label>Corretora<input name="broker" value={fields.broker} onChange={set("broker")} className={cls("broker")} /></label>
        <label>Observação<input name="notes" value={fields.notes} onChange={set("notes")} /></label>
        <div className="row">
          <button className="btn btn-primary btn-sm" disabled={pending || reading}>{pending ? "Salvando…" : filled.size ? "Confirmar e registrar compra" : "Registrar compra"}</button>
          {state.message && <span className={`small ${state.ok ? "pos" : "neg"}`}>{state.message}</span>}
        </div>
      </form>
    </div>
  );
}
