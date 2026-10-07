/**
 * Parâmetros do motor de decisão — um lugar só (spec §23).
 *
 * Regras da especificação (docs/DASHINVEST_MASTER_SPEC.md):
 *  - nenhum número mágico espalhado pelo código: todo limiar de decisão vive aqui;
 *  - cada parâmetro é documentado com o motivo;
 *  - NENHUM foi calibrado com backtest ainda (spec §26). Até lá são "provisórios":
 *    servem para organizar a decisão, não são verdade científica;
 *  - nenhum parâmetro sozinho pode dominar a decisão (por isso os ajustes são pequenos
 *    e a postura de valuation é sempre a base).
 */
export const PARAMS = {
  /** Faixas de valuation: preço ÷ valor justo (spec §10: intervalo, não número mágico). */
  bands: {
    normal: [0.85, 0.95, 1.05, 1.25] as [number, number, number, number],
    /** Incerteza alta (analistas divergentes, base fraca): exige mais margem de segurança. */
    uncertain: [0.8, 0.92, 1.05, 1.25] as [number, number, number, number],
  },

  valuation: {
    /** Divergência máxima entre métodos (máx − mín ÷ mediana) antes de declarar "dados conflitantes". */
    maxMethodSpread: 0.8,
    /** Preço ÷ valor justo fora disto = dado não confiável (sem faixa). */
    plausible: [0.55, 2] as [number, number],
    /** DCF: perpetuidade e prêmio de risco do equity (FCFE descontado ao custo de equity — spec §10). */
    terminalGrowth: 0.025,
    equityPremium: 0.05,
    discountRange: [0.07, 0.13] as [number, number],
    /** Cenários pessimista/otimista do DCF: ± este crescimento anual sobre o cenário base. */
    scenarioGrowthDelta: 0.05,
    /** DCF reverso: preço embute crescimento acima do histórico por mais que isto → sem pressa. */
    impliedGrowthGap: 0.08,
  },

  brazil: {
    /** Juro neutro real estimado pelo BC (~5%): base do juro real de longo prazo. */
    neutralRealRate: 5,
    /** Prêmio sobre o juro real para o custo de capital das ações (P/L justo e P/VP pelo ROE). */
    equityPremium: 0.04,
    /** Bazin: yield exigido = juro real longo, limitado a este intervalo. */
    bazinYield: [0.06, 0.09] as [number, number],
    /** FIIs: yield exigido = juro real longo + spread, limitado ao intervalo. */
    fiiSpread: 0.015,
    fiiYield: [0.07, 0.12] as [number, number],
  },

  analysts: {
    /** Sinal ≤ isto (analistas cortando lucro/recomendação) → compra vira "esperar". */
    blockBelow: -0.4,
    /** Influência do sinal no tamanho do aporte: ×(1 + peso × sinal). */
    allocationWeight: 0.25,
    /** Divergência das metas acima disto = incerteza alta. */
    highDispersion: 0.6,
  },

  allocation: {
    /** Oportunidade pelo valuation recebe mais que o aporte normal (spec §13: não dividir igual). */
    opportunityBoost: 1.4,
    /** "Excelente e um pouco cara" (spec §28): aporte menor que o normal. */
    qualityPremiumFactor: 0.5,
    /** Brasil: peso de cada postura na divisão dentro da classe. */
    brWeights: { opportunity: 2, normal: 1, qualityPremium: 0.5 },
  },

  realization: {
    /** Faixas de venda parcial (% da posição) pela distância do valor justo. */
    extreme: [10, 20] as [number, number],
    veryExtremePremiumPct: 50,
    veryExtreme: [20, 30] as [number, number],
    weakQuality: [20, 35] as [number, number],
    /** Custos + impostos acima disto (fração do valor vendido) → vender não compensa. */
    maxCostShare: 0.1,
  },

  split: {
    /** Divisão Brasil × Exterior: lado com mais oportunidades pelo valuation recebe até isto a mais. */
    opportunityTilt: 0.1,
    opportunityTiltPerAsset: 0.05,
  },
} as const;
