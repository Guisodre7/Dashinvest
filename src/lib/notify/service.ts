import "server-only";
import webpush from "web-push";
import type { SessionUser } from "../auth";
import { serverConfig } from "../config";
import { loadBrazil } from "../data/brazil";
import { loadBrStances } from "../data/brStances";
import { loadContext } from "../data/load";
import type { NotificationRow, Repo } from "../db/repo";
import { parseTaxSettings, usStances } from "../analysis/stanceInput";
import { LADDER_KEY, recordStanceHistory, TAX_KEY, type Ladders } from "../data/stances";
import { brCandidates, ladderCandidates, macroCandidates, stanceCandidates, TEST_CANDIDATE, usCandidates } from "./candidates";
import { decide, groupPushes, inQuietHours, parsePrefs, type Candidate, type Decision, type NotifyPrefs, type PushMessage } from "./rules";

export const PREFS_KEY = "notify_prefs";
export const STATUS_KEY = "notify_status";

export interface MonitorStatus {
  lastCheck: string | null;
  nextCheck: string | null;
  lastRun: { candidates: number; recorded: number; pushed: number; errors: number } | null;
}

export function pushConfigured() {
  return !!(serverConfig.vapidPublicKey && serverConfig.vapidPrivateKey && serverConfig.vapidSubject);
}

let vapidSet = false;
function ensureVapid() {
  if (!pushConfigured()) throw new Error("Notificações push não configuradas: faltam VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT na Vercel.");
  if (!vapidSet) {
    webpush.setVapidDetails(serverConfig.vapidSubject, serverConfig.vapidPublicKey, serverConfig.vapidPrivateKey);
    vapidSet = true;
  }
}

/** Próxima execução do agendamento (pg_cron): dias úteis, :07, das 12h às 22h UTC. */
export function nextCheck(now = new Date()): string {
  const d = new Date(now);
  d.setUTCSeconds(0, 0);
  for (let i = 0; i < 24 * 8; i++) {
    d.setUTCMinutes(7);
    if (d <= now) d.setUTCHours(d.getUTCHours() + 1);
    const wd = d.getUTCDay(), h = d.getUTCHours();
    if (d > now && wd >= 1 && wd <= 5 && h >= 12 && h <= 22) return d.toISOString();
    d.setUTCHours(d.getUTCHours() + 1);
  }
  return d.toISOString();
}

/** Push pronto para envio: `ids` são os ids das notificações na central. */
export type OutgoingPush = Omit<PushMessage, "ids"> & { ids: string[] };

/** Envia para todos os dispositivos ativos. Inscrições expiradas (404/410) são desativadas. */
export async function sendPush(repo: Repo, msgs: OutgoingPush[], badge: number): Promise<{ delivered: number; failed: number }> {
  if (!msgs.length) return { delivered: 0, failed: 0 };
  ensureVapid();
  const subs = await repo.listPushSubscriptions();
  let delivered = 0, failed = 0;
  for (const m of msgs) {
    let ok = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag, badge, ids: m.ids }),
          { TTL: 12 * 3600, urgency: "normal", timeout: 10_000 },
        );
        ok = true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await repo.markPushSubscription(s.endpoint, "revoked");
      }
    }
    if (ok) delivered++; else failed++;
  }
  return { delivered, failed };
}

function toRow(d: Decision): NotificationRow {
  return {
    category: d.category, priority: d.priority, market: d.market, ticker: d.ticker, title: d.title, body: d.body,
    reason: d.reason, url: d.url, dedupe_key: d.key, group_key: d.group_key, delivery: d.delivery,
    sent_at: d.delivery === "sent" ? new Date().toISOString() : null,
  };
}

/** Grava as decisões e envia os pushes; ids das notificações vão no payload (deep link + "aberta"). */
async function recordAndSend(repo: Repo, decisions: Decision[], prefs: NotifyPrefs, runId: string) {
  const msgs = groupPushes(decisions, prefs.hideValues, runId);
  const ids = await repo.addNotifications(decisions.map(toRow));
  const withIds: OutgoingPush[] = msgs.map((m) => ({ ...m, ids: m.ids.map((i) => ids[i]).filter(Boolean) }));
  const unread = await repo.countUnreadNotifications();
  const res = await sendPush(repo, withIds, unread).catch(() => ({ delivered: 0, failed: withIds.length }));
  if (res.failed && !res.delivered) {
    for (const m of withIds) for (const id of m.ids) await repo.updateNotification(id, { delivery: "failed", sent_at: null });
  }
  return res;
}

/**
 * Uma rodada do monitor: dados novos → candidatos → regras → central + push.
 * Chamado pelo agendamento (cron) com o repositório de serviço do dono.
 */
export async function runMonitor(repo: Repo, user: SessionUser, now = new Date()) {
  if (!(await repo.notifyReady())) return { ok: false, reason: "migração 0005 não aplicada" };
  const prefs = parsePrefs(await repo.getSetting(PREFS_KEY));
  const [ctx, br] = await Promise.all([loadContext(user, { repo }), loadBrazil(repo)]);
  const [transactions, rawTax, ladders] = await Promise.all([
    repo.getTransactions(1000).catch(() => []), repo.getSetting(TAX_KEY).catch(() => null), repo.getSetting<Ladders>(LADDER_KEY).catch(() => null),
  ]);
  const stances = usStances(ctx.analyses, ctx.portfolio, transactions, parseTaxSettings(rawTax), now);
  const prices = Object.fromEntries(ctx.analyses.map((a) => [a.ticker, a.price]));
  await recordStanceHistory(repo, stances, prices, now).catch(() => undefined);
  const brs = await loadBrStances(br, repo).catch(() => ({ views: [], errors: {} }));
  const candidates: Candidate[] = [
    ...usCandidates(ctx.analyses, now), ...stanceCandidates(stances, { market: "US" }),
    ...stanceCandidates(brs.views.map((v) => v.stance), { market: "BR", currency: "R$", url: (t) => `/brasil?aba=valuation#br-${t}`, opportunities: true }), ...ladderCandidates(ladders ?? {}, prices, {
      held: (t) => (ctx.portfolio.positions.find((x) => x.ticker === t)?.quantity ?? 0) > 0,
      lastSellDate: (t) => transactions.filter((x) => x.kind === "sell" && x.ticker === t).map((x) => x.trade_date).sort().pop() ?? null,
    }),
    ...brCandidates(br.summary), ...macroCandidates(ctx.macro),
  ];
  const history = await repo.notificationHistory(30);
  const decisions = decide(candidates, prefs, history, now);

  // Avisos guardados durante o silêncio: tocam na primeira rodada depois dele.
  let released = 0;
  if (prefs.pushEnabled && !inQuietHours(now, prefs.quiet)) {
    const since = new Date(now.getTime() - 12 * 3600_000).toISOString();
    const held = (await repo.listNotifications({ limit: 50, since })).filter((n) => n.delivery === "quiet" && !n.read_at);
    if (held.length) {
      const title = held.length === 1 ? held[0].title : `${held.length} avisos guardados durante o horário de silêncio`;
      const body = held.length === 1 && !prefs.hideValues ? held[0].body : held.slice(0, 4).map((n) => `• ${n.title}`).join("\n");
      const res = await sendPush(repo, [{ title, body, url: held.length === 1 ? held[0].url : "/notificacoes", tag: `quiet-${now.getTime()}`, ids: [] }], await repo.countUnreadNotifications()).catch(() => ({ delivered: 0, failed: 1 }));
      if (res.delivered) for (const n of held) await repo.updateNotification(n.id!, { delivery: "sent", sent_at: now.toISOString() });
      released = res.delivered ? held.length : 0;
    }
  }

  const res = decisions.length ? await recordAndSend(repo, decisions, prefs, String(now.getTime())) : { delivered: 0, failed: 0 };
  const status: MonitorStatus = {
    lastCheck: now.toISOString(), nextCheck: nextCheck(now),
    lastRun: { candidates: candidates.length, recorded: decisions.length, pushed: res.delivered + released, errors: ctx.errors.length },
  };
  await repo.setSetting(STATUS_KEY, status);
  return { ok: true, ...status.lastRun };
}

/** "Enviar notificação de teste": push real para os dispositivos + registro no histórico. */
export async function sendTest(repo: Repo) {
  const [id] = await repo.addNotifications([{ ...toRow({ ...TEST_CANDIDATE, key: `TEST:${Date.now()}`, delivery: "test", group_key: null }), sent_at: new Date().toISOString() }]);
  const subs = await repo.listPushSubscriptions();
  if (!subs.length) throw new Error("Nenhum dispositivo inscrito. Ative as notificações neste aparelho primeiro.");
  const res = await sendPush(repo, [{ title: TEST_CANDIDATE.title, body: TEST_CANDIDATE.body, url: "/notificacoes", tag: "test", ids: id ? [id] : [] }], await repo.countUnreadNotifications());
  if (!res.delivered) throw new Error("O serviço de push recusou o envio. Desative e ative as notificações de novo.");
  return subs.length;
}
