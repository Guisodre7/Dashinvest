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
| §14 Realização | "existe alternativa claramente superior?" e concentração no patrimônio total | ⏳ hoje a venda olha só o próprio ativo; incluir comparação com as oportunidades da carteira |
| §26 Backtest | parâmetros de `params.ts` sem validação histórica | ⏳ o painel grava a postura diária de cada ativo; montar avaliação sem look-ahead após 6–12 meses de histórico |
| §33 Auditoria | recomendações do Brasil não são gravadas (só as do exterior) | ⏳ gravar cada cálculo de aporte BR com preço, valuation, decisão e confiança |
| §16 Tese | campo explícito "o que confirmaria a tese" | ⏳ hoje as premissas cumprem esse papel; separar quando as teses forem cadastradas |
| §2 Perfil | aporte de referência BR (R$ 2.500–3.000) não é usado como padrão | ⏳ usar como valor inicial do formulário do Brasil |
