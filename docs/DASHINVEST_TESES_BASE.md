# DASHINVEST — TESES-BASE DAS CARTEIRAS

> Base qualitativa do DashInvest (complementa `DASHINVEST_MASTER_SPEC.md`). Os números citados
> (resultados de trimestres) são fatos na data em que o texto foi escrito — o painel deve
> atualizá-los pelos dados, nunca tratá-los como permanentes. Carregadas no painel em
> "Minhas teses → Carregar teses-base" (`src/lib/thesis/baseTheses.ts`).

## 1. Como estas teses devem funcionar

Estas teses são a base qualitativa do DashInvest. A tese NÃO deve determinar automaticamente uma compra.

```text
TESE → FUNDAMENTOS → QUALIDADE → VALUATION → PREÇO ATUAL → PESO NA CARTEIRA → RISCO → ALTERNATIVAS → DECISÃO SOBRE O CAPITAL DISPONÍVEL
```

A existência de uma tese positiva significa que o ativo pode fazer parte da carteira no longo prazo. Não significa que qualquer preço seja bom para comprar. Uma empresa excelente pode receber recomendação de esperar quando estiver excessivamente valorizada.

A tese também não deve ser invalidada simplesmente porque o preço caiu. Uma queda de preço pode representar oportunidade, deterioração temporária, deterioração estrutural ou mudança de percepção do mercado. O sistema precisa distinguir essas situações.

## 2. BRASIL

### ITUB4 — Itaú Unibanco
**Papel:** núcleo de qualidade do bloco de ações brasileiras.
**Tese:** uma das posições brasileiras de maior qualidade para exposição ao sistema financeiro — escala, diversificação de receitas, geração de lucro, gestão de risco e histórico de rentabilidade elevada. O banco consegue continuar crescendo de forma rentável em diferentes ciclos de crédito, preservando ROE elevado e geração de capital. (Fato na data: ROE recorrente anualizado de 24,8% no 1T26; carteira de crédito ~R$ 1,5 trilhão.)
**Confirma:** ROE estruturalmente elevado; crescimento saudável da carteira; inadimplência controlada; boa cobertura; geração consistente de capital; CET1 confortável; crescimento de receitas; controle de despesas; qualidade de crédito; atravessar ciclos de juros e crédito sem destruição relevante de rentabilidade.
**Invalida:** deterioração estrutural da qualidade de crédito; queda persistente do ROE sem recuperação; deterioração relevante de capital; perda estrutural de eficiência; crescimento de crédito com deterioração excessiva; mudança estrutural no modelo que reduza a vantagem competitiva; problemas de governança ou alocação de capital.
**Monitorar:** ROE, ROA, CET1, Basileia, inadimplência, cobertura, NIM, crescimento da carteira, custo do crédito, eficiência, lucro recorrente, P/VP, P/L, crescimento e dividendos.
**Valuation:** P/VP em conjunto com ROE, crescimento e custo de capital. Não usar P/L isoladamente.

### BPAC11 — BTG Pactual
**Papel:** exposição ao crescimento do mercado financeiro brasileiro, modelo mais diversificado e com potencial de crescimento superior ao de um banco tradicional.
**Tese:** banco de investimento, crédito, gestão de recursos, wealth management e outras atividades — múltiplas fontes de receita. Crescimento de longo prazo apoiado por expansão de clientes, ativos sob gestão, crédito, investment banking e capacidade de reinvestimento.
**Confirma:** crescimento consistente do lucro; ROE elevado; receitas diversificadas crescendo; expansão de wealth/asset management; crescimento de AUM; qualidade da carteira de crédito; capitalização confortável; boa eficiência; reinvestir capital com retornos elevados.
**Invalida:** deterioração estrutural do ROE; crescimento excessivamente dependente de crédito; deterioração importante da carteira; aumento de risco sem retorno proporcional; deterioração de capital; concentração excessiva em uma fonte de receita; problemas relevantes de governança.
**Monitorar:** ROE, CET1/Basileia, inadimplência, cobertura, carteira de crédito, receitas por segmento, AUM, eficiência, lucro recorrente, P/VP, P/L e crescimento. Fonte primária: central de resultados do RI do BTG.
**Valuation:** P/VP interpretado junto com ROE sustentável, crescimento e risco.

### PETR4 — Petrobras
**Papel:** exposição a petróleo, geração de caixa e potencial de distribuição de capital.
**Tese:** não é "petróleo vai subir". A Petrobras possui ativos de produção competitivos, especialmente no pré-sal, capazes de gerar caixa relevante com preços de petróleo economicamente favoráveis. Depende de disciplina de capital, eficiência operacional e de não destruir valor por decisões políticas ou alocação inadequada de capital.
**Confirma:** produção eficiente; custo de extração competitivo; FCF robusto; dívida controlada; disciplina de capex; retorno adequado dos investimentos; dividendos compatíveis com a geração de caixa; governança e racionalidade econômica; expansão produtiva com retorno adequado.
**Invalida:** interferência política destruindo retorno econômico; aumento estrutural de capex sem retorno; deterioração relevante da dívida; projetos de baixo retorno; deterioração estrutural da eficiência; destruição de caixa; política de preços ou investimentos incompatível com criação de valor.
**Monitorar:** Brent, produção, lifting cost, capex, dívida líquida/EBITDA, FCF, refino, reservas, dividendos, ROIC, projetos e alocação de capital.
**Valuation:** FCF, EV/EBITDA, dividend yield sustentável e valor dos ativos/reservas. Não valorar apenas por dividend yield passado.

### VALE3 — Vale
**Papel:** exposição a commodities e diversificação do risco predominantemente doméstico.
**Tese:** ativos minerais de alta qualidade (minério de ferro, cobre e níquel). Fica mais interessante se a companhia aumentar eficiência, reduzir custos, melhorar produção e ampliar metais ligados à eletrificação. (Fato na data: 2T26 com 84,3 Mt de minério, 98,4 kt de cobre e 42,0 kt de níquel, crescimento anual nos três.)
**Confirma:** produção eficiente; custos competitivos; qualidade dos ativos; crescimento de cobre; disciplina de capital; redução de riscos operacionais; boa geração de caixa no ciclo; disciplina de distribuição.
**Invalida:** deterioração estrutural dos custos; perda relevante de competitividade; problemas operacionais persistentes; deterioração de governança; capex destrutivo; queda estrutural da qualidade dos ativos; dependência excessiva de minério sem melhora de diversificação.
**Monitorar:** preço do minério, cobre e níquel, produção, vendas, custos, EBITDA, FCF, capex, dívida, dividendos, guidance e projetos.
**Valuation:** EV/EBITDA, FCF yield, NAV/SOTP e cenários de preço das commodities. Não usar múltiplo de lucro isoladamente.

### XPML11 — XP Malls
**Papel:** imóveis comerciais/shoppings e renda imobiliária.
**Tese:** qualidade dos ativos, localização, geração de renda, ocupação, poder de negociação com lojistas e gestão ativa. Shopping é negócio imobiliário operacional, não "cota que paga dividendos".
**Confirma:** ocupação elevada; vendas dos lojistas saudáveis; aluguel/m² crescente; inadimplência controlada; diversificação; ativos de qualidade; aquisições com retorno adequado; distribuição recorrente sustentável; gestão eficiente.
**Invalida:** deterioração persistente da ocupação; queda estrutural das vendas; concentração excessiva; aquisição de ativos ruins; distribuição sem sustentação; alavancagem excessiva; destruição de valor em emissões/aquisições.
**Monitorar:** vacância, ocupação, vendas/m², aluguel/m², NOI, inadimplência, concentração, cap rate implícito, P/VP, valor patrimonial, dívida e emissões.
**Valuation:** P/VP, cap rate implícito e renda recorrente × custo de oportunidade.

### KNRI11 — Kinea Renda Imobiliária
**Papel:** núcleo defensivo de imóveis físicos (escritórios e logística).
**Tese:** qualidade e localização dos imóveis, diversificação dos contratos, ocupação e renda recorrente. Posição imobiliária de longo prazo, não aposta em valorização rápida da cota.
**Confirma:** ocupação elevada; contratos de qualidade; bons inquilinos; reajustes saudáveis; imóveis bem localizados; manutenção da qualidade física; renda recorrente; gestão disciplinada.
**Invalida:** deterioração estrutural de ocupação; concentração excessiva; perda de qualidade dos imóveis; contratos problemáticos; alavancagem inadequada; aquisições destrutivas.
**Monitorar:** vacância, WAULT/prazo contratual, aluguel/m², concentração, valor patrimonial, cap rate, P/VP, distribuição e dívida.

### HGLG11 — Pátria Logística
**Papel:** exposição ao setor logístico brasileiro.
**Tese:** importância estrutural da logística para comércio e distribuição no Brasil; ativos logísticos de qualidade gerando renda e valorização patrimonial.
**Confirma:** ocupação elevada; imóveis modernos; localização estratégica; contratos longos; bons inquilinos; aluguel crescendo; disciplina em aquisições; baixa deterioração de crédito; renda crescendo de forma sustentável.
**Invalida:** deterioração relevante da ocupação; concentração excessiva; aquisições caras; alavancagem excessiva; queda estrutural da qualidade dos contratos; destruição de valor patrimonial.
**Monitorar:** vacância, contratos, aluguel/m², concentração, cap rate, P/VP, valor patrimonial, dívida, distribuição e novas aquisições.

### KNHY11 — Kinea High Yield
**Papel:** renda imobiliária via crédito/CRI, com maior busca por rendimento.
**Tese:** não é FII de imóveis físicos. O retorno depende da qualidade dos CRIs, spreads, indexadores, garantias, LTV, diversificação e da capacidade do gestor de controlar risco de crédito.
**Confirma:** carteira de CRIs diversificada; bons devedores; garantias adequadas; LTV controlado; spreads interessantes; baixa inadimplência; boa cobertura; distribuição sustentável; gestão ativa de risco.
**Invalida:** deterioração relevante dos devedores; concentração excessiva; aumento de inadimplência; garantias insuficientes; deterioração estrutural da carteira; distribuição artificialmente elevada; perda permanente de patrimônio.
**Monitorar:** CRI por CRI, devedor, setor, indexador, spread, duration, LTV, garantias, rating, inadimplência, provisões, concentração, P/VP e resultado recorrente.
**Importante:** não usar vacância e qualidade de imóveis como motor da tese.

## 3. INTERNACIONAL

### NU — Nu Holdings
**Papel:** crescimento de longo prazo e expansão do sistema financeiro digital latino-americano.
**Tese:** transformar a enorme base de clientes em plataforma financeira cada vez mais completa — monetização por cliente, produtos, depósitos, crédito e receitas — com potencial de expansão internacional. Não depende de uma aquisição específica.
**Confirma:** crescimento de clientes e de ativos; receita por cliente; depósitos; crédito com controle de risco; ROE elevado; inadimplência estável/melhorando; novos produtos; eficiência; crescimento sustentável fora do Brasil; vantagem competitiva.
**Invalida:** deterioração persistente de crédito; perda estrutural de clientes; incapacidade de monetizar a base; queda estrutural do ROE; crescimento que exija capital excessivo; deterioração competitiva; expansão internacional destruindo valor; problemas regulatórios relevantes.
**Monitorar:** clientes, MAU, ARPAC, depósitos, carteira de crédito, NPL, custo de crédito, ROE, margem, eficiência, capital, crescimento internacional e valuation.

### META — Meta Platforms
**Papel:** crescimento estrutural em publicidade digital, plataformas sociais e IA.
**Tese:** uma das maiores plataformas de distribuição digital do mundo, monetizando a base por publicidade; IA pode melhorar recomendação, anúncios, engajamento e novos produtos. (Fato na data: 2T26 com receita de US$ 60,8 bi, +28% a/a, despesas crescendo mais rápido e margem operacional caindo para 31% — acompanhar crescimento × custo do investimento em IA.)
**Confirma:** receita e publicidade crescendo; monetização melhorando; usuários/engajamento; eficiência por IA; margens sustentáveis; FCF; retorno sobre capital elevado; monetização de novos produtos.
**Invalida:** deterioração estrutural da publicidade; perda de relevância; custos de IA destruindo retorno de forma permanente; queda estrutural de margens; regulação que altere o modelo; incapacidade de transformar investimento em retorno.
**Monitorar:** receita, ad impressions, preço por anúncio, usuários, margens, capex, FCF, investimentos em IA, Reality Labs e valuation.

### NVDA — NVIDIA
**Papel:** exposição de maior crescimento à infraestrutura de IA.
**Tese:** vantagem competitiva extraordinária em aceleradores, software/ecossistema e infraestrutura de IA. O ponto central: capturar parcela relevante do crescimento da infraestrutura computacional de IA mantendo retornos extraordinários sobre o capital. (Fato na data: 2T fiscal 2027 com receita de US$ 96,2 bi, +106% a/a; Data Center US$ 89 bi, +117%.)
**Confirma:** crescimento do Data Center; demanda sustentada; margens elevadas; software/ecossistema; liderança tecnológica; novas gerações; grandes clientes investindo; FCF crescendo.
**Invalida:** desaceleração estrutural da demanda; perda tecnológica; competição reduzindo margens; clientes com alternativas próprias; excesso de oferta; retorno ruim dos investimentos em IA dos clientes; valuation crescendo muito mais rápido que os fundamentos.
**Monitorar:** Data Center, receita, margem bruta, capex dos hyperscalers, pedidos, geração de caixa, concorrência, roadmap e valuation.
**Regra:** excelente empresa não significa excelente preço.

### MSFT — Microsoft
**Papel:** crescimento de alta qualidade e diversificação entre software, cloud, IA e produtividade.
**Tese:** negócios recorrentes, ecossistema empresarial, Azure, Office, Windows, segurança, GitHub e IA; transformar a posição dominante em software empresarial em plataforma de infraestrutura e produtividade de IA.
**Confirma:** Azure crescendo; expansão de margens; receita recorrente; adoção do Copilot; segurança; FCF forte; retorno sobre capital elevado; monetização de IA acima do aumento de custos.
**Invalida:** desaceleração estrutural de cloud; IA sem retorno sobre o capex; perda de vantagem competitiva; compressão persistente de margens; deterioração relevante de crescimento.
**Monitorar:** Azure, Microsoft Cloud, Copilot, margem operacional, capex, FCF, receita recorrente, crescimento e valuation.

### AAPL — Apple
**Papel:** qualidade, ecossistema, marca e geração de caixa.
**Tese:** ecossistema integrado, enorme base instalada, poder de marca e monetização por hardware, serviços e acessórios. Compounder de alta qualidade, não necessariamente o maior crescimento da carteira.
**Confirma:** base instalada crescendo; Services crescendo; retenção; expansão de margem; FCF; recompras eficientes; receita por usuário crescendo de forma sustentável.
**Invalida:** perda estrutural de participação; deterioração da marca; queda persistente do ecossistema; inovação insuficiente; dependência excessiva de um produto; compressão estrutural de margens.
**Monitorar:** iPhone, Services, China, margem, base instalada, FCF, recompras, capex e valuation.

### GOOGL — Alphabet
**Papel:** busca, publicidade digital, cloud e IA.
**Tese:** ativos difíceis de replicar (Search, YouTube, Android, dados, infraestrutura e Google Cloud). A questão central: incorporar IA sem destruir a economia da busca e criar novas receitas.
**Confirma:** Search, YouTube e Cloud crescendo; expansão de margem; monetização de IA; FCF forte; retorno elevado sobre capital.
**Invalida:** perda estrutural da economia da Search; queda significativa de participação; IA canibalizando receita sem monetização equivalente; Cloud perdendo competitividade; deterioração persistente de margens; regulação materialmente prejudicial.
**Monitorar:** Search, YouTube, Cloud, margens, capex, IA, FCF, TAC e valuation.

### BRK.B — Berkshire Hathaway
**Papel:** compounder diversificado e componente de qualidade/estabilidade.
**Tese:** seguros, investimentos, empresas operacionais e grande capacidade de alocação de capital. Depende menos de crescimento explosivo e mais de reinvestir capital com disciplina durante décadas.
**Confirma:** crescimento do valor intrínseco; boa subscrição; geração de float; retornos adequados da carteira; boa alocação de capital; negócios operacionais crescendo; disciplina em aquisições e recompras.
**Invalida:** deterioração estrutural dos seguros; alocação de capital ruim; aquisições destrutivas; queda persistente dos retornos; valuation sem margem de segurança; perda estrutural das vantagens.
**Monitorar:** book value e equivalentes, operating earnings, underwriting, float, caixa, investimentos, aquisições, recompras e preço/valor intrínseco.

### JEPQ — JPMorgan Nasdaq Equity Premium Income ETF
**Papel:** geração de renda em dólar.
**Tese:** instrumento de renda, não substituto de uma carteira de crescimento; gera renda com ações e opções, sacrificando parte do upside.
**Confirma:** distribuição sustentável; volatilidade controlada; retorno total competitivo para a função; qualidade da carteira; eficiência das opções; comportamento adequado em diferentes regimes.
**Invalida:** retorno total persistentemente inferior às alternativas sem compensação pela renda; deterioração estrutural da estratégia; distribuição incompatível com a geração econômica; concentração excessiva; comportamento inadequado para renda.
**Monitorar:** total return, distribuição, yield, volatilidade, composição, exposição ao Nasdaq, estratégia de opções e comparação com QQQ/VOO.

### LQD — iShares iBoxx $ Investment Grade Corporate Bond ETF
**Papel:** renda fixa em dólar e diversificação do risco acionário.
**Tese:** crédito corporativo investment grade dos EUA; não é "o preço vai subir", é renda em dólar com crédito de qualidade, aceitando risco de duration e spread.
**Confirma:** qualidade de crédito preservada; spreads razoáveis; yield competitivo; baixa deterioração dos emissores; retorno total adequado ao risco; diversificação efetiva.
**Invalida:** deterioração generalizada do crédito IG; spreads excessivamente comprimidos; duration incompatível com o cenário; alternativa claramente superior; deterioração estrutural dos emissores.
**Monitorar:** yield, duration, spread, rating, defaults, composição, juros dos Treasuries e retorno total.

### VNQ — Vanguard Real Estate ETF
**Papel:** exposição diversificada ao setor imobiliário americano.
**Tese:** exposição ampla a REITs — imóveis produtivos, aluguel, renda e valorização patrimonial.
**Confirma:** NOI/aluguel crescendo; ocupação saudável; balanços dos REITs; FFO/AFFO crescente; dividendos sustentáveis; valuations razoáveis; juros favorecendo o setor em determinados ciclos.
**Invalida:** deterioração estrutural dos fundamentos imobiliários; alavancagem excessiva; queda persistente de FFO; dividendos insustentáveis; valuation excessivo; alternativa de renda significativamente superior.
**Monitorar:** FFO/AFFO, dividendos, ocupação, dívida, cap rates, juros longos dos EUA, composição setorial e valuation.

## 4. VOO — posição/alternativa estratégica
**Papel:** exposição ampla ao S&P 500.
**Tese:** forma simples e diversificada de participar do crescimento das grandes empresas americanas. Não compete automaticamente com cada ação: comparar VOO × ações individuais × renda × guardar capital para oportunidade. Válida enquanto diversificação, baixo custo e crescimento de longo prazo continuarem adequados ao objetivo patrimonial.
**Monitorar:** valuation agregado do S&P 500, concentração das maiores empresas, crescimento de lucros, juros reais, earnings yield e alternativas.

## 5. ETFs brasileiros
### BOVA11
**Papel:** exposição diversificada ao mercado acionário brasileiro. Alternativa quando o objetivo for exposição ampla sem risco específico de uma empresa; não precisa receber aportes se ações individuais tiverem melhor relação qualidade/valuation.
**Monitorar:** valuation do Ibovespa, composição, lucro agregado, juros, risco fiscal e comparação com ações individuais.

### IVVB11
**Papel:** S&P 500 pelo mercado brasileiro, com componente cambial. Como existe carteira internacional própria, comparar com a compra direta de ETFs/ativos em dólar.
**Monitorar:** S&P 500, câmbio, custos, tributação, spread e alternativa de investimento direto no exterior.

## 6. Regra final das teses

```text
Tese positiva = comprar                       ← NÃO
Tese positiva + fundamentos confirmados + valuation atrativo + peso adequado + risco aceitável + alternativas inferiores = maior prioridade de aporte
Tese positiva + empresa excelente + valuation excessivo = manter / esperar / aportar pouco
Tese deteriorando + fundamentos piorando + valuation ainda elevado = reduzir prioridade / considerar venda
```

Estados obrigatórios da tese: **intacta · em observação · ameaçada · invalidada** — o painel explica qual evento causou cada mudança.

## 7. Campos obrigatórios por ativo
O que confirma · O que ameaça (sinais que exigem investigação, mas não invalidam) · O que invalida · O que poderia tornar o ativo barato demais (quedas por fatores temporários com a tese intacta) · O que poderia tornar o ativo caro demais (valuation além do crescimento e retorno justificáveis) · Alternativas (outros ativos da carteira que poderiam receber o capital).

## 8. Regra de implementação
Não transformar nenhum texto em gatilho mecânico. As teses são o contexto qualitativo; os dados atuais são atualizados periodicamente. A recomendação final combina tese, fundamentos, valuation, preço, margem de segurança, peso, concentração, risco, macro, liquidez, alternativas e capital disponível no ciclo. A tese deve sobreviver à mudança de preço; o preço é avaliado contra a tese; o aporte é consequência dessa análise, nunca de um percentual fixo.
