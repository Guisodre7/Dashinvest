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

## Configuração

1. **Supabase**
   - Crie o projeto e rode `supabase/migrations/0001_init.sql` e `0002_projection.sql`, nessa ordem, no SQL Editor (ou use `supabase db push`).
   - Em *Authentication → Providers*, **desative novos cadastros (signups)**. Crie seu usuário com senha forte em *Authentication → Users*.
   - Depois rode `select public.bootstrap_owner('seu-email@exemplo.com');`. Isso autoriza o usuário e cria a estratégia inicial.
   - Em *Authentication → MFA*, habilite TOTP.
2. **Variáveis de ambiente**: copie `.env.example` para as variáveis do projeto na Vercel. `SUPABASE_SERVICE_ROLE_KEY`, `FINNHUB_API_KEY` e `ALPHA_VANTAGE_API_KEY` **nunca** levam o prefixo `NEXT_PUBLIC_`.
3. **Primeiro login**: senha → cadastro do app autenticador (QR code) → painel.
4. **Cron**: `vercel.json` agenda `/api/cron/daily` para 21:30 UTC em dias úteis. Esse job grava o snapshot da carteira, o histórico de estimativas e de analistas, e os alertas. Defina `CRON_SECRET` e `OWNER_USER_ID`.

### Fornecedores de dados (`MarketDataProvider`)

Todas as análises dependem apenas da interface `src/lib/market/provider.ts`. Para trocar de fornecedor, basta implementar essa interface.

- **Finnhub**: cotações US em tempo real, métricas fundamentais, consenso mensal, notícias e calendário de earnings. Alguns endpoints (price-target, upgrade/downgrade, eps-estimate, bid/ask) exigem plano pago. Sem eles, o campo fica indisponível; nada é estimado no lugar.
- **Alpha Vantage**: histórico diário, OVERVIEW, `EARNINGS_ESTIMATES` (com as médias de 30 e 90 dias atrás, que alimentam as revisões), notícias com sentimento, dividendos, perfil de ETF, USD/BRL, Treasury 10Y e Fed Funds. O plano gratuito (25 req/dia) não é suficiente para 10 ativos: use plano pago.
- O modo `composite` usa a Finnhub para cotações e completa com a Alpha Vantage os campos que faltarem (a origem de cada campo fica registrada no `source`).
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
