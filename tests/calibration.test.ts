import { describe, expect, it } from "vitest";
import { calibrate } from "@/lib/analysis/calibration";

describe("avaliação histórica das faixas (spec §26)", () => {
  const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
  // A: sempre "forte" e sobe; B: sempre "esticado" e cai.
  const hist = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [day(i), {
    A: { p: 100 + i, b: "forte" as const, a: "comprar" },
    B: { p: 100 - i * 0.2, b: "esticado" as const, a: "nao_aumentar" },
  }]));

  it("usa só preços gravados depois (sem look-ahead) e agrupa pela faixa da época", () => {
    const c = calibrate(hist, 30);
    const forte = c.outcomes.find((o) => o.band === "forte")!, est = c.outcomes.find((o) => o.band === "esticado")!;
    expect(forte.n).toBe(90); // dias 0..89 têm o dia +30 gravado
    expect(forte.avg).toBeGreaterThan(0);
    expect(est.avg).toBeLessThan(0);
    expect(forte.hitRate).toBe(1);
    expect(c.ready).toBe(true);
  });

  it("horizonte maior que o histórico: ainda coletando", () => {
    const c = calibrate(hist, 180);
    expect(c.ready).toBe(false);
    expect(c.outcomes).toHaveLength(0);
  });
});
