# DashInvest — mecânica completa para revisão

> **Para o ChatGPT:** este documento descreve, com números e regras exatas, como o meu painel de investimentos decide **onde aportar, quando comprar e quando vender parte de uma posição**. Você já conhece a minha filosofia de investimento e as minhas teses pelas nossas conversas. Quero que você:
> 1. avalie se o fluxo é **confiável e coerente** com a minha filosofia (médio e longo prazo, valuation, nunca day trade);
> 2. aponte **erros de lógica, premissas frágeis ou parâmetros mal calibrados** (cite a seção e o número);
> 3. diga se dá para **continuar usando e testar aos poucos**, ou o que precisa melhorar antes;
> 4. no final, me devolva **as minhas teses no formato da seção 12**, para eu cadastrar no painel.
>
> Responda em português. Seja crítico: prefiro saber o que está errado agora.

---

## 1. Filosofia e regras que o sistema não pode quebrar

- **Horizonte:** médio e longo prazo. O que importa é valuation (P/L, EBITDA, lucro, fluxo de caixa, ROE), qualidade do negócio e tese — não velas de minuto ou de dia.
- **Nunca executa ordens.** Só recomenda; eu decido e executo na corretora.
- **Nunca inventa dado.** Se falta dado, o sistema diz "sem dados" e não sugere compra.
- **Nunca rotula dado atrasado como tempo real.** A tela mostra a idade real da cotação; mas a decisão de aporte aceita cotação de até 4 dias (é longo prazo).
- **Venda só por preço.** Vender parte acontece apenas quando o preço está muito acima do valor justo. **Peso acima da meta, sozinho, nunca gera venda** — o próximo aporte corrige.
- **Tudo gratuito.** Fontes públicas/gratuitas, sem IA paga analisando em tempo real (por enquanto).

## 2. Carteiras e estratégia

Duas carteiras, mesma lógica e mesma tela:

| | Carteira Brasil | Carteira Internacional |
|---|---|---|
| Classes | Renda fixa, Ações, FIIs (metas em % editáveis) | Classes livres (ex.: CRESCIMENTO, RENDA VIA OPÇÕES, CRÉDITO CORPORATIVO, REAL ESTATE) + legado |
| Ativos hoje | ações e FIIs da B3 | META, NVDA, MSFT, AAPL, GOOGL, BRK.B, JEPQ, LQD, VNQ, NU; VOO = legado (não recebe aporte nem venda) |
| Meta por ativo | meta da classe ÷ nº de ativos da classe | idem; mínimo = 0,6× e máximo = 1,5× da meta do ativo |

- "Adicionar ao meu radar" (na tela do ativo e no Analisar) coloca um ativo novo numa classe existente; a meta da classe é redividida.
- Ativo fora do radar não entra no cálculo do aporte.
- **Divisão mensal Brasil × Exterior** (Visão geral): o aporte corrige primeiro o desvio da meta entre as duas carteiras. Se o dólar subiu ≥ 5% no mês, vai 10% a menos para o exterior (caiu ≥ 5% → 10% a mais). O lado com mais ativos em faixa atrativa recebe até 10% a mais.

## 3. Fontes de dados (todas gratuitas)

| Dado | Fonte | Atualização |
|---|---|---|
| Cotações EUA | Finnhub | memória de ~1 min; histórico diário pela Tiingo |
| Fundamentos EUA (P/L, P/FCF, margens, ROE, crescimento, P/L anual 5 anos, beta, ações em circulação) | Finnhub | cache 6 h |
| Estimativas de lucro, recomendações, preço-alvo | Finnhub + Alpha Vantage (25 consultas/dia) | 12 h |
| Juros EUA (Treasury 10 anos), VIX, spread de crédito high yield, índice de incerteza de política econômica (EPU) | FRED (Federal Reserve de St. Louis) | 6 h |
| Cotações B3 | brapi (atrasadas) | — |
| Fundamentos B3 (P/L, P/VP, LPA, VPA, DY, ROE, ROIC, margem, dívida, crescimento 5 anos; FIIs: VP/cota, DY, vacância, nº de imóveis) | Fundamentus (página pública) | cache 24 h |
| Selic meta e IPCA 12 meses | Banco Central (SGS 432 e 13522) | cache 12 h |
| Câmbio USD/BRL | AwesomeAPI + Banco Central + BCE | — |

Limitações conhecidas: estimativas de lucro dos EUA às vezes faltam (plano gratuito); a B3 não tem dados gratuitos de analistas/estimativas; notícias são só manchetes.

## 4. Qualidade do negócio

**EUA** — 12 indicadores, cada um "forte = 100 / adequado = 60 / fraco = 20" e média:
crescimento de receita a/a (forte ≥ 15%, adequado ≥ 5%), crescimento de EPS a/a (15/5), receita 3 anos (12/5), margem operacional (25/12), margem líquida (20/8), ROIC (15/8), ROE (20/10), crescimento do FCF 5 anos (12/3), FCF yield (4/2), dívida/patrimônio (≤ 0,5 / ≤ 1,5), liquidez corrente (1,5/1), variação de ações em circulação (≤ −1% / ≤ +1%). Exige ≥ 4 indicadores.

**B3 ações** — ROE (≥ 15 bom, ≥ 10 ok), ROIC (12/7), margem líquida (15/8), dívida bruta/patrimônio (≤ 0,5 / ≤ 1,5), crescimento da receita 5 anos (10/4).
**FIIs** — vacância (≤ 5 bom, ≤ 12 ok), nº de imóveis (≥ 15 / ≥ 5).

Nível: **excelente ≥ 75, boa ≥ 60, mediana ≥ 45, fraca < 45**; cobertura < 40% ou ETF = "sem dados".

## 5. Valor justo (o coração do sistema)

O valor justo é a **mediana robusta** de vários métodos independentes:
- um método só é descartado se for um outlier claro (os demais concordam em ±25% e ele está > 50% longe deles);
- se os métodos restantes divergem > 80%, o sistema **não mostra faixa** ("dados conflitantes").

### 5.1 EUA (ações; ETFs não têm valor justo)
1. **EPS estimado do ano fiscal corrente × P/L histórico**. O P/L histórico é a **mediana** dos P/L anuais dos últimos 5 anos, com **teto de 35x** (evita que anos de lucro deprimido inflem o múltiplo — foi o erro que fazia a NVDA aparecer "−64%").
2. **Preço-alvo médio dos analistas (12 meses).**
3. **EPS dos últimos 12 meses × P/L histórico** (mesmo teto).
4. **Fluxo de caixa descontado (DCF)**:
   - FCF por ação = (valor de mercado ÷ P/FCF) ÷ ações em circulação;
   - crescimento base = mediana de [crescimento do FCF 5 anos, EPS 3 anos, receita 3 anos, crescimento esperado de EPS], limitado a 0%–20% ao ano;
   - anos 1–5 com esse crescimento, anos 6–10 convergindo para 2,5%, perpetuidade de 2,5%;
   - desconto = Treasury 10 anos + beta (0,8–1,5) × 5% de prêmio de risco, limitado a 7%–13%.
5. **Trava de plausibilidade:** se preço ÷ valor justo < 0,55 ou > 2,0, o sistema não mostra faixa (desconto/prêmio extremo em empresa grande quase sempre é dado ruim).
6. Fallback (só se faltarem métodos): EPS 12m × P/L histórico (com teto), marcado como "confiança menor".

### 5.2 Brasil
Os métodos de perpetuidade usam o **juro real de longo prazo** = média entre o juro real atual ((1 + Selic) ÷ (1 + IPCA 12m) − 1) e o **juro neutro estimado pelo BC (~5% real)**. Motivo: a Selic de pico não dura 10 anos; usá-la como perpetuidade condena qualquer empresa de qualidade.

**Ações:**
1. **Graham:** √(22,5 × LPA × VPA).
2. **Bazin:** dividendos 12m ÷ yield exigido, com yield = juro real longo limitado a 6%–9% (sem dados do BC, 6% fixo).
3. **Lucro × P/L justo pelo juro real:** P/L = 1 ÷ (juro real longo + 4% de prêmio).
4. **P/VP justificado pelo ROE** (reconhece empresas que crescem com retorno alto, como bancos de qualidade): VPA × (ROE − g) ÷ (custo de capital − g), com:
   - ROE = LPA ÷ VPA;
   - custo de capital = juro real longo + 4% + IPCA;
   - g = mínimo entre ROE × (1 − payout) e IPCA + 3%;
   - payout = DY × P/L.

**FIIs:** (1) VP/cota; (2) renda 12m ÷ (juro real longo + 1,5 p.p., limitado a 7%–12%).

## 6. Faixas de valuation e confirmações

Faixas em relação ao valor justo (VJ):

| Faixa | Preço ÷ VJ (normal) | Preço ÷ VJ (incerteza alta) |
|---|---|---|
| Compra forte | < 0,85 | < 0,80 |
| Atrativo | 0,85–0,95 | 0,80–0,92 |
| Justo | 0,95–1,05 | 0,92–1,05 |
| Esticado | 1,05–1,25 | 1,05–1,25 |
| Extremamente esticado | > 1,25 | > 1,25 |

"Incerteza alta" = analistas muito divergentes (meta máxima − mínima > 60% da média) ou valor justo vindo só do múltiplo histórico.

**Confirmações antes de chamar de oportunidade (EUA):**
- **Sinal dos analistas** (−1 a +1):
  - revisão de lucro em 90 dias, escala linear (±3% = ±0,6);
  - mudança do consenso de recomendações em ~3 meses (até ±0,4);
  - saldo de upgrades/downgrades (até ±0,3).
- **Se o sinal ≤ −0,4** (analistas cortando), a compra vira **"esperar"**.
- **DCF reverso:** calcula o crescimento que o preço atual embute. Se ele supera o crescimento base em mais de 8 p.p. ao ano, a compra vira **"aporte normal, sem pressa"**.
- **Tese:**
  - "deteriorada" (cortes fortes de estimativa, sinais de mudança de tese, correção com fundamento) → nunca compra;
  - "em observação" (estimativas caindo) → não aumenta.

## 7. Postura de cada ativo (stance)

| Situação | Postura |
|---|---|
| Tese deteriorada | evitar (ou "sair da tese" se tenho posição e qualidade mediana/fraca) |
| Compra forte / atrativo + qualidade ok + tese ok | **oportunidade / compra** (recompra se vendi antes acima do preço atual) |
| Atrativo + qualidade fraca | evitar ("barata, mas ruim") |
| Atrativo + estimativas caindo | não aumentar |
| Justo | manter (aporte normal) |
| Esticado + qualidade **excelente** + tese ok + analistas não cortando + DCF reverso ok | **manter com aporte menor** (regra "não perder o compositor": esperar o preço ideal pode significar nunca comprar uma empresa excelente) |
| Esticado (demais casos) | manter sem aumentar (não vende) |
| Extremamente esticado, sem posição | evitar |
| Extremamente esticado, com posição, alta acompanhada de lucro subindo | manter sem aumentar |
| Extremamente esticado, com posição, qualidade boa/excelente | **realização parcial** |
| Extremamente esticado, com posição, qualidade mediana/fraca | reduzir |

## 8. Aporte: "quanto vou aportar este mês"

### 8.1 Prioridade
- **Alta = oportunidade pelo valuation** (compra/recompra). Recebe mais.
- **Média = aporte normal:**
  - preço justo;
  - excelente e um pouco cara, com metade do peso;
  - ETFs sem valuation (só pelo desvio da meta).
- **Baixa = não recebe** agora: caro, tese em risco, sem dados, analistas cortando ou já na meta/acima. Fica listado em "Onde aportar" com o motivo e o preço de entrada ("comprar abaixo de X, precisa cair Y%").

### 8.2 Internacional
1. **Necessidade de cada ativo:** quanto falta para atingir a meta depois do aporte.
2. **Multiplicador de oportunidade:** 0,25× a 1,75×, a partir de um score de 0–100 com 17 fatores. Pesos:
   - desvio da meta 16;
   - valuation 12; revisões de lucro 12;
   - tese 8; crescimento 7; drawdown 7;
   - qualidade 6; momentum 5; notícias 5;
   - surpresa de lucro 4; eventos 4; upside do alvo 4;
   - distância da máxima 3; volatilidade 3; risco 3; consenso 3;
   - dispersão dos alvos 2.
3. **Ajustes ao multiplicador:**
   - compra/recompra ×1,4 (×2 com medo no mercado);
   - sinal dos analistas ×(1 + 0,25 × sinal);
   - excelente e um pouco cara ×0,5;
   - alta forte recente (anti-FOMO) ×0,4;
   - resultado trimestral em ≤ 2 dias ×0,5; em ≤ 7 dias ×0,8.
4. **Esperam (não recebem):** caro, realização, tese em risco ou acima da meta.
5. **Distribuição:** proporcional a necessidade × multiplicador, limitada ao peso máximo e a 1,5× a necessidade.
6. **Ordem mínima:** US$ 10; valores menores são redistribuídos.
7. **Caixa de oportunidade:** até 20% do aporte fica guardado se ativos importantes estão esperando preço, com saldo máximo de 2 aportes.

### 8.3 Brasil
1. **Divisão por classe:** corrige primeiro o desvio da meta de cada classe (o aporte nunca vende nada).
2. **Dentro de ações e FIIs, o peso de cada ativo é a postura × o quanto ele está abaixo da meta:**
   - oportunidade/recompra = 2;
   - manter = 1;
   - excelente e um pouco cara = 0,5;
   - o resto = 0.
3. **Classe sem candidato:** a parte dela vai para a caixa de oportunidade.
4. **Arredondamento:** valores em R$ 10; linhas abaixo de R$ 50 são somadas às outras.

### 8.4 Ritmo pelo humor do mercado (só EUA)
- **Medo:** pelo menos 2 sinais entre VIX ≥ 25, spread high yield ≥ 5%, incerteza política ≥ 1,5× a mediana de 1 ano e S&P ≤ −8% no mês; ou VIX ≥ 32 sozinho.
  - Efeito: sem caixa de oportunidade, e as oportunidades ganham mais. Só vale se existir oportunidade de fato.
- **Euforia:** pelo menos 2 sinais entre VIX ≤ 14, spread ≤ 3% e S&P ≥ +15% em 6 meses, sem nenhum sinal de medo.
  - Efeito: o caixa de oportunidade sobe para até 30%.
- **O humor nunca muda o valor justo**, só o ritmo.

### 8.5 Travas de segurança
- Aporte bloqueado se mais da metade dos ativos está sem cotação ou com cotação de **mais de 4 dias**.
- Aporte bloqueado se a qualidade média dos dados fica abaixo de 60%. Componentes da qualidade dos dados:
  - cotação 35%;
  - fundamentos 20%;
  - estimativas 15%;
  - histórico 10%;
  - analistas 10%;
  - notícias 10%.

## 9. Venda parcial (mesmo cálculo, lado da venda)

- **Só dispara com:** posição + faixa "extremamente esticado" (preço > 1,25× o valor justo) + qualidade conhecida + alta **não** justificada por lucros subindo.
- **Tamanho:**
  - 10%–20% da posição se o preço está 25%–50% acima do valor justo;
  - 20%–30% se está mais de 50% acima;
  - 20%–35% se a qualidade é mediana/fraca.
- **Filtro de eficiência:** se a venda fica abaixo da ordem mínima (US$ 100 / R$ 500), ou se impostos + custos passam de 10% do valor vendido, vira "manter sem aumentar".
- **Impostos considerados:**
  - EUA: 15% sobre o ganho;
  - ações BR: 15%, com isenção de vendas até R$ 20 mil/mês;
  - FIIs: 20%.
- **No Resumo aparece:** "Vender X–Y cotas (A–B% da posição, ≈ valor), pois o preço P está Z% acima do valor justo V". Mostra também imposto e custos estimados.
- **Recompra em degraus**, depois de uma venda nos últimos ~18 meses:
  - abaixo de 0,85× o valor justo → recomprar 40% do que vendi;
  - 0,85–0,95× → 35%;
  - 0,95–1,0× → 25%.

## 10. Analisar compra (antes de comprar um ativo)

Veredito: **compra atrativa / compra parcial / esperar melhor preço / não aumentar / dados insuficientes**.
- Considera a postura, o peso depois da compra × meta e máximo, e a validade dos dados.
- Gera um plano em partes (40/30/30).
- Permite simular "e se cair até X?".
- Mostra links para confirmar (SEC, consenso de analistas, RI/fatos relevantes, Status Invest, Investidor10, notícias).
- Ativo fora do radar → botão "Adicionar ao meu radar".

## 11. Notificações

- **Categorias:** oportunidade, valuation esticado, possível realização, recompra, notícia, mudança de tese, carteira, resultado, macro.
- **Cooldown por categoria:** 7 dias para compra/venda, 3 dias para tese/macro. Volta a notificar antes do prazo se a prioridade subir.
- **Volume:** até 6 pushes não críticos por dia; mais de 2 numa rodada viram um push resumido.
- **Silêncio:** horário de silêncio 22h–7h.
- **Primeira rodada:** só preenche a central, sem rajada.

## 12. Formato para devolver as minhas teses

Para cada ativo, devolva **exatamente** neste formato (um bloco por ativo). Eu cadastro no painel em "Minhas teses":

```
ATIVO: BPAC11
MERCADO: BR            (BR ou US)
TESE (2–4 frases): por que eu tenho/quero este ativo no longo prazo.
PREMISSAS (3 a 5, verificáveis):
- ex.: ROE acima de 20% nos próximos 3 anos
- ex.: crescimento de receitas de banco de investimento acima do setor
- ex.: captação líquida positiva no wealth
EXPECTATIVA: o que espero em 3–5 anos (lucro, dividendos, múltiplo) — sem prever preço.
RISCOS (2 a 4):
- ex.: ciclo de juros alto por muito tempo reduz mercado de capitais
O QUE ME FARIA MUDAR DE IDEIA: gatilho objetivo (ex.: ROE < 15% por 4 trimestres seguidos).
HORIZONTE: ex.: 5+ anos
PREÇO QUE EU ACEITO PAGAR (opcional): faixa e por quê.
```

O painel acompanha cada premissa e me avisa ("mudança de tese") quando os dados sinalizam que uma delas quebrou.

## 13. Perguntas específicas para a sua revisão

1. **Teto de P/L de 35x (EUA)** e mediana de 5 anos: é razoável para empresas de crescimento (NVDA, META, MSFT)? Deveria variar por setor?
2. **Juro real de longo prazo = média entre o atual e 5%** (Brasil): faz sentido? Qual referência seria melhor e gratuita (NTN-B longa)?
3. **P/VP justificado pelo ROE** com custo de capital = juro real longo + 4% + IPCA: o prêmio de 4% está calibrado para bancos e empresas brasileiras?
4. **Regra do compositor** (excelente e até 25% acima do valor justo → aporte menor): concorda? O limite de 25% é generoso ou conservador demais? Ela resolve o meu medo de nunca comprar BTG porque está sempre "esticado"?
5. **Venda parcial só acima de 25% do valor justo:** é o ponto certo para quem é de longo prazo? Deveria considerar o tamanho da posição no patrimônio total?
6. **Prioridade alta só por valuation:** devo incluir mais algum fator? Por exemplo, a minha convicção na tese, ou dividendos para FIIs.
7. **Humor do mercado só muda o ritmo, não o valor justo:** está certo?
8. **O que está faltando** para eu confiar o suficiente para usar mês a mês, testando aos poucos (ex.: começar seguindo 50% da sugestão e comparar em 6–12 meses)?
9. **Quais analistas ou fontes você recomenda que eu acompanhe** para cada ativo da minha carteira, para confirmar as teses?

## 14. Próximos passos planejados

- **Calibração com histórico próprio:** o painel grava a postura de cada ativo todos os dias. Em 6–12 meses, medir se "compra forte" realmente rendeu mais que "esperar" e ajustar os limites.
- **IA por evento, não em tempo real:**
  - **Quando:** uma análise por resultado trimestral, fato relevante ou mudança forte de recomendação.
  - **O quê:** ler balanço, teleconferência e declarações da diretoria, e dizer se alguma premissa da tese mudou.
  - **Custo:** baixo, porque é por evento.
- **Fontes por ativo:** lista curada de analistas/comentaristas por ativo, para confirmar cada ideia.
