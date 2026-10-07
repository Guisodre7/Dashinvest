import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCvmMonth, formatCnpj, quotaCollector } from "../src/lib/market/cvmFunds";
import { estimateByQuota } from "../src/lib/portfolio/fundQuota";

const CNPJ = "12345678000190";
const CSV = [
  "TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST",
  "CLASSES - FIF;11.111.111/0001-11;;2026-10-01;100;9.9;100;0;0;1",
  "CLASSES - FIF;12.345.678/0001-90;SUB1;2026-10-01;100;2.5;100;0;0;1",
  "CLASSES - FIF;12.345.678/0001-90;;2026-10-01;100;2.000000000000;100;0;0;1",
  "CLASSES - FIF;12.345.678/0001-90;;2026-10-02;100;2.002000000000;100;0;0;1",
  "CLASSES - FIF;12.345.678/0001-90;;2026-10-05;100;2.004000000000;100;0;0;1",
].join("\r\n");

/** ZIP mínimo de um arquivo, como o da CVM. */
function zip(name: string, content: string) {
  const data = deflateRawSync(Buffer.from(content, "latin1"));
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(8, 8);
  head.writeUInt32LE(data.length, 18); head.writeUInt32LE(content.length, 22); head.writeUInt16LE(name.length, 26);
  return Buffer.concat([head, Buffer.from(name), data, Buffer.alloc(200, 0x50)]);
}

afterEach(() => vi.unstubAllGlobals());

describe("cota diária da CVM", () => {
  it("formata CNPJ como no CSV", () => expect(formatCnpj(CNPJ)).toBe("12.345.678/0001-90"));

  it("lê só os CNPJs pedidos e prefere a classe à subclasse", () => {
    const c = quotaCollector([CNPJ]);
    CSV.split("\n").forEach((l) => c.line(l));
    expect(c.result().get(CNPJ)).toEqual([
      { date: "2026-10-01", quota: 2 }, { date: "2026-10-02", quota: 2.002 }, { date: "2026-10-05", quota: 2.004 },
    ]);
  });

  it("descompacta o ZIP em streaming (em pedaços pequenos)", async () => {
    const bytes = zip("inf_diario_fi_202610.csv", CSV);
    vi.stubGlobal("fetch", async () => new Response(new ReadableStream({
      start(ctl) { for (let i = 0; i < bytes.length; i += 7) ctl.enqueue(new Uint8Array(bytes.subarray(i, i + 7))); ctl.close(); },
    })));
    const m = await fetchCvmMonth([CNPJ], "202610");
    expect(m.get(CNPJ)?.at(-1)).toEqual({ date: "2026-10-05", quota: 2.004 });
  });

  it("mês sem arquivo publicado → vazio, sem erro", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    expect((await fetchCvmMonth([CNPJ], "202611")).size).toBe(0);
  });
});

describe("saldo pela variação da cota", () => {
  const series = [{ date: "2026-10-01", quota: 2 }, { date: "2026-10-02", quota: 2.002 }, { date: "2026-10-05", quota: 2.004 }];
  it("último saldo × cota nova ÷ cota da data do saldo", () => {
    const e = estimateByQuota({ current_value: 1000, current_value_at: "2026-10-03" }, series)!;
    expect(e.fromDate).toBe("2026-10-02");
    expect(e.date).toBe("2026-10-05");
    expect(e.value).toBeCloseTo(1000 * 2.004 / 2.002, 2);
    expect(e.note).toMatch(/bruto estimado/);
  });
  it("sem cota mais nova que o saldo, ou sem cota na data base → nada", () => {
    expect(estimateByQuota({ current_value: 1000, current_value_at: "2026-10-05" }, series)).toBeNull();
    expect(estimateByQuota({ current_value: 1000, current_value_at: "2026-09-30" }, series)).toBeNull();
    expect(estimateByQuota({ current_value: null, current_value_at: "2026-10-01" }, series)).toBeNull();
  });
});
