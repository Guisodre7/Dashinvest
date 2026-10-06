# Carteira Internacional — Guilherme

Painel privado para acompanhar e analisar uma carteira internacional de longo prazo e distribuir o aporte mensal.
É um **analista pessoal de acompanhamento**, não um robô de trade: **nunca envia ordens**, nunca acessa a corretora e nunca guarda credenciais.

Stack: Next.js 16 (App Router, server actions) · Supabase (Postgres + Auth com MFA) · Vercel (hospedagem + cron) · TradingView Lightweight Charts.

## O que a primeira versão entrega

| Área | Onde |
|---|---|
| Autenticação: e-mail único autorizado + senha + **MFA TOTP obrigatório**, proxy de autenticação, RLS no banco, `noindex/noarchive` | `src/proxy.ts`, `src/lib/auth.ts`, `supabase/migrations` |
| Cadastro da carteira (posições, compras com preço médio e câmbio médio, dividendos x distribuições) | `/carteira` |
| Pesos-alvo editáveis (`portfolio_strategy`), VOO como **posição legada / Anchor** | `/estrategia` |
| Cotações com **freshness** (timestamp, source, data_age, market_status, is_realtime, is_delayed), status PRE-MARKET/OPEN/AFTER-HOURS/CLOSED, horário ET e local, atualização automática | `src/lib/market/*`, `LiveQuotes.tsx` |
| Patrimônio em USD/BRL, peso, desvio, retorno do ativo x cambial x total em BRL | `src/lib/portfolio/calc.ts` |
| Notícias com motor de impacto (CRITICAL/HIGH/MEDIUM/LOW, categoria, motivos) | `src/lib/analysis/news.ts` |
| Fundamentos, valuation vs histórico e vs crescimento, fair value (mín/médio/máx, ≥2 métodos), business quality | `src/lib/analysis/valuation.ts` |
| Estimativas + **histórico de revisões** (fornecedor ou histórico gravado no banco) | `src/lib/analysis/estimates.ts` |
| Detectores: 🟢 compressão de valuation, 🔴 deterioração da tese, anti-FOMO, regra de correção, mudança de tese, oportunidade | `src/lib/analysis/analyze.ts` |
| **Opportunity Score** (17 fatores com pesos configuráveis), data quality, confiança, zonas de acumulação A–D | `src/lib/analysis/analyze.ts` |
| **Motor de alocação** do aporte: COMPRAR / APORTE NORMAL / AGUARDAR, explicação humana, "Por que NÃO comprar?", caixa de oportunidade limitada | `src/lib/analysis/allocation.ts` |
| Página individual do ativo (gráfico com candles, volume, SMA20/50/200), módulos JEPQ/LQD/VNQ | `/ativo/[ticker]` |
| Alertas, painel macro com mecanismos de impacto por ativo, relatório mensal, snapshots diários | `/`, `/relatorio`, `/api/cron/daily` |

| **Simulador patrimonial**: cenários pessimista/moderado/otimista, projeção mensal, Brasil × exterior, classes (Growth, JEPQ, LQD, VNQ, VOO legado), dividendos, câmbio, comparadores, sensibilidade, stress test | `/projecao`, `src/lib/projection/*` |

A camada de IA (LLM resumindo dados estruturados) fica para a próxima fase. O motor atual é determinístico e cita as fontes em cada recomendação.

## Princípios implementados no código

- **Dado atrasado nunca aparece como realtime.** Com mercado aberto, uma cotação mais antiga que `MAX_MARKET_DATA_AGE` (30 s) ou vinda de fornecedor não-realtime **bloqueia** recomendações baseadas no preço: *"⚠️ Dados desatualizados — decisão de aporte temporariamente bloqueada."*
- **Não sabemos → "—".** Campos ausentes ficam `null` e aparecem como "indisponível" ou "—". Fair value com uma única estimativa, ou com estimativas que divergem mais de 80%, não é exibido (*"Os dados disponíveis são conflitantes"*).
- **Preço de pré e pós-mercado é sinalizado** (`session: EXTENDED`).
- **O sistema nunca vende.** Um ativo acima do peso é corrigido só pelos novos aportes. VOO não recebe aportes e nunca tem venda sugerida.
- **Consenso de analistas não é recomendação.** Mudanças no consenso pesam mais do que o nível.

## Simulador patrimonial (`/projecao`)

- **Motor** (`src/lib/projection/engine.ts`, funções puras testadas): simulação mês a mês com juros compostos, taxa mensal `(1 + anual)^(1/12) − 1`; aporte no início ou no fim do mês; divisão Brasil/exterior e entre as classes pelos pesos da Estratégia; câmbio `USD/BRL₀ × (1 + variação)^(t/12)`.
- **Retorno total × proventos**: a premissa de retorno é TOTAL. O yield é a parte paga como provento. Reinvestido, o provento volta ao ativo; não reinvestido, vira caixa em R$ (sem render). O mesmo dinheiro nunca é contado duas vezes.
- **Efeito cambial**: retorno dos ativos (US$) e efeito cambial são separados, tanto em % ponderado no tempo quanto em R$ (ganho dos ativos + ganho cambial = crescimento).
- **Comparadores**: comparador de aportes, Brasil × exterior (sem declarar estratégia "melhor"), sensibilidade (uma premissa por vez), "R$ 1.000 a mais" em 3, 5, 10 e 15 anos, e stress test (queda configurável, recuperação opcional, efeito de continuar aportando × pausar).
- **Monte Carlo**: estrutura preparada, sem exibição na interface nesta etapa. Ver `simulateMonteCarlo()` e `calculatePercentiles()`.
- **Server-side**: a página e as server actions recalculam tudo no servidor e validam o formulário com zod. Regras: aporte ≥ 0; horizonte de 1 a 600 meses; Brasil + exterior = 100%; pesos das classes = 100%; taxas entre −50% e 50% a.a.; câmbio > 0.
- **Banco** (`supabase/migrations/0002_projection.sql`): `projection_assumptions`, `projection_scenarios`, `projection_runs`, `projection_monthly_values` (NUMERIC + RLS).
- Os defaults são premissas editáveis, não expectativas de mercado. "Restaurar premissas padrão" apaga as premissas salvas.

## Leitura de comprovantes (Carteira → Registrar compra) — gratuita

- O botão **📷 Ler comprovante** aceita foto, print ou PDF. A leitura roda **no navegador**, sem API, sem custo e sem enviar a imagem a ninguém:
  - imagem → OCR com Tesseract.js (wasm, inglês + português) (`src/lib/ocr/localOcr.ts`);
  - PDF com texto → leitura direta via pdf.js; PDF escaneado → OCR da 1ª página;
  - também dá para **colar o texto** do e-mail ou da notificação da corretora.
- O texto vira campos por regras determinísticas (`src/lib/ocr/parseText.ts`):
  - formatos pt-BR e en-US, rótulos das corretoras, `10 BRK B @ 480.25`, `2,5 cotas de X a US$ Y`, datas por extenso;
  - depois passa pela validação (`src/lib/ocr/normalize.ts`), que confere quantidade × preço contra o valor, venda, moeda, data futura, câmbio e ativo não cadastrado. Nada é inventado.
- Os campos lidos ficam **destacados** para revisão. Nada é gravado sem o clique em "Confirmar e registrar compra".
- Os arquivos do motor (~16 MB, baixados uma vez e guardados em cache) são copiados para `public/ocr` por `scripts/copy-ocr-assets.mjs` antes do `dev`/`build`, e servidos pelo próprio site.
- Opcional: com `ANTHROPIC_API_KEY` configurada, aparece o botão "Tentar leitura com IA" quando a leitura local fica incompleta (`/api/ocr/trade`). Sem a chave, tudo funciona normalmente.

## Valuation, realização parcial e recompra (`/oportunidades`, `/mudancas`)

Princípio: separar **qualidade do ativo**, **valor (faixa de valuation)** e **preço pago**. Motor em `src/lib/analysis/stance.ts` (funções puras, testadas).

- **Faixas** relativas ao valor justo médio (intervalo, nunca número exato):
  - < 0,85: compra forte;
  - 0,85–0,95: atrativo;
  - 0,95–1,05: justo;
  - 1,05–1,25: esticado;
  - > 1,25: extremamente esticado.
  - O valor justo vem do fair value multi-fonte ou, sem ele, do múltiplo histórico (confiança menor). ETFs sem valor justo e ativos da B3 sem fundamentos ficam em "Aguardar dados".
- **Postura única** (a mesma em todas as telas e notificações), a partir de qualidade × faixa × tese × peso na carteira:
  - comprar, recompra, manter, manter/não aumentar;
  - realização parcial, reduzir;
  - evitar, sair da tese (avaliar), aguardar dados, legado.
  - Excelente + cara com peso pequeno = "não aumentar"; com peso acima da meta = realização **parcial** em faixa (nunca 100%), limitada para não ficar abaixo da meta.
  - Barata com qualidade fraca ou tese deteriorada = evitar.
  - Alta acompanhada por revisão de lucro ("justificada") × alta por expectativa.
- **Custos e impostos** configuráveis (US 15% Lei 14.754; ações BR 15% com isenção de R$ 20 mil/mês; FIIs 20%; confirmar regras vigentes): venda pequena ou ineficiente vira "manter sem aumentar".
- **Recompra**: após uma venda, faixas de recompra forte, normal e parcial (40/35/25% do vendido), aguardar, ainda esticado. Nunca com tese deteriorada.
- **Escada** (página do ativo): degraus de venda e de recompra com cenário completo; o monitor avisa quando o preço atinge um degrau (recompra só depois de uma venda posterior ao plano).
- **O que mudou?**: retrato diário de cada ativo em `app_settings.stance_history` (gravado pelo monitor). A comparação de 7/30/90 dias explica se mudou o preço, o valuation ou a tese.
- **Lucro de verdade × no papel**: lucro realizado (vendas) separado do não realizado, do custo histórico e do valor da posição.

## Notificações no iPhone (Web Push, gratuito)

"Monitorar muito, notificar pouco, explicar bem." Preço subindo ou caindo sozinho nunca gera push.

- **Fluxo**: sino no cabeçalho → permissão (só no toque) → `PushSubscription` → `/api/push/subscribe` → monitor (`/api/cron/monitor`) → regras → Web Push (VAPID) → `public/sw.js` mostra a notificação e abre a análise (deep link) → central `/notificacoes`.
- **Motor** (`src/lib/notify/rules.ts`, funções puras e testadas):
  - categorias com cooldown por estado (7 dias para valuation/oportunidade/carteira, 3 para tese/macro; notícias e resultados nunca repetem);
  - prioridade que sobe ignora o cooldown;
  - horário de silêncio 22h–07h (Brasília); críticos opcionais; o que fica guardado toca na primeira rodada depois;
  - teto de 6 pushes não críticos por dia;
  - mais de 2 alertas na mesma rodada viram um push só;
  - "ocultar valores na tela bloqueada" ligado por padrão.
- **Candidatos** (`src/lib/notify/candidates.ts`): sinais do motor de análise (oportunidade, anti-FOMO sem revisão de estimativas, tese, earnings em até 2 dias, peso máximo), revisão de EPS ≥ 6%, notícias de impacto alto/crítico das últimas 48h (texto separa FATO e INTERPRETAÇÃO), classe da carteira Brasil a ≥ 10 p.p. da meta, juros EUA ±0,5 p.p. e dólar ±5% no mês. Realização parcial e recompra entram com a camada de valuation.
- **Agendamento gratuito**: a Vercel Hobby só roda cron 1x/dia (21:45 UTC). O monitor de hora em hora roda pelo Supabase (`supabase/monitor_cron.sql`, `pg_cron` + `pg_net`), em dias úteis das 9h às 19h de Brasília.
- **iPhone**: requer iOS 16.4+ e o DashInvest aberto pelo ícone da Tela de Início. O contador do ícone (badge) é atualizado a cada push e ao abrir o app.
- Banco: `supabase/migrations/0005_notifications.sql` (`push_subscriptions`, `notifications`, RLS). Preferências e estado do monitor em `app_settings`.

## Navegação

- `loading.tsx` mostra um esqueleto imediatamente ao trocar de aba.
- Cache do roteador (`staleTimes.dynamic = 30s`): páginas visitadas reabrem na hora. Os preços continuam ao vivo via polling.
- Abrir ou recarregar o app sempre traz análise atual (no máximo 30 s). Só a troca de aba reaproveita a análise anterior em memória (até 10 min, com selo "atualizando…" e recarga automática). Qualquer gravação muda um cookie de versão dos dados, então nenhuma instância mostra posições anteriores a uma compra. O cálculo do aporte sempre usa dados novos.
- Patrimônio, L/P, retornos e pesos do painel são recalculados no navegador a cada cotação nova (`LivePortfolio.tsx`).
- Cotações com 5 s de cache compartilhado; cada cotação mantém o timestamp do fornecedor, e a idade exibida é real.
- Câmbio com 60 s de cache; juros (FRED) e histórico (Tiingo) com 6 h.

## Configuração

1. **Supabase**
   - Crie o projeto e rode `supabase/migrations/0001_init.sql`, `0002_projection.sql` e `0003_harden_functions.sql`, nessa ordem, no SQL Editor (ou use `supabase db push`).
   - Em *Authentication → Providers*, **desative novos cadastros (signups)**. Crie seu usuário com senha forte em *Authentication → Users*.
   - Depois rode `select public.bootstrap_owner('seu-email@exemplo.com');`. Isso autoriza o usuário e cria a estratégia inicial.
   - Em *Authentication → MFA*, habilite TOTP.
2. **Variáveis de ambiente**: copie `.env.example` para as variáveis do projeto na Vercel. `SUPABASE_SERVICE_ROLE_KEY`, `FINNHUB_API_KEY` e `ALPHA_VANTAGE_API_KEY` **nunca** levam o prefixo `NEXT_PUBLIC_`.
3. **Primeiro login**: senha → cadastro do app autenticador (QR code) → painel.
4. **Cron**: `vercel.json` agenda `/api/cron/daily` para 21:30 UTC em dias úteis. Esse job grava o snapshot da carteira, o histórico de estimativas e de analistas, e os alertas. Defina `CRON_SECRET` e `OWNER_USER_ID`.

### Fornecedores de dados (`MarketDataProvider`) — tudo gratuito

Todas as análises dependem apenas da interface `src/lib/market/provider.ts`. Para trocar de fornecedor, basta implementar essa interface.

| Dado | Fonte (plano gratuito) | Limite | Chave |
|---|---|---|---|
| Cotação US em tempo real, métricas fundamentais, consenso, surpresas de lucro, notícias, calendário de earnings | Finnhub | 60/min | `FINNHUB_API_KEY` |
| Histórico diário ajustado (5 anos) e proventos | Tiingo | ~1.000/dia | `TIINGO_API_KEY` |
| Câmbio USD/BRL | AwesomeAPI (intradiário) + Banco Central, SGS 1 (fechamento e variação em 1 mês) | — | sem chave |
| Treasury 10Y e Fed Funds | FRED (CSV público) | — | sem chave |
| Revisões de estimativas (30/90 dias), OVERVIEW complementar, perfil de ETF | Alpha Vantage | **25/dia** | `ALPHA_VANTAGE_API_KEY` |

- **Orçamento da Alpha Vantage**: cada resposta fica no cache compartilhado do servidor (Data Cache da Vercel) por 1 dia (estimativas), 3 dias (OVERVIEW) ou 7 dias (perfil de ETF, proventos). Respostas de erro ou de limite atingido nunca entram no cache. Uso típico: ~9 consultas/dia; sem a Tiingo, ~22/dia, porque o histórico também passa a vir da Alpha Vantage (só 100 pregões, sem ajuste).
- Endpoints premium da Finnhub (price-target, upgrade/downgrade, eps-estimate, candles) ficam indisponíveis. O campo aparece como "—"; nada é estimado no lugar.
- **Limitações honestas**: o VIX não está disponível nesses fornecedores e aparece como "Indisponível". S&P 500, Nasdaq, Dow e DXY são mostrados **via ETFs substitutos** (SPY/QQQ/DIA/UUP), identificados na tela. Duration, SEC yield e ratings do LQD e o P/FFO do VNQ aparecem como "indisponível no fornecedor atual".

## Desenvolvimento

```bash
npm install
npm test            # motor de análise, freshness, alocação
npm run typecheck
LOCAL_DEV_MODE=true MARKET_DATA_PROVIDER=demo npm run dev
```

`LOCAL_DEV_MODE` dispensa o Supabase e a autenticação e grava os dados em `.dev-data.json`. `MARKET_DATA_PROVIDER=demo` gera **dados sintéticos**, sinalizados com um aviso permanente na tela. Os dois são **recusados em produção**.

## Estrutura

```
src/lib/market/        fornecedores, freshness, status do mercado
src/lib/analysis/      indicadores, estimativas, valuation, notícias, detectores, score, alocação, macro, alertas
src/lib/portfolio/     cálculo da carteira (USD/BRL, FX), estratégia padrão
src/lib/projection/    simulador patrimonial (motor, validação, server)
src/lib/db/            repositório (Supabase com RLS / arquivo local)
src/app/(app)/         painel, ativo, carteira, estratégia, relatório
supabase/migrations/   schema completo + RLS + seed
tests/                 vitest
```
