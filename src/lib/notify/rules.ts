/**
 * Motor de regras de notificação (funções puras).
 * Filosofia: MONITORAR MUITO, NOTIFICAR POUCO, EXPLICAR BEM.
 * Oscilação de preço sozinha nunca vira push; o que vira push é mudança
 * relevante (valuation, tese, fundamentos, carteira, evento).
 */

export type NotifyCategory =
  | "opportunity" | "valuation" | "realization" | "rebuy" | "news"
  | "thesis" | "portfolio" | "market" | "earnings" | "macro";
export type NotifyPriority = "critical" | "high" | "medium" | "info";
export type Delivery = "sent" | "quiet" | "in_app" | "failed" | "test";

export const CATEGORY_META: Record<NotifyCategory, { label: string; emoji: string; tab: NotifyTab; defaultOn: boolean; cooldownH: number; available: boolean }> = {
  opportunity: { label: "Oportunidade de compra", emoji: "🟢", tab: "compras", defaultOn: true, cooldownH: 7 * 24, available: true },
  valuation: { label: "Valuation esticado", emoji: "🟠", tab: "vendas", defaultOn: true, cooldownH: 7 * 24, available: true },
  realization: { label: "Possível realização", emoji: "🔴", tab: "vendas", defaultOn: true, cooldownH: 7 * 24, available: false },
  rebuy: { label: "Recompra", emoji: "🟢", tab: "compras", defaultOn: true, cooldownH: 7 * 24, available: false },
  news: { label: "Notícia relevante", emoji: "🔵", tab: "noticias", defaultOn: true, cooldownH: 0, available: true },
  thesis: { label: "Mudança de tese", emoji: "🟣", tab: "teses", defaultOn: true, cooldownH: 3 * 24, available: true },
  portfolio: { label: "Alerta de carteira", emoji: "🟡", tab: "carteira", defaultOn: true, cooldownH: 7 * 24, available: true },
  market: { label: "Atualização de mercado", emoji: "⚪", tab: "macro", defaultOn: false, cooldownH: 24, available: true },
  earnings: { label: "Resultado / earnings", emoji: "🟤", tab: "noticias", defaultOn: true, cooldownH: 0, available: true },
  macro: { label: "Mudança macro", emoji: "🟦", tab: "macro", defaultOn: true, cooldownH: 3 * 24, available: true },
};

export type NotifyTab = "todas" | "compras" | "vendas" | "noticias" | "carteira" | "macro" | "teses";
export const TABS: { key: NotifyTab; label: string }[] = [
  { key: "todas", label: "Todas" }, { key: "compras", label: "Compras" }, { key: "vendas", label: "Vendas" },
  { key: "noticias", label: "Notícias" }, { key: "carteira", label: "Carteira" }, { key: "macro", label: "Macro" }, { key: "teses", label: "Teses" },
];

export const PRIORITY_RANK: Record<NotifyPriority, number> = { critical: 3, high: 2, medium: 1, info: 0 };
export const PRIORITY_LABEL: Record<NotifyPriority, string> = { critical: "🔴 Crítica", high: "🟠 Alta", medium: "🟡 Média", info: "🔵 Informativa" };

export interface NotifyPrefs {
  /** Push ligado neste usuário (a central registra mesmo com push desligado). */
  pushEnabled: boolean;
  categories: Record<NotifyCategory, boolean>;
  markets: { BR: boolean; US: boolean };
  quiet: { enabled: boolean; start: string; end: string; allowCritical: boolean };
  /** Esconde valores (R$, %, posição) do texto que aparece na tela bloqueada. */
  hideValues: boolean;
  /** Teto de pushes não críticos por dia. */
  dailyLimit: number;
}

export const DEFAULT_PREFS: NotifyPrefs = {
  pushEnabled: false,
  categories: Object.fromEntries(Object.entries(CATEGORY_META).map(([k, m]) => [k, m.defaultOn])) as Record<NotifyCategory, boolean>,
  markets: { BR: true, US: true },
  quiet: { enabled: true, start: "22:00", end: "07:00", allowCritical: true },
  hideValues: true,
  dailyLimit: 6,
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function parsePrefs(raw: unknown): NotifyPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<NotifyPrefs>;
  const q = (r.quiet ?? {}) as Partial<NotifyPrefs["quiet"]>;
  return {
    pushEnabled: r.pushEnabled === true,
    categories: Object.fromEntries((Object.keys(CATEGORY_META) as NotifyCategory[]).map((k) => [k, typeof r.categories?.[k] === "boolean" ? r.categories[k] : CATEGORY_META[k].defaultOn])) as NotifyPrefs["categories"],
    markets: { BR: r.markets?.BR !== false, US: r.markets?.US !== false },
    quiet: {
      enabled: q.enabled !== false,
      start: typeof q.start === "string" && HHMM.test(q.start) ? q.start : DEFAULT_PREFS.quiet.start,
      end: typeof q.end === "string" && HHMM.test(q.end) ? q.end : DEFAULT_PREFS.quiet.end,
      allowCritical: q.allowCritical !== false,
    },
    hideValues: r.hideValues !== false,
    dailyLimit: Number.isInteger(r.dailyLimit) && r.dailyLimit! >= 1 && r.dailyLimit! <= 30 ? r.dailyLimit! : DEFAULT_PREFS.dailyLimit,
  };
}

/** Uma possível notificação produzida pelo monitor. */
export interface Candidate {
  category: NotifyCategory;
  priority: NotifyPriority;
  market: "BR" | "US" | null;
  ticker: string | null;
  title: string;
  /** Texto completo (central de notificações, dentro do app). */
  body: string;
  /** Versão sem valores para a tela bloqueada (hideValues). */
  publicBody?: string;
  /** Por que o alerta existe (regra que disparou). */
  reason: string;
  url: string;
  /** Mesmo estado = mesma chave (sem data): a repetição é controlada pelo cooldown. */
  key: string;
}

export interface SentRecord {
  dedupe_key: string;
  category: NotifyCategory;
  priority: NotifyPriority;
  ticker: string | null;
  delivery: Delivery;
  created_at: string;
}

export interface Decision extends Candidate {
  delivery: Delivery;
  group_key: string | null;
}

/** Hora e minuto em Brasília. */
export function localMinutes(now: Date, timeZone = "America/Sao_Paulo"): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function inQuietHours(now: Date, quiet: NotifyPrefs["quiet"]): boolean {
  if (!quiet.enabled) return false;
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const t = localMinutes(now), a = toMin(quiet.start), b = toMin(quiet.end);
  return a === b ? false : a < b ? t >= a && t < b : t >= a || t < b;
}

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/**
 * Decide o que fazer com cada candidato:
 *  - categoria/mercado desligados → descartado;
 *  - mesmo estado já avisado dentro do cooldown → descartado, salvo se a prioridade SUBIU (mudança material);
 *  - horário de silêncio → fica na central ("quiet") e não toca, exceto crítico (se permitido);
 *  - push desligado → só na central ("in_app");
 *  - teto diário de pushes não críticos → excedente só na central.
 */
export function decide(candidates: Candidate[], prefs: NotifyPrefs, history: SentRecord[], now = new Date()): Decision[] {
  const seen = new Set<string>();
  const quiet = inQuietHours(now, prefs.quiet);
  const today = dayKey(now);
  let pushedToday = history.filter((h) => h.delivery === "sent" && h.priority !== "critical" && dayKey(new Date(h.created_at)) === today).length;

  const sorted = [...candidates].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  const out: Decision[] = [];
  for (const c of sorted) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    if (!prefs.categories[c.category] || !CATEGORY_META[c.category].available) continue;
    if (c.market && !prefs.markets[c.market]) continue;

    const last = history.filter((h) => h.dedupe_key === c.key).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (last) {
      const cooldownH = CATEGORY_META[c.category].cooldownH;
      const ageH = (now.getTime() - new Date(last.created_at).getTime()) / 3_600_000;
      const escalated = PRIORITY_RANK[c.priority] > PRIORITY_RANK[last.priority];
      // cooldown 0 = evento único (notícia, resultado): a chave já identifica o evento.
      if (!escalated && (cooldownH === 0 || ageH < cooldownH)) continue;
    }

    let delivery: Delivery = "sent";
    if (!prefs.pushEnabled) delivery = "in_app";
    else if (quiet && !(c.priority === "critical" && prefs.quiet.allowCritical)) delivery = "quiet";
    else if (c.priority === "info") delivery = "in_app";
    else if (c.priority !== "critical" && pushedToday >= prefs.dailyLimit) delivery = "in_app";
    if (delivery === "sent" && c.priority !== "critical") pushedToday++;
    out.push({ ...c, delivery, group_key: null });
  }
  return out;
}

export interface PushMessage { title: string; body: string; url: string; tag: string; ids: number[] }

/**
 * Agrupa os pushes de uma rodada: até 2 saem individualmente; acima disso,
 * um único push resume tudo (cada item continua separado na central).
 */
export function groupPushes(decisions: Decision[], hideValues: boolean, runId: string): PushMessage[] {
  const idx = decisions.map((d, i) => [d, i] as const).filter(([d]) => d.delivery === "sent");
  const text = (d: Decision) => (hideValues && d.publicBody ? d.publicBody : d.body);
  if (idx.length <= 2) {
    return idx.map(([d, i]) => ({ title: `${CATEGORY_META[d.category].emoji} ${d.title}`, body: text(d), url: d.url, tag: d.key, ids: [i] }));
  }
  const critical = idx.filter(([d]) => d.priority === "critical");
  const rest = idx.filter(([d]) => d.priority !== "critical");
  const out: PushMessage[] = critical.map(([d, i]) => ({ title: `${CATEGORY_META[d.category].emoji} ${d.title}`, body: text(d), url: d.url, tag: d.key, ids: [i] }));
  if (rest.length) {
    const markets = new Set(rest.map(([d]) => d.market));
    const flag = markets.size === 1 && markets.has("BR") ? "🇧🇷 " : markets.size === 1 && markets.has("US") ? "🇺🇸 " : "";
    const lines = rest.slice(0, 4).map(([d]) => `• ${d.title}`);
    if (rest.length > 4) lines.push(`• +${rest.length - 4} na central`);
    const group = `grp-${runId}`;
    for (const [d] of rest) d.group_key = group;
    out.push({ title: `${flag}${rest.length} atualizações importantes na carteira`, body: lines.join("\n"), url: "/notificacoes", tag: group, ids: rest.map(([, i]) => i) });
  }
  return out;
}
