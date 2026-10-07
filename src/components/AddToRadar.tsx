import Link from "next/link";
import { addToRadar } from "@/app/(app)/radar-actions";
import ActionForm from "./ActionForm";

/** Botão "Adicionar ao meu radar" para um ativo fora da estratégia. */
export default function AddToRadar({ market, ticker, buckets, inRadar }: { market: "US" | "BR"; ticker: string; buckets: string[]; inRadar?: string | null }) {
  if (inRadar) {
    return (
      <div className="card row-between radar-add radar-on">
        <span className="small"><strong>{ticker} está no seu radar</strong> · {inRadar}. Já participa do cálculo do aporte.</span>
        <Link href={market === "BR" ? `/brasil?aba=aporte#br-${ticker}` : `/?aba=aporte#us-${ticker}`} className="small">Ver no aporte →</Link>
      </div>
    );
  }
  return (
    <div className="card stack radar-add">
      <div>
        <strong>Fora do seu radar</strong>
        <p className="small muted" style={{ margin: "2px 0 0" }}>Adicione para {ticker} entrar na estratégia e no cálculo dos aportes. A meta da classe é redividida entre os ativos dela.</p>
      </div>
      <ActionForm action={addToRadar} submitLabel="Adicionar ao meu radar" className="row-wrap" submitClassName="btn btn-primary">
        <input type="hidden" name="market" value={market} />
        <input type="hidden" name="ticker" value={ticker} />
        <label className="small" style={{ minWidth: 180 }}>Classe
          <select name="bucket" defaultValue={buckets[0]}>{buckets.map((b) => <option key={b} value={b}>{market === "BR" ? (b === "FII" ? "FIIs" : "Ações") : b}</option>)}</select>
        </label>
      </ActionForm>
    </div>
  );
}
