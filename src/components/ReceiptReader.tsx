"use client";
import { useRef, useState } from "react";
import { readDocumentText } from "@/lib/ocr/readFile";

/**
 * Botão "Ler comprovante/print" reutilizável: foto, print ou PDF → texto, lido
 * no próprio aparelho (gratuito). Também aceita texto colado.
 */
export default function ReceiptReader({ label, onText, hint }: {
  label: string;
  onText: (text: string, confidence: number) => void;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null); setProgress("Lendo");
    try {
      const r = await readDocumentText(file, (l, f) => setProgress(f === null ? l : `${l} ${Math.round(f * 100)}%`));
      onText(r.text, r.confidence);
    } catch {
      setError("Não foi possível ler o arquivo neste aparelho. Tente JPG/PNG/PDF ou cole o texto.");
    } finally { setProgress(null); }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row-wrap">
        <button type="button" className="btn btn-sm" disabled={!!progress} onClick={() => fileRef.current?.click()}>{progress ? `${progress}…` : `📷 ${label}`}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaste((v) => !v)}>{paste ? "Fechar" : "Colar texto"}</button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onFile} hidden />
      </div>
      {hint && <p className="xsmall faint">{hint}</p>}
      {paste && (
        <div className="stack" style={{ gap: 6 }}>
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Cole aqui o texto do comprovante ou do app" />
          <button type="button" className="btn btn-sm" disabled={!text.trim()} onClick={() => { onText(text, 100); setPaste(false); }}>Ler texto</button>
        </div>
      )}
      {error && <p className="small neg">{error}</p>}
    </div>
  );
}
