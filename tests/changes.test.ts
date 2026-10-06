import { describe, expect, it } from "vitest";
import { explainChange, type Snap } from "@/lib/analysis/changes";

const snap = (o: Partial<Snap>): Snap => ({ p: 100, b: "justo", q: "boa", t: "intacta", a: "manter", f: 100, ...o });

describe("O que mudou?", () => {
  it("NU: de razoável para esticado com tese positiva → não necessariamente vender", () => {
    const r = explainChange(snap({ p: 13.5, f: 14 }), snap({ p: 15.2, b: "esticado", a: "nao_aumentar", f: 14.1 }));
    expect(r.changed).toBe(true);
    expect(r.conclusion).toMatch(/A tese continua intacta, mas o preço avançou 12,6% .* margem de segurança\. Não necessariamente vender; considerar não aumentar/);
  });
  it("queda com tese intacta → atratividade relativa maior; tese piorou → não é oportunidade automática", () => {
    expect(explainChange(snap({}), snap({ b: "atrativo", p: 85 })).conclusion).toMatch(/aumentado a atratividade relativa/);
    expect(explainChange(snap({}), snap({ b: "atrativo", t: "deteriorada", a: "evitar" })).conclusion).toMatch(/não deve ser lida como oportunidade/);
  });
  it("nada mudou", () => {
    expect(explainChange(snap({}), snap({ p: 101 })).changed).toBe(false);
  });
});
