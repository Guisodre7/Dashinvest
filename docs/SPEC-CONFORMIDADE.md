# Conformidade com a DASHINVEST_MASTER_SPEC

Mapa do código atual × especificação (`docs/DASHINVEST_MASTER_SPEC.md`). Atualizar a cada mudança de lógica.

Legenda: ✅ conforme · 🔧 ajustado nesta revisão · ⏳ pendente (com motivo)

## Ajustes feitos para seguir a spec

| Seção | Antes | Agora |
|---|---|---|
| §19 Câmbio | dólar ±5% no mês → ±10% do aporte no exterior | 🔧 câmbio só como contexto; nenhuma regra mecânica |
| §10 Múltiplos | P/L médio 5 anos com teto universal de 35x | 🔧 P/L histórico limitado pelo P/L que o crescimento e os juros da própria empresa justificam (DCF ÷ lucro) |
| §10 Valuation como intervalo | valor justo exibido sem premissas | 🔧 intervalo, margem de segurança, cenários pessimista/base/otimista, premissas e confiança no detalhe do ativo |
| §10 DCF | fluxo e taxa sem documentação | 🔧 FCF por ação (acionista) descontado ao custo de equity; taxa vem do mercado, nunca ajustada ao preço |
| §18 Macro | medo zerava o caixa e dobrava o peso das oportunidades; euforia aumentava o caixa | 🔧 humor do mercado vira contexto explicado, sem mudar valores |
| §23 Regras arbitrárias | ×1,4, medo ×2, anti-FOMO ×0,4, perto de resultado ×0,5/0,8 espalhados no código | 🔧 cortes por alta recente e por resultado próximo removidos (viram risco explicado); o que restou está em `src/lib/analysis/params.ts`, documentado e marcado como provisório |
| §9 Bancos | qualidade de banco por dívida/patrimônio e ROIC | 🔧 bancos/seguradoras: ROE e crescimento (BR); sem dívida/liquidez/FCF (EUA); sem DCF de FCF; P/VP justificado pelo ROE como método central |
| §11 FIIs | mesmo modelo para tijolo e papel | 🔧 FII de papel não usa vacância/imóveis; qualidade fica "sem dados" até haver dados dos CRIs |
| §13 Aporte | linha com quanto/por quê/risco | 🔧 + alternativas consideradas e o que faria mudar |
| §22 Confiança | BR sempre "Média" | 🔧 BR: cai com divergência entre métodos; EUA: incerteza alta também quando os métodos divergem |
| §24 Score | "Score 65" na linha do aporte | 🔧 removido da linha; prioridade vem do valuation explicado |
| §2 Capital do ciclo | exterior usava US$ 550 fixo quando nada era informado; campo "Aporte padrão"; teto de US$ 1 milhão; "10.000" lido como 10 | 🔧 conceito **capital disponível neste ciclo** por carteira (`lib/data/cycleCapital.ts`): sempre o valor informado, sem padrão, piso, teto ou normalização; sem valor informado, o painel pede o valor em vez de supor; "10.000" = dez mil |

## Pendentes resolvidos

| Seção | Agora |
|---|---|
| §33 Auditoria | 🔧 cada cálculo de aporte (Brasil e exterior) grava data/hora, capital, preço observado, intervalo de valor, faixa, postura, peso, decisão, justificativa, confiança e riscos (`lib/data/audit.ts`); "Histórico das recomendações" no fim da página de aporte |
| §14 Realização | 🔧 o bloco de venda responde também "a posição ficou concentrada?" e "existe alternativa claramente melhor para o valor?" |
| §16 Tese | 🔧 campos separados "o que confirmaria a tese" e "o que invalidaria a tese" |
| §26 Avaliação histórica | 🔧 avaliação ponto-a-ponto, sem look-ahead, das faixas gravadas diariamente (30/90/180 dias) na Visão geral; histórico ampliado para ~400 dias. Os parâmetros só devem ser recalibrados quando a amostra estiver pronta |

## Teses-base (`docs/DASHINVEST_TESES_BASE.md`)

| Regra | Implementação |
|---|---|
| Tese é contexto, nunca gatilho | Tese intacta/em observação não muda a conta; postura continua vindo de qualidade + valuation + peso |
| 4 estados com evento | intacta · em observação · ameaçada · invalidada (`effectiveThesisState`), sempre com o evento e a origem (usuário ou dados) |
| Dados não invalidam sozinhos | sinais de deterioração levam no máximo a "ameaçada"; "invalidada" só por decisão do usuário |
| Ameaçada / invalidada | ameaçada segura novas compras até investigar; invalidada → avaliar saída (com posição) ou evitar (`applyThesisState`) |
| §7 campos por ativo | confirma, ameaça (editável), invalida, barato demais / caro demais (pelas faixas de valuation atuais), alternativas (ativos da mesma carteira em faixa de compra), o que monitorar, como valorar |
| Commodities (PETR4/VALE3) | sem Bazin (dividendo passado) e faixa de compra com margem de segurança maior |
| Carga | "Minhas teses → Carregar teses-base": 21 teses; não apaga nada, só completa campos vazios |
| Pendente | dados setoriais para confirmar premissas automaticamente (CET1, inadimplência, AUM, lifting cost, vacância por imóvel, CRIs) — fonte gratuita não traz; caminho: leitura de releases por evento |

## Já conforme

- §1/§4/§25 Não executa ordens; recomenda inclusive inação ("esperar", "não aumentar", caixa de oportunidade). ✅
- §5/§6 Brasil e Exterior como carteiras distintas, metas 50/25/25 e 50/20/20/10 editáveis. ✅
- §7 Qualidade ≠ preço: excelente+barato = alta; excelente+razoável = normal; excelente+caro = manter/menor aporte/realizar se extremo; ruim+barato = evitar. ✅
- §14 Realização: só com valuation extrema, alta não acompanhada por lucro, custos/impostos verificados; nunca 100%. ✅
- §15 Recompra: pelo preço em relação ao valor econômico, nunca por "caiu X%"; bloqueada com tese deteriorada ou analistas cortando. ✅
- §21 Freshness: idade real da cotação sempre exibida; decisão aceita até 4 dias (parâmetro `MAX_DECISION_AGE`). ✅
- §28 Tamanho: excelente e esticada recebe aporte menor; acima da meta não recebe. ✅
- §30 Notificações: cooldown, teto diário, agrupamento, linguagem sem "compre agora". ✅
- §31 Segurança: segredos só em variáveis de ambiente. ✅

## Pendente

| Seção | O que falta | Motivo / próximo passo |
|---|---|---|
| §9 Bancos | CET1, inadimplência/NPL, cobertura, eficiência | ⏳ não existem em fonte gratuita estruturada; caminho: leitura do release trimestral por IA, por evento |
| §11 FII de papel | LTV, rating, indexadores, inadimplência dos CRIs | ⏳ só no relatório gerencial (PDF); mesmo caminho acima |
