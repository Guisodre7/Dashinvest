/**
 * Teses-base das carteiras (docs/DASHINVEST_TESES_BASE.md) em formato carregável.
 * São CONTEXTO qualitativo: nenhuma frase aqui vira gatilho de compra ou venda.
 * Números de trimestres citados são fatos na data em que a tese foi escrita.
 */
export interface BaseThesis {
  market: "BR" | "US";
  ticker: string;
  kind: "posicao" | "alternativa";
  role: string;
  text: string;
  confirms: string[];
  invalidates: string[];
  monitor: string[];
  valuationApproach: string | null;
  horizon: string;
}

const L = (s: string) => s.split(";").map((x) => x.trim()).filter(Boolean);

export const BASE_THESES: BaseThesis[] = [
  // ------------------------------------------------------------------ Brasil
  {
    market: "BR", ticker: "ITUB4", kind: "posicao", horizon: "longo prazo",
    role: "Núcleo de qualidade do bloco de ações brasileiras.",
    text: "Uma das posições brasileiras de maior qualidade para exposição ao sistema financeiro: escala, diversificação de receitas, geração de lucro, gestão de risco e histórico de rentabilidade elevada. O banco consegue continuar crescendo de forma rentável em diferentes ciclos de crédito, preservando ROE elevado e geração de capital. (Fato na data: ROE recorrente anualizado de 24,8% no 1T26; carteira de crédito ~R$ 1,5 trilhão.)",
    confirms: L("ROE estruturalmente elevado; crescimento saudável da carteira; inadimplência controlada; boa cobertura das operações problemáticas; geração consistente de capital; CET1 confortável; crescimento de receitas; controle de despesas; manutenção da qualidade de crédito; atravessar ciclos de juros e crédito sem destruição relevante de rentabilidade"),
    invalidates: L("deterioração estrutural da qualidade de crédito; queda persistente do ROE sem recuperação; deterioração relevante de capital; perda estrutural de eficiência; crescimento de crédito com deterioração excessiva; mudança estrutural no modelo que reduza a vantagem competitiva; problemas de governança ou alocação de capital"),
    monitor: L("ROE; ROA; CET1; Basileia; inadimplência; cobertura; NIM; crescimento da carteira; custo do crédito; eficiência; lucro recorrente; P/VP; P/L; crescimento; dividendos"),
    valuationApproach: "P/VP em conjunto com ROE, crescimento e custo de capital. Não usar P/L isoladamente.",
  },
  {
    market: "BR", ticker: "BPAC11", kind: "posicao", horizon: "longo prazo",
    role: "Exposição ao crescimento do mercado financeiro brasileiro, com modelo mais diversificado e potencial de crescimento superior ao de um banco tradicional.",
    text: "Banco de investimento, crédito, gestão de recursos, wealth management e outras atividades financeiras: múltiplas fontes de receita. Crescimento de longo prazo apoiado por expansão de clientes, ativos sob gestão, crédito, investment banking e capacidade de reinvestimento.",
    confirms: L("crescimento consistente do lucro; ROE elevado; crescimento de receitas diversificadas; expansão de wealth/asset management; crescimento de AUM; qualidade da carteira de crédito; capitalização confortável; boa eficiência; reinvestir capital com retornos elevados"),
    invalidates: L("deterioração estrutural do ROE; crescimento excessivamente dependente de crédito; deterioração importante da qualidade da carteira; aumento de risco sem retorno proporcional; deterioração de capital; concentração excessiva em uma fonte de receita; problemas relevantes de governança"),
    monitor: L("ROE; CET1/Basileia; inadimplência; cobertura; carteira de crédito; receitas por segmento; AUM; eficiência; lucro recorrente; P/VP; P/L; crescimento; central de resultados do RI do BTG (fonte primária)"),
    valuationApproach: "P/VP interpretado junto com ROE sustentável, crescimento e risco.",
  },
  {
    market: "BR", ticker: "PETR4", kind: "posicao", horizon: "longo prazo",
    role: "Exposição a petróleo, geração de caixa e potencial de distribuição de capital.",
    text: "A tese não é \"petróleo vai subir\". A Petrobras possui ativos de produção competitivos, especialmente no pré-sal, capazes de gerar caixa relevante com preços de petróleo economicamente favoráveis. Depende de disciplina de capital, eficiência operacional e de não destruir valor por decisões políticas ou alocação inadequada de capital.",
    confirms: L("produção eficiente; custo de extração competitivo; geração robusta de FCF; dívida controlada; disciplina de capex; retorno adequado dos investimentos; dividendos compatíveis com a geração de caixa; governança e racionalidade econômica; expansão produtiva com retorno adequado"),
    invalidates: L("interferência política destruindo retorno econômico; aumento estrutural de capex sem retorno; deterioração relevante de dívida; projetos de baixo retorno; deterioração estrutural da eficiência; destruição de caixa; política de preços ou investimentos incompatível com criação de valor de longo prazo"),
    monitor: L("Brent; produção; lifting cost; capex; dívida líquida/EBITDA; FCF; refino; reservas; dividendos; ROIC; projetos; decisões de alocação de capital"),
    valuationApproach: "FCF, EV/EBITDA, dividend yield sustentável e valor dos ativos/reservas. Não valorar apenas por dividend yield passado.",
  },
  {
    market: "BR", ticker: "VALE3", kind: "posicao", horizon: "longo prazo",
    role: "Exposição a commodities e diversificação do risco predominantemente doméstico.",
    text: "Exposição a ativos minerais de alta qualidade (minério de ferro, cobre e níquel). Fica mais interessante se a companhia aumentar eficiência, reduzir custos, melhorar produção e ampliar a participação de metais ligados à eletrificação e transição energética. (Fato na data: 2T26 com 84,3 Mt de minério, 98,4 kt de cobre e 42,0 kt de níquel, crescimento anual nos três segmentos.)",
    confirms: L("produção eficiente; custos competitivos; qualidade dos ativos; crescimento de cobre; disciplina de capital; redução de riscos operacionais; boa geração de caixa durante o ciclo; disciplina de distribuição de capital"),
    invalidates: L("deterioração estrutural dos custos; perda relevante de competitividade; problemas operacionais persistentes; deterioração de governança; capex destrutivo; queda estrutural da qualidade dos ativos; dependência excessiva de minério de ferro sem melhora de diversificação"),
    monitor: L("preço do minério, cobre e níquel; produção; vendas; custos; EBITDA; FCF; capex; dívida; dividendos; guidance; projetos"),
    valuationApproach: "EV/EBITDA, FCF yield, NAV/SOTP e cenários de preço das commodities. Não usar múltiplo de lucro isoladamente.",
  },
  {
    market: "BR", ticker: "XPML11", kind: "posicao", horizon: "longo prazo",
    role: "Exposição a imóveis comerciais/shoppings e renda imobiliária.",
    text: "Qualidade dos ativos, localização, geração de renda, ocupação, poder de negociação com lojistas e gestão ativa do portfólio. Shopping center é negócio imobiliário operacional, não \"cota que paga dividendos\".",
    confirms: L("ocupação elevada; vendas dos lojistas saudáveis; aluguel/m² crescente; inadimplência controlada; boa diversificação; ativos de qualidade; aquisições com retorno adequado; distribuição recorrente sustentável; gestão eficiente"),
    invalidates: L("deterioração persistente da ocupação; queda estrutural das vendas; concentração excessiva; aquisição de ativos ruins; crescimento de distribuição sem sustentação; aumento excessivo de alavancagem; destruição de valor em emissões/aquisições"),
    monitor: L("vacância; ocupação; vendas/m²; aluguel/m²; NOI; inadimplência; concentração; cap rate implícito; P/VP; valor patrimonial; dívida; emissões"),
    valuationApproach: "P/VP, cap rate implícito e comparação entre renda recorrente e custo de oportunidade.",
  },
  {
    market: "BR", ticker: "KNRI11", kind: "posicao", horizon: "longo prazo",
    role: "Núcleo defensivo de imóveis físicos (escritórios e logística).",
    text: "Depende da qualidade e localização dos imóveis, diversificação dos contratos, ocupação e capacidade de gerar renda recorrente. Posição imobiliária de longo prazo, não aposta em valorização rápida da cota.",
    confirms: L("ocupação elevada; contratos de qualidade; bons inquilinos; reajustes saudáveis; imóveis bem localizados; manutenção da qualidade física; renda recorrente; gestão disciplinada"),
    invalidates: L("deterioração estrutural de ocupação; concentração excessiva; perda de qualidade dos imóveis; contratos problemáticos; alavancagem inadequada; aquisições destrutivas"),
    monitor: L("vacância; WAULT/prazo contratual; aluguel/m²; concentração; valor patrimonial; cap rate; P/VP; distribuição; dívida"),
    valuationApproach: "P/VP, cap rate e renda recorrente × custo de oportunidade.",
  },
  {
    market: "BR", ticker: "HGLG11", kind: "posicao", horizon: "longo prazo",
    role: "Exposição ao setor logístico brasileiro.",
    text: "Importância estrutural da logística para o comércio e a distribuição no Brasil e capacidade de ativos logísticos de qualidade gerarem renda e valorização patrimonial.",
    confirms: L("ocupação elevada; imóveis modernos; localização estratégica; contratos longos; bons inquilinos; crescimento de aluguel; disciplina em aquisições; baixa deterioração de crédito; crescimento sustentável da renda"),
    invalidates: L("deterioração relevante da ocupação; excesso de concentração; aquisições caras; aumento excessivo de alavancagem; queda estrutural da qualidade dos contratos; destruição de valor patrimonial"),
    monitor: L("vacância; contratos; aluguel/m²; concentração; cap rate; P/VP; valor patrimonial; dívida; distribuição; novas aquisições"),
    valuationApproach: "P/VP, cap rate e renda recorrente × custo de oportunidade.",
  },
  {
    market: "BR", ticker: "KNHY11", kind: "posicao", horizon: "longo prazo",
    role: "Renda imobiliária via crédito/CRI, com maior busca por rendimento.",
    text: "Não é FII de imóveis físicos. O retorno depende principalmente da qualidade dos CRIs, spreads, indexadores, garantias, LTV, diversificação e da capacidade do gestor de controlar o risco de crédito. Não usar vacância e qualidade de imóveis como motor da tese.",
    confirms: L("carteira de CRIs diversificada; bons devedores; garantias adequadas; LTV controlado; spreads interessantes; baixa inadimplência; boa cobertura; distribuição sustentável; gestão ativa de risco"),
    invalidates: L("deterioração relevante dos devedores; concentração excessiva; aumento de inadimplência; garantias insuficientes; deterioração estrutural da carteira; distribuição artificialmente elevada; perda permanente de patrimônio"),
    monitor: L("CRI por CRI; devedor; setor; indexador; spread; duration; LTV; garantias; rating; inadimplência; provisões; concentração; P/VP; resultado recorrente"),
    valuationApproach: "P/VP e resultado recorrente × risco de crédito da carteira (não usar métricas de imóveis físicos).",
  },
  {
    market: "BR", ticker: "BOVA11", kind: "alternativa", horizon: "longo prazo",
    role: "Exposição diversificada ao mercado acionário brasileiro (alternativa).",
    text: "Alternativa quando o objetivo for exposição ampla ao Brasil sem assumir risco específico de uma empresa. Não precisa receber aportes se houver ações individuais com melhor relação qualidade/valuation.",
    confirms: L("valuation agregado do Ibovespa razoável; lucro agregado crescendo"),
    invalidates: L("ações individuais da carteira com relação qualidade/valuation claramente superior"),
    monitor: L("valuation do Ibovespa; composição; lucro agregado; juros; risco fiscal; comparação com ações individuais"),
    valuationApproach: "P/L e lucro agregado do índice frente aos juros e às ações individuais.",
  },
  {
    market: "BR", ticker: "IVVB11", kind: "alternativa", horizon: "longo prazo",
    role: "S&P 500 pelo mercado brasileiro, com componente cambial (alternativa).",
    text: "Alternativa simples para exposição internacional sem usar a conta no exterior. Como existe carteira internacional própria, comparar com a compra direta de ETFs/ativos em dólar.",
    confirms: L("custos e tributação competitivos frente ao investimento direto"),
    invalidates: L("investimento direto no exterior claramente mais eficiente"),
    monitor: L("S&P 500; câmbio; custos; tributação; spread; alternativa de investimento direto no exterior"),
    valuationApproach: "Mesmo valuation do S&P 500, somado ao custo e à tributação frente ao investimento direto.",
  },
  // ------------------------------------------------------------------ Internacional
  {
    market: "US", ticker: "NU", kind: "posicao", horizon: "longo prazo",
    role: "Crescimento de longo prazo e exposição à expansão do sistema financeiro digital latino-americano.",
    text: "Transformar a enorme base de clientes em uma plataforma financeira cada vez mais completa, aumentando monetização por cliente, produtos, depósitos, crédito e receitas, com potencial de expansão internacional. Não depende de uma aquisição específica.",
    confirms: L("crescimento de clientes; aumento de clientes ativos; aumento de receita por cliente; expansão de depósitos; crescimento de crédito com controle de risco; ROE elevado; inadimplência estável ou melhorando; expansão de produtos; eficiência operacional; crescimento sustentável fora do Brasil; manutenção da vantagem competitiva"),
    invalidates: L("deterioração persistente de crédito; perda estrutural de clientes; incapacidade de monetizar a base; queda estrutural do ROE; crescimento que exija capital excessivo; deterioração competitiva; expansão internacional destruindo valor; problemas regulatórios relevantes"),
    monitor: L("clientes; MAU; ARPAC/receita por cliente; depósitos; carteira de crédito; NPL; custo de crédito; ROE; margem; eficiência; capital; crescimento internacional; valuation"),
    valuationApproach: "Como instituição financeira: P/VP e P/L frente ao ROE e ao crescimento sustentável.",
  },
  {
    market: "US", ticker: "META", kind: "posicao", horizon: "longo prazo",
    role: "Crescimento estrutural em publicidade digital, plataformas sociais e inteligência artificial.",
    text: "Uma das maiores plataformas de distribuição digital do mundo, monetizando a base de usuários por publicidade; IA pode melhorar recomendação, criação de anúncios, engajamento e novos produtos. (Fato na data: 2T26 com receita de US$ 60,8 bi, +28% a/a, despesas crescendo mais rápido e margem operacional de 31% — acompanhar crescimento × custo do investimento em IA.)",
    confirms: L("crescimento de receita; crescimento de publicidade; melhora de monetização; usuários/engajamento crescendo; ganhos de eficiência por IA; margens sustentáveis; geração de FCF; retorno sobre capital elevado; monetização de novos produtos"),
    invalidates: L("deterioração estrutural da publicidade; perda de relevância das plataformas; custos de IA destruindo retorno de forma permanente; queda estrutural de margens; regulação que altere significativamente o modelo; incapacidade de transformar investimento em retorno"),
    monitor: L("receita; ad impressions; preço por anúncio; usuários; margens; capex; FCF; investimentos em IA; Reality Labs; valuation"),
    valuationApproach: "FCF e lucro frente ao crescimento; atenção ao capex de IA reduzindo o FCF.",
  },
  {
    market: "US", ticker: "NVDA", kind: "posicao", horizon: "longo prazo",
    role: "Exposição de maior crescimento à infraestrutura de inteligência artificial.",
    text: "Vantagem competitiva extraordinária em aceleradores de computação, software/ecossistema e infraestrutura de IA. O ponto central não é \"IA vai crescer\": é capturar parcela relevante do crescimento da infraestrutura computacional de IA mantendo retornos extraordinários sobre o capital. Excelente empresa não significa excelente preço. (Fato na data: 2T fiscal 2027 com receita de US$ 96,2 bi, +106% a/a; Data Center US$ 89 bi, +117%.)",
    confirms: L("crescimento do Data Center; demanda sustentada; margens elevadas; crescimento de software/ecossistema; liderança tecnológica; lançamento de novas gerações; grandes clientes continuando a investir; crescimento de FCF"),
    invalidates: L("desaceleração estrutural da demanda; perda tecnológica relevante; competição reduzindo margens; clientes desenvolvendo alternativas competitivas; excesso de oferta; retorno ruim dos investimentos em IA dos clientes; valuation crescendo muito mais rápido que os fundamentos"),
    monitor: L("Data Center; receita; margem bruta; capex dos hyperscalers; pedidos; geração de caixa; concorrência; roadmap; valuation"),
    valuationApproach: "DCF com cenários e crescimento embutido no preço (DCF reverso): empresa excelente pode ser compra ruim se o preço exigir cenário excessivamente otimista.",
  },
  {
    market: "US", ticker: "MSFT", kind: "posicao", horizon: "longo prazo",
    role: "Crescimento de alta qualidade e diversificação entre software, cloud, IA e produtividade.",
    text: "Negócios recorrentes, ecossistema empresarial, Azure, Office, Windows, segurança, GitHub e IA. Transformar a posição dominante em software empresarial em plataforma de infraestrutura e produtividade de IA.",
    confirms: L("crescimento do Azure; expansão de margens; crescimento de receita recorrente; adoção de Copilot; crescimento de segurança; FCF forte; retorno sobre capital elevado; monetização de IA superior ao aumento de custos"),
    invalidates: L("desaceleração estrutural de cloud; IA sem retorno sobre o capex; perda de vantagem competitiva; compressão persistente de margens; deterioração relevante de crescimento"),
    monitor: L("Azure; Microsoft Cloud; Copilot; margem operacional; capex; FCF; receita recorrente; crescimento; valuation"),
    valuationApproach: "FCF e lucro frente ao crescimento recorrente; capex de IA no FCF.",
  },
  {
    market: "US", ticker: "AAPL", kind: "posicao", horizon: "longo prazo",
    role: "Qualidade, ecossistema, marca e geração de caixa.",
    text: "Ecossistema altamente integrado, enorme base instalada, forte poder de marca e monetização por hardware, serviços e acessórios. Compounder de alta qualidade, não necessariamente o maior crescimento da carteira.",
    confirms: L("crescimento da base instalada; crescimento de Services; retenção de clientes; expansão de margem; geração de FCF; recompras eficientes; crescimento sustentável de receita por usuário"),
    invalidates: L("perda estrutural de participação; deterioração da força da marca; queda persistente do ecossistema; inovação insuficiente; dependência excessiva de um produto; compressão estrutural de margens"),
    monitor: L("iPhone; Services; China; margem; base instalada; FCF; recompras; capex; valuation"),
    valuationApproach: "FCF yield e lucro frente a um crescimento moderado; recompras no retorno ao acionista.",
  },
  {
    market: "US", ticker: "GOOGL", kind: "posicao", horizon: "longo prazo",
    role: "Exposição a busca, publicidade digital, cloud e IA.",
    text: "Ativos extremamente difíceis de replicar: Search, YouTube, Android, dados, infraestrutura e Google Cloud. A questão central é incorporar IA sem destruir a economia da busca e, ao mesmo tempo, criar novas fontes de receita.",
    confirms: L("crescimento da Search; crescimento do YouTube; crescimento do Cloud; expansão de margem; monetização de IA; FCF forte; retorno elevado sobre capital"),
    invalidates: L("perda estrutural da economia da Search; queda significativa de participação; IA canibalizando receita sem monetização equivalente; Cloud perdendo competitividade; deterioração persistente de margens; regulação materialmente prejudicial"),
    monitor: L("Search; YouTube; Cloud; margens; capex; IA; FCF; TAC; valuation"),
    valuationApproach: "FCF e lucro frente ao crescimento; caixa líquido relevante.",
  },
  {
    market: "US", ticker: "BRK.B", kind: "posicao", horizon: "longo prazo",
    role: "Compounder diversificado e componente de qualidade/estabilidade.",
    text: "Exposição diversificada a seguros, investimentos, empresas operacionais e grande capacidade de alocação de capital. Depende menos de crescimento explosivo e mais de reinvestir capital com disciplina durante décadas.",
    confirms: L("crescimento do valor intrínseco; boa subscrição de seguros; geração de float; retornos adequados da carteira; boa alocação de capital; crescimento dos negócios operacionais; disciplina em aquisições e recompras"),
    invalidates: L("deterioração estrutural do negócio de seguros; alocação de capital ruim; aquisições destrutivas; queda persistente dos retornos; valuation sem margem de segurança; perda estrutural das vantagens competitivas"),
    monitor: L("book value e equivalentes; operating earnings; underwriting; float; caixa; investimentos; aquisições; recompras; preço/valor intrínseco"),
    valuationApproach: "Preço/valor patrimonial e operating earnings (lucro GAAP oscila com marcação dos investimentos).",
  },
  {
    market: "US", ticker: "JEPQ", kind: "posicao", horizon: "longo prazo",
    role: "Geração de renda em dólar.",
    text: "Instrumento de renda, não substituto perfeito de uma carteira de crescimento. Gera renda com exposição a ações e opções, sacrificando parte do upside em determinadas condições.",
    confirms: L("distribuição sustentável; volatilidade controlada; retorno total competitivo para sua função; qualidade da carteira; eficiência da estratégia de opções; comportamento adequado em diferentes regimes"),
    invalidates: L("retorno total persistentemente inferior às alternativas sem compensação pela renda; deterioração estrutural da estratégia; distribuição incompatível com a geração econômica; concentração excessiva; comportamento inadequado para o objetivo de renda"),
    monitor: L("total return; distribuição; yield; volatilidade; composição; exposição ao Nasdaq; estratégia de opções; comparação com QQQ/VOO"),
    valuationApproach: "Yield e retorno total frente às alternativas (QQQ/VOO, renda fixa); não tem valor justo de empresa.",
  },
  {
    market: "US", ticker: "LQD", kind: "posicao", horizon: "longo prazo",
    role: "Renda fixa em dólar e diversificação do risco acionário.",
    text: "Crédito corporativo investment grade dos EUA. Não é \"o preço vai subir\": é renda em dólar com crédito de qualidade, aceitando risco de duration e spread.",
    confirms: L("qualidade de crédito preservada; spreads razoáveis; yield competitivo; baixa deterioração dos emissores; retorno total adequado ao risco; diversificação efetiva"),
    invalidates: L("deterioração generalizada do crédito investment grade; spreads excessivamente comprimidos; duration incompatível com o cenário; alternativa claramente superior em risco/retorno; deterioração estrutural da qualidade dos emissores"),
    monitor: L("yield; duration; spread; rating; defaults; composição; juros dos Treasuries; retorno total"),
    valuationApproach: "Yield e spread frente aos Treasuries e ao risco de duration.",
  },
  {
    market: "US", ticker: "VNQ", kind: "posicao", horizon: "longo prazo",
    role: "Exposição diversificada ao setor imobiliário americano.",
    text: "Exposição ampla a REITs americanos, sem escolher individualmente cada REIT. Tese estrutural: imóveis produtivos, aluguel, renda e valorização patrimonial.",
    confirms: L("crescimento de NOI/aluguel; ocupação saudável; balanços dos REITs; FFO/AFFO crescente; dividendos sustentáveis; valuations razoáveis; juros favorecendo o setor em determinados ciclos"),
    invalidates: L("deterioração estrutural dos fundamentos imobiliários; excesso de alavancagem; queda persistente de FFO; dividendos insustentáveis; valuation excessivo; alternativa de renda significativamente superior"),
    monitor: L("FFO/AFFO; dividendos; ocupação; dívida; cap rates; juros longos dos EUA; composição setorial; valuation"),
    valuationApproach: "P/FFO e dividend yield frente aos juros longos dos EUA.",
  },
  {
    market: "US", ticker: "VOO", kind: "alternativa", horizon: "longo prazo",
    role: "Exposição ampla ao S&P 500 (posição/alternativa estratégica).",
    text: "Forma simples e diversificada de participar do crescimento das grandes empresas americanas. Não compete automaticamente com cada ação individual: comparar VOO × ações individuais × renda × guardar capital para oportunidade. Válida enquanto diversificação, baixo custo e crescimento de longo prazo continuarem adequados ao objetivo patrimonial.",
    confirms: L("diversificação e baixo custo preservados; lucros do S&P 500 crescendo"),
    invalidates: L("diversificação, custo ou crescimento de longo prazo deixarem de ser adequados ao objetivo patrimonial"),
    monitor: L("valuation agregado do S&P 500; concentração das maiores empresas; crescimento de lucros; juros reais; earnings yield; alternativas disponíveis"),
    valuationApproach: "Earnings yield do S&P 500 frente aos juros reais.",
  },
];
