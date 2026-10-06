import { ACTION_META, BAND_META, type BandKey, type Stance } from "./stance";

export interface Snap { p: number | null; b: BandKey | null; q: Stance["quality"]; t: Stance["thesis"]; a: Stance["action"]; f: number | null }

const ORDER: BandKey[] = ["forte", "atrativo", "justo", "esticado", "extremo"];
const fmt = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Explica a mudança entre duas análises separando preço, valuation e tese. */
export function explainChange(before: Snap, now: Snap): { changed: boolean; conclusion: string } {
  const bi = before.b ? ORDER.indexOf(before.b) : -1, ni = now.b ? ORDER.indexOf(now.b) : -1;
  const thesisWorse = before.t !== "deteriorada" && now.t === "deteriorada";
  const thesisBetter = before.t === "deteriorada" && now.t !== "deteriorada";
  const priceUp = before.p && now.p ? (now.p / before.p - 1) * 100 : null;
  const fairMove = before.f && now.f ? (now.f / before.f - 1) * 100 : null;
  const changed = before.b !== now.b || before.t !== now.t || before.a !== now.a;
  if (!changed) return { changed, conclusion: "Sem mudança relevante de valuation, tese ou postura." };

  if (thesisWorse) return { changed, conclusion: "A tese piorou (sinais de deterioração dos fundamentos). Queda de preço, se houver, não deve ser lida como oportunidade automática." };
  if (thesisBetter) return { changed, conclusion: "Os sinais de deterioração deixaram de aparecer. Reavaliar com calma antes de aumentar." };
  if (bi >= 0 && ni > bi) {
    const why = priceUp !== null && fairMove !== null && priceUp > fairMove + 2
      ? `o preço avançou ${fmt(priceUp, 1)}% enquanto o valor justo estimado variou ${fmt(fairMove, 1)}% — mais rápido que a margem de segurança`
      : "o valuation subiu de faixa";
    return { changed, conclusion: `A tese continua ${now.t}, mas ${why}. Não necessariamente vender; ${now.a === "realizacao" ? "avaliar realização parcial" : "considerar não aumentar e acompanhar"}.` };
  }
  if (bi >= 0 && ni >= 0 && ni < bi) {
    return { changed, conclusion: now.t === "intacta"
      ? `Queda parece ter aumentado a atratividade relativa: tese ${now.t} e valuation agora ${BAND_META[now.b!].label.toLowerCase()}.`
      : `Valuation melhorou (${BAND_META[now.b!].label.toLowerCase()}), mas a tese está "${now.t}": acompanhar antes de aumentar.` };
  }
  return { changed, conclusion: `Postura mudou de "${ACTION_META[before.a].label}" para "${ACTION_META[now.a].label}".` };
}
