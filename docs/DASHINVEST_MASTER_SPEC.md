# DASHINVEST --- MASTER SPECIFICATION

**Versão:** 1.0\
**Função:** fonte de verdade do projeto DashInvest para o Claude
Code/Vibe Code.

------------------------------------------------------------------------

## 1. REGRA FUNDAMENTAL

O DashInvest é um **painel pessoal de análise e apoio à decisão de
investimentos**.

Ele não é um robô de trade, não executa ordens e não deve tentar
adivinhar o próximo movimento de preço.

Sua função é transformar:

**patrimônio + aportes + dados atuais + fundamentos + valuation +
contexto + tese**

em uma **decisão explicada e proporcional ao risco**.

A divisão do próximo aporte é uma consequência da análise.

> **A tese é o motivo. A divisão em reais/dólares é a consequência.**

Ordem de raciocínio:

1.  Qualidade do ativo.
2.  Valor econômico razoável.
3.  Preço atual.
4.  Margem de segurança.
5.  Peso na carteira.
6.  Mudanças na tese.
7.  Riscos e catalisadores.
8.  Alternativas disponíveis.
9.  Decisão e tamanho do aporte.

------------------------------------------------------------------------

## 2. PERFIL DO USUÁRIO

O painel é para um investidor jovem em fase de **acumulação
patrimonial**, com horizonte de longo prazo e disposição para assumir
risco de forma consciente.

Características relevantes:

-   21 anos.
-   Renda normalmente acima de R\$ 6 mil/mês, com meses superiores.
-   Busca aumentar a geração de renda ao longo dos próximos anos.
-   Possui reserva de emergência.
-   Está construindo patrimônio, não vivendo dos investimentos.
-   Horizonte de 10--15 anos ou mais.
-   Pretende aumentar os aportes conforme a renda crescer.
-   Aceita volatilidade quando o retorno esperado compensa o risco.
-   Não quer operar como day trader.
-   Pode realizar parcialmente uma posição quando a valuation ficar
    muito acima do razoável.
-   Pode recomprar quando a tese permanecer válida e a relação
    risco/retorno voltar a ser atrativa.

### Aportes de referência

**Brasil:** R\$ 2.500--3.000/mês.

**Exterior:** US\$ 500--600/mês.

Esses valores são parâmetros atuais, não regras permanentes.

> **Esclarecimento do usuário:** essas faixas são apenas **contexto do estágio
> patrimonial atual**. Não são regra fixa, valor padrão do motor, média
> obrigatória, limite mínimo/máximo nem parâmetro para forçar a distribuição.
> O motor trabalha sempre com o **capital disponível para aporte neste ciclo**,
> informado pelo usuário (R\$ 2.500, R\$ 10.000, US\$ 2.000 ou qualquer valor,
> inclusive meses excepcionais). Fluxo: capital disponível no ciclo → análise
> das oportunidades atuais → comparação entre alternativas → avaliação da
> carteira existente → pesos estratégicos, concentração, risco e valuation →
> distribuição do capital. Nada de "X% para A e Y% para B" a partir de um
> aporte padrão.

------------------------------------------------------------------------

## 3. FILOSOFIA DE INVESTIMENTO

### Dinheiro é ferramenta

Patrimônio não é identidade. O dinheiro deve gerar liberdade, segurança,
oportunidades e capacidade de escolha.

### Diversificação de renda

O objetivo é construir diferentes fontes de renda:

-   trabalho;
-   negócios;
-   investimentos;
-   patrimônio;
-   eventualmente imóveis/terra;
-   estruturas empresariais no futuro.

### Renda ativa e passiva

Renda ativa depende do trabalho. Renda passiva permite que o patrimônio
produza resultados.

### Risco consciente

O usuário não é conservador por perfil, mas isso não significa aceitar
risco sem remuneração.

O sistema deve distinguir:

-   risco que aumenta o retorno esperado;
-   risco que apenas aumenta a chance de perda.

### Patrimônio

A prioridade é construir ativos produtivos e preservar a capacidade de
acumulação.

### Liberdade

O objetivo final é ampliar as escolhas de vida por meio do patrimônio.

------------------------------------------------------------------------

## 4. PAPEL DO DASHINVEST

O painel deve funcionar como um **analista pessoal disciplinado**.

Ele deve:

-   organizar informações;
-   separar fatos de interpretação;
-   avaliar qualidade;
-   avaliar valuation;
-   avaliar preço;
-   comparar oportunidades;
-   analisar riscos;
-   considerar a posição atual;
-   considerar o aporte disponível;
-   identificar mudanças na tese;
-   explicar a decisão.

Pode recomendar:

-   **Comprar**
-   **Manter**
-   **Esperar**
-   **Realizar parcialmente**
-   **Recomprar**
-   **Evitar**
-   **Não fazer nada**

A capacidade de recomendar inação é essencial.

------------------------------------------------------------------------

# 5. BRASIL E EXTERIOR SÃO CARTEIRAS DISTINTAS

A separação não é apenas visual.

São duas carteiras com funções estratégicas diferentes.

## 5.1 Brasil

Objetivos:

-   construção patrimonial em reais;
-   renda;
-   exposição a empresas brasileiras;
-   FIIs;
-   renda fixa;
-   oportunidades decorrentes de juros e valuation.

Alocação estratégica de referência:

-   50% renda fixa;
-   25% ações brasileiras;
-   25% FIIs.

É um alvo estratégico, não uma regra automática.

### Watchlist atual

**Ações:** ITUB4, BPAC11, PETR4, VALE3 quando fizer sentido.

**FIIs:** XPML11, KNRI11, HGLG11, KNHY11.

**Renda fixa:** instrumentos de boa liquidez e risco compatível,
utilizados como base patrimonial e reserva de oportunidade.

A watchlist não obriga o sistema a comprar nenhum ativo.

------------------------------------------------------------------------

# 6. CARTEIRA INTERNACIONAL

Funções:

-   diversificação geográfica;
-   exposição ao dólar;
-   acesso a empresas globais;
-   exposição a setores menos representados no Brasil;
-   crescimento de longo prazo;
-   geração de renda em dólar.

Alocação estratégica atual:

### Crescimento --- 50%

-   META
-   NVDA
-   MSFT
-   AAPL
-   GOOGL
-   BRK.B

### Renda --- 20%

-   JEPQ

### Renda fixa/crédito --- 20%

-   LQD

### Imobiliário --- 10%

-   VNQ

São referências estratégicas, não regras imutáveis.

------------------------------------------------------------------------

# 7. QUALIDADE NÃO É PREÇO

Um ativo pode ser:

-   **Excelente + barato:** alta prioridade.
-   **Excelente + razoável:** prioridade normal.
-   **Excelente + caro:** manter, esperar ou eventualmente realizar
    parte se a valuation estiver extrema.
-   **Ruim + barato:** pode continuar sendo evitar.
-   **Ruim + caro:** evitar.

Nunca usar "caiu muito" como sinônimo de barato.

Nunca usar "subiu muito" como sinônimo de caro.

------------------------------------------------------------------------

# 8. MOTOR DE DECISÃO

Toda decisão deve combinar:

1.  Qualidade.
2.  Fundamentos.
3.  Valuation.
4.  Preço.
5.  Crescimento.
6.  Risco.
7.  Cenário.
8.  Peso na carteira.
9.  Concentração.
10. Tese.
11. Eventos.
12. Alternativas.

Classificações visuais podem incluir:

-   🟢 Excelente oportunidade.
-   🟡 Boa oportunidade / preço razoável.
-   🟠 Excelente ativo, valuation esticada.
-   🔵 Manter / acompanhar.
-   🔴 Tese deteriorada / evitar.
-   ⚪ Dados insuficientes.

A cor nunca pode ser a lógica da decisão.

------------------------------------------------------------------------

# 9. MODELOS ESPECÍFICOS POR SETOR

## Bancos

Priorizar:

-   ROE;
-   ROA;
-   CET1;
-   capital regulatório;
-   inadimplência/NPL;
-   cobertura;
-   margem financeira;
-   eficiência;
-   crescimento da carteira;
-   provisões;
-   lucro e crescimento do lucro;
-   P/E;
-   P/B;
-   qualidade da gestão;
-   geração de capital.

Não tratar bancos como empresas industriais comuns usando apenas
dívida/patrimônio e ROIC.

## Empresas não financeiras

Conforme o setor:

-   crescimento de receita e lucro;
-   margens;
-   EBITDA quando relevante;
-   fluxo de caixa;
-   FCFF/FCFE;
-   ROIC/ROE;
-   dívida líquida;
-   cobertura de juros;
-   geração de caixa;
-   vantagens competitivas;
-   gestão;
-   reinvestimento;
-   riscos regulatórios;
-   commodities;
-   macro.

## Tecnologia/crescimento

Avaliar:

-   crescimento de receita;
-   EPS;
-   margens;
-   fluxo de caixa;
-   retorno sobre capital;
-   escala;
-   efeitos de rede;
-   TAM quando relevante;
-   posição competitiva;
-   capex;
-   dependência de IA;
-   concentração;
-   regulação;
-   valuation;
-   expectativas já embutidas no preço.

Empresa excelente pode ser uma compra ruim se o preço exigir cenário
excessivamente otimista.

------------------------------------------------------------------------

# 10. VALUATION

O valuation deve ser tratado como **intervalo**, não como número mágico.

Usar, quando apropriado:

-   cenário pessimista;
-   cenário base;
-   cenário otimista.

Mostrar:

-   preço atual;
-   intervalo estimado;
-   margem de segurança;
-   principais premissas;
-   sensibilidade;
-   confiança.

Não apresentar fair value como verdade objetiva.

## DCF

Se usar FCFF, utilizar WACC de forma consistente.

Se usar FCFE, utilizar custo de equity de forma consistente.

Não misturar fluxo e taxa.

Taxas não podem ser escolhidas para fazer o valuation chegar ao preço
desejado.

## Múltiplos

Não aplicar universalmente uma regra como P/E médio de cinco anos + teto
de 35x.

O múltiplo depende de:

-   crescimento;
-   qualidade;
-   margens;
-   previsibilidade;
-   retorno sobre capital;
-   risco;
-   setor;
-   ciclo;
-   juros;
-   duração dos fluxos.

------------------------------------------------------------------------

# 11. FIIs

## Tijolo

Avaliar:

-   P/VP;
-   valor patrimonial;
-   imóveis;
-   localização;
-   ocupação;
-   vacância;
-   aluguel/m²;
-   contratos;
-   concentração;
-   reajustes;
-   potencial de crescimento;
-   cap rate quando aplicável;
-   gestão;
-   recorrência dos resultados.

## Crédito/papel

Avaliar:

-   qualidade dos CRIs;
-   indexadores;
-   spreads;
-   duration;
-   LTV;
-   ratings;
-   concentração;
-   risco de crédito;
-   inadimplência;
-   cobertura;
-   pré-pagamentos;
-   recorrência;
-   distribuição;
-   P/VP;
-   gestão.

Não aplicar o mesmo modelo a FIIs de tijolo e crédito.

------------------------------------------------------------------------

# 12. RENDA FIXA

A renda fixa pode funcionar como:

-   base patrimonial;
-   reserva de oportunidade;
-   liquidez;
-   previsibilidade;
-   proteção.

Avaliar:

-   rentabilidade líquida;
-   crédito;
-   liquidez;
-   duration;
-   marcação a mercado;
-   inflação;
-   Selic;
-   prêmio de crédito;
-   prazo;
-   emissor;
-   oportunidade relativa.

Não vender renda fixa automaticamente para comprar renda variável.

------------------------------------------------------------------------

# 13. APORTE MENSAL

O sistema deve responder:

> **Onde o próximo real/dólar tem melhor relação risco/retorno dentro da
> carteira?**

Não dividir igualmente por padrão.

Para cada aporte explicar:

### Quanto

Valor sugerido.

### Onde

Ativo/categoria.

### Por quê

Motivo fundamental.

### Valuation

Atrativa, razoável ou esticada.

### Carteira

Abaixo, próxima ou acima do alvo.

### Alternativas

Quais foram consideradas e por que ficaram atrás.

### Risco

Principal risco.

### Mudança

O que faria a recomendação mudar.

A divisão do aporte é a consequência; a tese é o motivo.

------------------------------------------------------------------------

# 14. REALIZAÇÃO PARCIAL

Não realizar apenas porque o preço subiu.

Perguntas obrigatórias:

1.  A valuation ficou extrema?
2.  A margem de segurança desapareceu?
3.  O preço passou a exigir crescimento excessivamente otimista?
4.  A tese continua intacta?
5.  A posição ficou concentrada?
6.  Existe alternativa claramente superior?
7.  Há custos/impostos relevantes?

Uma alta de 40% com lucro crescendo 20% não implica automaticamente
venda.

------------------------------------------------------------------------

# 15. RECOMPRA

Recomprar somente quando:

-   tese permanece válida;
-   fundamentos continuam saudáveis;
-   valuation melhorou;
-   margem de segurança reapareceu;
-   queda não representa deterioração estrutural.

Nunca usar:

> "caiu X%, então recomprar".

A pergunta é:

> **"Ficou mais barato em relação ao valor econômico?"**

------------------------------------------------------------------------

# 16. TESE

Cada posição deve possuir:

### Por que possuir

Motivo estrutural.

### O que precisa acontecer

Premissas.

### O que pode dar errado

Riscos.

### O que invalidaria a tese

Condições objetivas.

### O que confirmaria a tese

Indicadores positivos.

### Horizonte

Curto, médio ou longo.

Tese deve ser separada dos dados atuais.

------------------------------------------------------------------------

# 17. FATOS, INTERPRETAÇÃO E TESE

Separar claramente:

**FATO:** dado observado.

**INTERPRETAÇÃO:** significado possível.

**TESE:** hipótese de futuro.

**RISCO:** o que pode invalidar a tese.

Não apresentar opinião como fato.

------------------------------------------------------------------------

# 18. MACRO

Considerar:

-   Selic;
-   inflação;
-   curva de juros;
-   câmbio;
-   crescimento;
-   política fiscal;
-   ambiente político;
-   commodities;
-   juros americanos;
-   liquidez global.

Macro é contexto, não gatilho automático.

Não usar:

> "Selic caiu, então compre ações."

Explicar o efeito relativo e verificar valuation e fundamentos.

------------------------------------------------------------------------

# 19. CÂMBIO

Não usar regras mecânicas como:

> dólar +5% = reduzir exterior 10%.

ou:

> dólar -5% = aumentar exterior 10%.

A exposição internacional também existe para diversificação e proteção
cambial.

O câmbio pode influenciar novos aportes, mas o sistema não deve fazer
market timing cambial automático.

------------------------------------------------------------------------

# 20. EVENTOS

Monitorar:

-   resultados;
-   guidance;
-   mudanças de gestão;
-   M&A;
-   fatos relevantes;
-   regulações;
-   macro;
-   eventos políticos relevantes;
-   dividendos;
-   emissões;
-   recompras;
-   mudanças de tese.

Eventos podem influenciar a decisão, mas não devem gerar regras
arbitrárias universais.

------------------------------------------------------------------------

# 21. FRESHNESS DOS DADOS

Diferenciar:

### Dados estruturais

Podem ser atualizados com menor frequência:

-   balanços;
-   histórico;
-   métricas de qualidade.

### Dados sensíveis ao preço

Precisam ser recentes:

-   cotação;
-   valuation;
-   preço/valor;
-   drawdown;
-   sinais de realização/recompra.

Uma cotação antiga não deve ser apresentada como atual.

Exibir timestamp quando relevante.

------------------------------------------------------------------------

# 22. CONFIANÇA

Cada recomendação deve ter:

-   Alta;
-   Média;
-   Baixa.

Confiança baixa quando:

-   dados estão desatualizados;
-   valuation depende de premissas incertas;
-   existem eventos binários;
-   há divergência entre métodos.

Preferir:

> "dados insuficientes"

a inventar precisão.

------------------------------------------------------------------------

# 23. REGRAS ARBITRÁRIAS

Não espalhar números mágicos pelo código.

Evitar hardcodes como:

-   multiplicador x1,4;
-   medo x2;
-   alta x0,4;
-   redução automática perto de resultados;
-   qualquer peso sem validação.

Se uma regra for necessária:

1.  parametrizar;
2.  documentar;
3.  calibrar;
4.  testar historicamente;
5.  evitar que um único parâmetro domine.

------------------------------------------------------------------------

# 24. SCORE

Score é ferramenta de organização, não verdade científica.

Deve ser decomponível em fatores como:

-   qualidade;
-   valuation;
-   crescimento;
-   risco;
-   momento fundamental;
-   posição.

O usuário precisa entender por que o score existe.

Nunca esconder a decisão atrás de um número como "87/100".

------------------------------------------------------------------------

# 25. HIERARQUIA DE MATURIDADE

### Nível 1 --- Informação

Preço, fundamentos, notícias, valuation, posição, eventos.

### Nível 2 --- Apoio à decisão

Oportunidades, riscos, alternativas, cenários.

### Nível 3 --- Recomendação

Comprar, manter, esperar, realizar, recomprar, evitar.

O sistema nunca executa operações.

------------------------------------------------------------------------

# 26. BACKTEST

Regras quantitativas devem ser validadas antes de receberem peso alto.

Usar, quando possível:

-   dados ponto-a-ponto;
-   período histórico relevante;
-   ausência de look-ahead bias;
-   custos;
-   impostos quando aplicável;
-   dividendos;
-   splits;
-   eventos;
-   benchmarks.

Uma regra não é boa apenas porque parece intuitiva.

------------------------------------------------------------------------

# 27. PORTFÓLIO, NÃO APENAS ATIVO

A pergunta não é apenas:

> "Este ativo é bom?"

É:

> **"Este ativo é bom para esta carteira, neste preço, neste momento e
> diante das alternativas disponíveis?"**

Considerar:

-   peso atual;
-   peso-alvo;
-   concentração;
-   correlação;
-   setor;
-   câmbio;
-   liquidez;
-   risco;
-   horizonte.

------------------------------------------------------------------------

# 28. TAMANHO DA POSIÇÃO

Uma empresa excelente não precisa receber grande aporte se:

-   já estiver muito representada;
-   valuation estiver esticada;
-   houver risco de concentração.

Uma empresa excelente e subalocada pode receber aporte maior.

Qualidade e tamanho da posição são dimensões diferentes.

------------------------------------------------------------------------

# 29. BTC / ATIVOS ESPECULATIVOS

Bitcoin não faz parte do núcleo obrigatório.

Caso o usuário utilize renda extraordinária para BTC:

-   posição satélite;
-   sem dívida;
-   sem alavancagem;
-   sem comprometer reserva;
-   limite patrimonial definido;
-   sem substituir aportes estruturais.

Isso não deve contaminar a lógica do restante da carteira.

------------------------------------------------------------------------

# 30. NOTIFICAÇÕES

Princípio:

> **Monitorar muito, notificar pouco, explicar bem.**

Notificar somente mudanças materiais.

Categorias:

-   oportunidade;
-   valuation esticada;
-   possível realização;
-   notícia relevante;
-   mudança de tese;
-   desequilíbrio;
-   macro;
-   resultado;
-   evento internacional.

Não notificar cada oscilação diária.

### Linguagem

Evitar:

> "COMPRE AGORA!"

Preferir:

> "O ativo entrou em uma faixa de valuation mais atrativa. Fundamentos
> permanecem intactos e a posição está abaixo do alvo. O painel sugere
> analisar novo aporte."

------------------------------------------------------------------------

# 31. SEGURANÇA

Secrets como:

-   VAPID_PRIVATE_KEY;
-   API keys;
-   CRON_SECRET;
-   tokens;

devem permanecer em variáveis de ambiente.

Nunca expor secrets no frontend.

------------------------------------------------------------------------

# 32. ARQUITETURA DE DADOS

Separar:

-   **Portfolio State:** posições e valores.
-   **User Profile:** objetivos, aportes e risco.
-   **Investment Thesis:** teses.
-   **Market Data:** preços e valuation.
-   **Fundamental Data:** resultados.
-   **Macro Data:** juros, inflação, câmbio etc.
-   **News/Events:** acontecimentos.
-   **Recommendation Engine:** decisão.
-   **Notification Engine:** alertas.

Essa separação deve permitir evolução sem misturar lógica.

------------------------------------------------------------------------

# 33. AUDITORIA DAS RECOMENDAÇÕES

Cada recomendação importante deve registrar:

-   timestamp;
-   preço observado;
-   dados utilizados;
-   valuation;
-   posição;
-   aporte disponível;
-   decisão;
-   justificativa;
-   confiança;
-   riscos.

Assim será possível avaliar posteriormente a qualidade do sistema.

------------------------------------------------------------------------

# 34. EXPLICAÇÃO OBRIGATÓRIA

Toda recomendação importante deve responder:

1.  Por que este ativo?
2.  Por que agora?
3.  Por que este preço?
4.  Por que este tamanho?
5.  Por que não outro ativo?
6.  O que faria mudar de opinião?

------------------------------------------------------------------------

# 35. O QUE O DASHINVEST NÃO DEVE FAZER

Não deve:

-   executar operações;
-   fazer day trade;
-   prever exatamente o próximo preço;
-   tratar queda como desconto automaticamente;
-   tratar alta como motivo automático de venda;
-   vender empresa excelente só porque subiu;
-   comprar empresa ruim só porque caiu;
-   usar valuation com falsa precisão;
-   aplicar modelo bancário genérico;
-   aplicar modelo de FII de tijolo em FII de crédito;
-   fazer market timing cambial mecânico;
-   criar regras arbitrárias sem validação;
-   usar informação futura em backtests;
-   esconder decisões atrás de scores;
-   mandar notificações excessivas;
-   inventar dados ausentes.

------------------------------------------------------------------------

# 36. PRINCÍPIO DE OURO

Quando uma regra simples entrar em conflito com uma análise econômica
coerente, privilegiar a análise econômica.

Exemplo:

Se o ativo subiu 30%, mas o lucro cresceu 40% e a valuation continua
razoável, não vender automaticamente.

Se o ativo caiu 35%, mas os fundamentos deterioraram e a tese foi
invalidada, não comprar automaticamente.

------------------------------------------------------------------------

# 37. MODELO FINAL DE DECISÃO

Para cada ativo:

1.  **Qualidade** --- é um ativo de alta qualidade?
2.  **Fundamentos** --- melhorando, estáveis ou deteriorando?
3.  **Valuation** --- barato, justo ou caro?
4.  **Preço** --- existe margem de segurança?
5.  **Tese** --- confirmada, neutra ou quebrada?
6.  **Risco** --- quais os principais riscos?
7.  **Carteira** --- subalocado, adequado ou concentrado?
8.  **Alternativas** --- existe oportunidade melhor?
9.  **Cenários** --- pessimista, base e otimista.
10. **Decisão** --- comprar, manter, esperar, realizar, recomprar ou
    evitar.
11. **Tamanho** --- quanto faz sentido?
12. **Confiança** --- alta, média ou baixa.

------------------------------------------------------------------------

# 38. DIRETRIZ PARA O CLAUDE CODE

Antes de alterar qualquer lógica do DashInvest:

1.  Ler este documento.
2.  Identificar o módulo afetado.
3.  Verificar compatibilidade com a filosofia.
4.  Não introduzir números arbitrários.
5.  Não remover funcionalidades sem necessidade.
6.  Preservar Brasil e Exterior como carteiras distintas.
7.  Preservar fatos vs. interpretação vs. tese.
8.  Preservar a possibilidade de recomendar inação.
9.  Priorizar explicabilidade.
10. Priorizar qualidade e atualização dos dados.
11. Validar regras antes de automatizar decisões.
12. Não transformar o painel em robô de trading.

------------------------------------------------------------------------

# 39. CRITÉRIO DE SUCESSO

O usuário deve conseguir entender:

-   O que eu tenho?
-   Por que eu tenho?
-   O que mudou?
-   O que está barato ou caro?
-   Qual é a melhor oportunidade para o próximo aporte?
-   Quanto faz sentido colocar?
-   Por que não colocar em outra coisa?
-   O que faria eu vender?
-   O que faria eu recomprar?
-   Por que o painel está recomendando isso?

A recomendação nunca deve ser apenas um número.

Ela deve ser consequência de:

**QUALIDADE + FUNDAMENTOS + VALUATION + PREÇO + TESE + RISCO +
CARTEIRA + ALTERNATIVAS.**

------------------------------------------------------------------------

# 40. RESUMO EXECUTIVO

O DashInvest não existe para dizer simplesmente o que comprar.

Ele existe para ajudar o usuário a **pensar melhor sobre onde colocar o
próximo real e o próximo dólar**.

O objetivo é construir patrimônio de longo prazo, diversificado entre
Brasil e Exterior, combinando crescimento, renda, proteção cambial e
oportunidades.

O sistema deve ser agressivo quando houver oportunidade, paciente quando
não houver e disciplinado quando o mercado estiver eufórico ou
pessimista.

> **Excelente ativo não significa compra a qualquer preço.**
>
> **Preço barato não significa ativo bom.**
>
> **O melhor investimento combina qualidade, valor, preço e risco dentro
> da carteira certa.**
>
> **A divisão do aporte é a consequência. A tese é o motivo.**
