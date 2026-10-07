/**
 * Cota diária de fundos de investimento pelos Dados Abertos da CVM (gratuito, oficial).
 * Arquivo mensal: inf_diario_fi_AAAAMM.zip (um CSV; atualizado nos dias úteis, com ~1–2 dias de atraso).
 * A brapi só cobre ativos de bolsa; fundos abertos (renda fixa, DI, crédito) só existem aqui.
 *
 * O ZIP é lido em streaming (sem carregar o CSV inteiro na memória) e só as linhas dos
 * CNPJs pedidos são guardadas.
 */
export interface QuotaPoint { date: string; quota: number }

const BASE = "https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS";
export const cvmMonthUrl = (yyyymm: string) => `${BASE}/inf_diario_fi_${yyyymm}.zip`;

const digits = (s: string) => s.replace(/\D/g, "");
/** 12345678000190 → 12.345.678/0001-90 (formato usado no CSV). */
export const formatCnpj = (c: string) => digits(c).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

/** Pula o cabeçalho local do ZIP (1º arquivo) e devolve só o fluxo comprimido (deflate). */
function stripZipHeader(): TransformStream<Uint8Array, Uint8Array> {
  let buf = new Uint8Array(0);
  let skipped = false;
  return new TransformStream({
    transform(chunk, ctl) {
      if (skipped) { ctl.enqueue(chunk); return; }
      const next = new Uint8Array(buf.length + chunk.length);
      next.set(buf); next.set(chunk, buf.length); buf = next;
      if (buf.length < 30) return;
      const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      if (v.getUint32(0, true) !== 0x04034b50) throw new Error("Arquivo da CVM não é um ZIP válido.");
      if (v.getUint16(8, true) !== 8) throw new Error("Compressão do ZIP da CVM não suportada.");
      const start = 30 + v.getUint16(26, true) + v.getUint16(28, true);
      if (buf.length < start) return;
      skipped = true;
      ctl.enqueue(buf.subarray(start));
      buf = new Uint8Array(0);
    },
  });
}

/**
 * Extrai as cotas dos CNPJs pedidos de um CSV do informe diário (já descomprimido, em linhas).
 * Aceita o layout antigo (CNPJ_FUNDO) e o da Resolução 175 (CNPJ_FUNDO_CLASSE, ID_SUBCLASSE);
 * com subclasses, prefere a linha da classe (subclasse vazia).
 */
export function quotaCollector(cnpjs: string[]) {
  const wanted = new Map(cnpjs.map((c) => [formatCnpj(c), digits(c)]));
  const out = new Map<string, Map<string, { quota: number; sub: boolean }>>();
  let idx: { cnpj: number; date: number; quota: number; sub: number } | null = null;
  return {
    line(raw: string) {
      const line = raw.replace(/\r$/, "");
      if (!line) return;
      if (!idx) {
        const h = line.split(";").map((x) => x.trim().toUpperCase());
        const cnpj = h.findIndex((x) => x === "CNPJ_FUNDO_CLASSE" || x === "CNPJ_FUNDO");
        idx = { cnpj, date: h.indexOf("DT_COMPTC"), quota: h.indexOf("VL_QUOTA"), sub: h.indexOf("ID_SUBCLASSE") };
        if (cnpj < 0 || idx.date < 0 || idx.quota < 0) throw new Error("Layout do informe diário da CVM mudou.");
        return;
      }
      let hit = false;
      for (const f of wanted.keys()) if (line.includes(f)) { hit = true; break; }
      if (!hit) return;
      const cols = line.split(";");
      const cnpj = wanted.get(cols[idx.cnpj]?.trim());
      const quota = Number(cols[idx.quota]?.trim().replace(",", "."));
      const date = cols[idx.date]?.trim();
      if (!cnpj || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(quota > 0)) return;
      const sub = idx.sub >= 0 && !!cols[idx.sub]?.trim();
      const series = out.get(cnpj) ?? new Map();
      const prev = series.get(date);
      if (!prev || (prev.sub && !sub)) series.set(date, { quota, sub });
      out.set(cnpj, series);
    },
    result(): Map<string, QuotaPoint[]> {
      return new Map([...out].map(([c, s]) => [c, [...s].map(([date, v]) => ({ date, quota: v.quota })).sort((a, b) => a.date.localeCompare(b.date))]));
    },
  };
}

/** Cotas de um mês (AAAAMM) para os CNPJs pedidos. Mês ainda sem arquivo → mapa vazio. */
export async function fetchCvmMonth(cnpjs: string[], yyyymm: string, signal?: AbortSignal): Promise<Map<string, QuotaPoint[]>> {
  if (!cnpjs.length) return new Map();
  const res = await fetch(cvmMonthUrl(yyyymm), { signal, cache: "no-store" });
  if (res.status === 404) return new Map();
  if (!res.ok || !res.body) throw new Error(`CVM respondeu ${res.status}.`);
  const text = res.body
    .pipeThrough(stripZipHeader())
    .pipeThrough(new DecompressionStream("deflate-raw") as unknown as TransformStream<Uint8Array, Uint8Array>)
    .pipeThrough(new TextDecoderStream("latin1") as unknown as TransformStream<Uint8Array, string>);
  const col = quotaCollector(cnpjs);
  let rest = "";
  const reader = text.getReader();
  for (;;) {
    let chunk: ReadableStreamReadResult<string>;
    try {
      chunk = await reader.read();
    } catch (err) {
      // Depois do fim do deflate vêm o diretório central do ZIP; algumas versões do Node
      // acusam "trailing junk" — o CSV já foi lido inteiro nesse ponto.
      if (/junk|trailing/i.test(String(err))) break;
      throw err;
    }
    const { value, done } = chunk;
    if (done) break;
    const parts = (rest + value).split("\n");
    rest = parts.pop() ?? "";
    for (const p of parts) col.line(p);
  }
  if (rest) col.line(rest);
  return col.result();
}

/** Cotas dos meses de `from` (AAAA-MM-DD) até hoje, no máximo `maxMonths` arquivos. */
export async function fetchCvmQuotas(cnpjs: string[], from: string, now = new Date(), maxMonths = 3, signal?: AbortSignal): Promise<Map<string, QuotaPoint[]>> {
  const months: string[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = from.slice(0, 7).replace("-", "");
  while (months.length < maxMonths) {
    const m = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    months.unshift(m);
    if (m <= start) break;
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  const all = new Map<string, QuotaPoint[]>();
  for (const m of months) {
    for (const [c, pts] of await fetchCvmMonth(cnpjs, m, signal)) all.set(c, [...(all.get(c) ?? []), ...pts]);
  }
  return all;
}
