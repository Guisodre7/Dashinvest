import { z } from "zod";

/**
 * Estratégia da carteira Brasil — guardada em app_settings ("br_strategy"),
 * editável no painel. Os valores abaixo são só o ponto de partida.
 */
export interface BrStrategy {
  classes: { renda_fixa: number; acao: number; fii: number };
  assets: { code: string; asset_class: "acao" | "fii"; name: string | null; enabled: boolean }[];
}

export const DEFAULT_BR_STRATEGY: BrStrategy = {
  classes: { renda_fixa: 50, acao: 25, fii: 25 },
  assets: [
    { code: "ITUB4", asset_class: "acao", name: "Itaú Unibanco", enabled: true },
    { code: "BPAC11", asset_class: "acao", name: "BTG Pactual", enabled: true },
    { code: "PETR4", asset_class: "acao", name: "Petrobras", enabled: true },
    { code: "VALE3", asset_class: "acao", name: "Vale", enabled: true },
    { code: "XPML11", asset_class: "fii", name: "XP Malls", enabled: true },
    { code: "KNRI11", asset_class: "fii", name: "Kinea Renda Imobiliária", enabled: true },
    { code: "HGLG11", asset_class: "fii", name: "CGHG Logística", enabled: true },
    { code: "KNHY11", asset_class: "fii", name: "Kinea High Yield", enabled: true },
  ],
};

/** Ticker B3: 4 letras + 1–2 dígitos (ITUB4, BPAC11, HGLG11). */
export const B3_TICKER = /^[A-Z]{4}\d{1,2}$/;

const pctField = z.number().finite().min(0).max(100);
export const BrStrategySchema = z.object({
  classes: z.object({ renda_fixa: pctField, acao: pctField, fii: pctField })
    .refine((c) => Math.abs(c.renda_fixa + c.acao + c.fii - 100) <= 0.05, "A soma das classes deve ser 100%."),
  assets: z.array(z.object({
    code: z.string().regex(B3_TICKER, "Ticker B3 inválido."),
    asset_class: z.enum(["acao", "fii"]),
    name: z.string().max(80).nullable(),
    enabled: z.boolean(),
  })).max(60),
});

/** Lê a configuração salva; inválida ou ausente → padrão. */
export function parseBrStrategy(raw: unknown): BrStrategy {
  const r = BrStrategySchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_BR_STRATEGY;
}
