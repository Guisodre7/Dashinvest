import { describe, expect, it } from "vitest";
import { applyEntry, summarizeLedger, type EntryInput, type Holding, type LedgerEntry } from "@/lib/portfolio/ledger";
import { DEFAULT_BR_STRATEGY, parseBrStrategy } from "@/lib/portfolio/brStrategy";

/** Aplica movimentações em sequência, como as server actions fazem. */
function replay(inputs: EntryInput[]) {
  const holdings = new Map<string, Holding>();
  const entries: LedgerEntry[] = [];
  for (const i of inputs) {
    const { holding, entry } = applyEntry(holdings.get(i.code) ?? null, i);
    holdings.set(i.code, holding);
    entries.push(entry);
  }
  return { holdings: [...holdings.values()], entries };
}

const BR = { market: "BR" as const };
const base: EntryInput[] = [
  { ...BR, asset_class: "acao", code: "ITUB4", kind: "buy", trade_date: "2026-01-10", quantity: 100, price: 30, fees: 5 },
  { ...BR, asset_class: "acao", code: "ITUB4", kind: "buy", trade_date: "2026-03-10", quantity: 50, price: 36 },
  { ...BR, asset_class: "acao", code: "ITUB4", kind: "sell", trade_date: "2026-06-10", quantity: 50, price: 40, fees: 5 },
  { ...BR, asset_class: "acao", code: "ITUB4", kind: "dividend", trade_date: "2026-07-01", amount: 50 },
  { ...BR, asset_class: "renda_fixa", code: "cdb-banco-x", name: "CDB Banco X", kind: "contribution", trade_date: "2026-01-05", amount: 5000 },
  { ...BR, asset_class: "renda_fixa", code: "cdb-banco-x", kind: "balance", trade_date: "2026-05-30", amount: 5100 },
  { ...BR, asset_class: "renda_fixa", code: "cdb-banco-x", kind: "redemption", trade_date: "2026-06-01", amount: 1020 },
];

describe("livro de movimentações", () => {
  it("preço médio inclui custos e a venda gera lucro realizado sobre o custo médio", () => {
    const { holdings, entries } = replay(base);
    const itub = holdings.find((h) => h.code === "ITUB4")!;
    expect(entries[0].avg_price_after).toBeCloseTo(30.05);
    expect(entries[1].avg_price_after).toBeCloseTo(4805 / 150);
    expect(entries[2].realized_pnl).toBeCloseTo(393.33, 2);
    expect(itub.quantity).toBe(100);
    expect(itub.cost_basis).toBeCloseTo(3203.33, 2);
  });

  it("resgate de renda fixa tira custo proporcional ao saldo", () => {
    const { holdings, entries } = replay(base);
    const cdb = holdings.find((h) => h.code === "cdb-banco-x")!;
    expect(entries[6].realized_pnl).toBeCloseTo(20);
    expect(cdb.cost_basis).toBeCloseTo(4000);
    expect(cdb.current_value).toBeCloseTo(4080);
    expect(cdb.name).toBe("CDB Banco X");
  });

  it("separa dinheiro aportado do que o mercado gerou (e fecha a conta)", () => {
    const { holdings, entries } = replay(base);
    const s = summarizeLedger(holdings, entries, { ITUB4: 35 }, DEFAULT_BR_STRATEGY.classes);
    expect(s.contributed).toBeCloseTo(9805);
    expect(s.withdrawn).toBeCloseTo(3015);
    expect(s.income).toBeCloseTo(50);
    expect(s.currentValue).toBeCloseTo(7580);
    expect(s.marketGain).toBeCloseTo(840);
    // realizado + não realizado + renda = ganho de mercado
    expect(s.realized + s.unrealized + s.income).toBeCloseTo(s.marketGain!, 2);
  });

  it("um novo aporte NÃO é interpretado como rentabilidade", () => {
    const before = replay(base);
    const after = replay([...base, { ...BR, asset_class: "renda_fixa", code: "cdb-banco-x", kind: "contribution", trade_date: "2026-08-01", amount: 1000 }]);
    const s0 = summarizeLedger(before.holdings, before.entries, { ITUB4: 35 }, {});
    const s1 = summarizeLedger(after.holdings, after.entries, { ITUB4: 35 }, {});
    expect(s1.currentValue - s0.currentValue).toBeCloseTo(1000);
    expect(s1.marketGain).toBeCloseTo(s0.marketGain!);
  });

  it("sem cotação, o patrimônio fica parcial e o ganho não é inventado", () => {
    const { holdings, entries } = replay(base);
    const s = summarizeLedger(holdings, entries, {}, {});
    expect(s.missingValues).toEqual(["ITUB4"]);
    expect(s.marketGain).toBeNull();
  });

  it("alocação por classe: peso atual, meta e quanto falta", () => {
    const { holdings, entries } = replay(base);
    const s = summarizeLedger(holdings, entries, { ITUB4: 35 }, { renda_fixa: 50, acao: 25, fii: 25 });
    const fii = s.classes.find((c) => c.asset_class === "fii")!;
    const rf = s.classes.find((c) => c.asset_class === "renda_fixa")!;
    expect(rf.weight).toBeCloseTo((4080 / 7580) * 100);
    expect(fii.weight).toBe(0);
    expect(fii.toTarget).toBeCloseTo(0.25 * 7580);
  });

  it("recusa movimentações inválidas", () => {
    const { holdings } = replay(base);
    const itub = holdings.find((h) => h.code === "ITUB4")!;
    expect(() => applyEntry(itub, { ...BR, asset_class: "acao", code: "ITUB4", kind: "sell", trade_date: "2026-09-01", quantity: 101, price: 30 })).toThrow(/maior que a posição/);
    expect(() => applyEntry(null, { ...BR, asset_class: "acao", code: "PETR4", kind: "contribution", trade_date: "2026-09-01", amount: 100 })).toThrow();
    expect(() => applyEntry(null, { ...BR, asset_class: "acao", code: "PETR4", kind: "buy", trade_date: "2026-09-01", quantity: 0, price: 30 })).toThrow();
    expect(() => applyEntry(itub, { ...BR, asset_class: "fii", code: "ITUB4", kind: "buy", trade_date: "2026-09-01", quantity: 1, price: 30 })).toThrow(/já está cadastrado/);
  });
});

describe("estratégia Brasil", () => {
  it("padrão 50/25/25 com os ativos pedidos; configuração inválida volta ao padrão", () => {
    expect(DEFAULT_BR_STRATEGY.classes).toEqual({ renda_fixa: 50, acao: 25, fii: 25 });
    expect(DEFAULT_BR_STRATEGY.assets.map((a) => a.code)).toEqual(["ITUB4", "BPAC11", "PETR4", "VALE3", "XPML11", "KNRI11", "HGLG11", "KNHY11"]);
    expect(parseBrStrategy({ classes: { renda_fixa: 60, acao: 30, fii: 30 }, assets: [] })).toBe(DEFAULT_BR_STRATEGY);
    expect(parseBrStrategy({ classes: { renda_fixa: 40, acao: 30, fii: 30 }, assets: [] }).classes.renda_fixa).toBe(40);
  });
});
