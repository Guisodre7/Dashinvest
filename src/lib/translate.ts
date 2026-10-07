import "server-only";
import { memo } from "./market/memo";

/**
 * Tradução automática inglês → português pela API pública e gratuita do MyMemory
 * (sem chave; ~5.000 caracteres/dia, ou 50.000 com MYMEMORY_EMAIL). Usada só nas
 * notícias que viram notificação (poucas por dia).
 * Falhou, limite esgotado ou resposta estranha → devolve null e o texto original fica.
 */
const API = "https://api.mymemory.translated.net/get";
/** Limite do serviço por pedido (bytes). */
const MAX = 480;

function cut(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  while (new TextEncoder().encode(t).length > MAX) t = t.slice(0, t.lastIndexOf(" ", t.length - 2) > 0 ? t.lastIndexOf(" ", t.length - 2) : t.length - 10);
  return t;
}

export async function translateToPt(text: string | null | undefined): Promise<string | null> {
  if (!text?.trim()) return null;
  const q = cut(text);
  return memo(`tr:${q}`, 7 * 86_400_000, async () => {
    const params = new URLSearchParams({ q, langpair: "en|pt-BR" });
    if (process.env.MYMEMORY_EMAIL) params.set("de", process.env.MYMEMORY_EMAIL);
    const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(6_000), next: { revalidate: 30 * 86_400 } });
    if (!res.ok) throw new Error(`MyMemory ${res.status}`);
    const j = (await res.json()) as { responseStatus?: number | string; responseData?: { translatedText?: string }; quotaFinished?: boolean };
    const out = j.responseData?.translatedText?.trim();
    if (Number(j.responseStatus) !== 200 || j.quotaFinished || !out || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(out)) throw new Error("tradução indisponível");
    return decodeEntities(out);
  }).catch(() => null);
}

function decodeEntities(s: string) {
  return s.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
