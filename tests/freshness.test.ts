import { describe, expect, it } from "vitest";
import { quoteFreshness } from "@/lib/market/freshness";
import { getMarketStatus } from "@/lib/market/marketStatus";
import { meta } from "./helpers";

const cfg = { maxMarketDataAgeSec: 30, maxMarketDataAgeClosedSec: 3600 * 80 };

describe("market status", () => {
  it("identifica sessões em horário ET", () => {
    // 2026-09-24 é quinta-feira; EDT = UTC-4
    expect(getMarketStatus(new Date("2026-09-24T12:00:00Z"))).toBe("PRE-MARKET"); // 08:00 ET
    expect(getMarketStatus(new Date("2026-09-24T14:00:00Z"))).toBe("OPEN"); // 10:00 ET
    expect(getMarketStatus(new Date("2026-09-24T21:00:00Z"))).toBe("AFTER-HOURS"); // 17:00 ET
    expect(getMarketStatus(new Date("2026-09-25T02:00:00Z"))).toBe("CLOSED"); // 22:00 ET
    expect(getMarketStatus(new Date("2026-09-26T15:00:00Z"))).toBe("CLOSED"); // sábado
    expect(getMarketStatus(new Date("2026-11-26T15:00:00Z"))).toBe("CLOSED"); // Thanksgiving
  });
});

describe("freshness", () => {
  const now = new Date("2026-09-24T14:00:00Z");
  it("aceita dado realtime recente com mercado aberto", () => {
    const f = quoteFreshness(meta({ timestamp: new Date(now.getTime() - 8000).toISOString() }), now, "OPEN", cfg);
    expect(f.level).toBe("realtime");
    expect(f.label).toBe("Dados atualizados há 8 segundos");
    expect(f.blocksPriceDecisions).toBe(false);
  });
  it("bloqueia dado antigo com mercado aberto", () => {
    const f = quoteFreshness(meta({ timestamp: new Date(now.getTime() - 120_000).toISOString() }), now, "OPEN", cfg);
    expect(f.level).toBe("stale");
    expect(f.blocksPriceDecisions).toBe(true);
  });
  it("nunca trata dado atrasado como realtime", () => {
    const f = quoteFreshness(meta({ timestamp: now.toISOString(), is_realtime: false, is_delayed: true, delay_minutes: 15 }), now, "OPEN", cfg);
    expect(f.level).toBe("delayed");
    expect(f.label).toContain("atraso de 15 minutos");
    expect(f.blocksPriceDecisions).toBe(true);
  });
  it("aceita último fechamento com mercado fechado", () => {
    const f = quoteFreshness(meta({ timestamp: new Date(now.getTime() - 3600_000 * 5).toISOString() }), now, "CLOSED", cfg);
    expect(f.level).toBe("fresh");
    expect(f.blocksPriceDecisions).toBe(false);
  });
  it("sem cotação bloqueia", () => {
    expect(quoteFreshness(null, now, "OPEN", cfg).blocksPriceDecisions).toBe(true);
  });
});
