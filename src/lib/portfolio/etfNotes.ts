/** Textos explicativos fixos dos ETFs de renda — natureza do produto, não dados de mercado. */
export const ETF_NOTES: Record<string, { what: string; warning: string; unavailable: string[] }> = {
  JEPQ: {
    what: "Fundo que investe em ações do Nasdaq-100 e gera renda vendendo opções de compra (call) via ELNs — equity-linked notes. Distribui mensalmente o prêmio das opções mais os dividendos.",
    warning: "JEPQ NÃO é renda fixa: o patrimônio oscila com as ações do Nasdaq. A venda de calls limita a participação em altas fortes e não protege contra quedas. A distribuição varia conforme a volatilidade.",
    unavailable: ["Exposição via ELNs / opções", "Retorno em mercados de alta vs queda"],
  },
  LQD: {
    what: "Fundo de títulos corporativos americanos grau de investimento (investment grade), com vencimentos longos e milhares de emissores.",
    warning: "LQD NÃO é dinheiro parado: tem risco de mercado (juros — duration elevada) e risco de crédito (spreads). Juros subindo reduzem o preço de mercado.",
    unavailable: ["SEC yield", "Duration efetiva", "Maturidade média", "Distribuição por rating", "Spread de crédito"],
  },
  VNQ: {
    what: "Fundo de REITs americanos (empresas de imóveis listadas em bolsa): data centers, torres, logística, saúde, residencial, varejo e escritórios.",
    warning: "VNQ NÃO é imóvel físico: é renda variável, com volatilidade de ações e sensibilidade relevante a juros e ao ciclo imobiliário.",
    unavailable: ["P/FFO", "Crescimento das distribuições"],
  },
  VOO: {
    what: "Fundo do índice S&P 500. Registrado como posição legada / Anchor: monitorado, sem novos aportes enquanto a estratégia estiver assim configurada.",
    warning: "O sistema não recomenda vender VOO para simplificar a carteira.",
    unavailable: [],
  },
};
