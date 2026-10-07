@AGENTS.md

# DashInvest — fonte de verdade

Leia `docs/DASHINVEST_MASTER_SPEC.md` antes de qualquer alteração. Ele define a filosofia, o perfil do
usuário, a arquitetura decisória e os critérios de análise. Não altere a lógica de investimento sem verificar
se a mudança está de acordo com essa especificação. Parâmetros de decisão ficam em
`src/lib/analysis/params.ts` (nunca números mágicos espalhados pelo código — spec §23).

@docs/DASHINVEST_MASTER_SPEC.md

Teses-base das carteiras (contexto qualitativo, nunca gatilho mecânico): `docs/DASHINVEST_TESES_BASE.md`,
carregadas no painel a partir de `src/lib/thesis/baseTheses.ts`.
