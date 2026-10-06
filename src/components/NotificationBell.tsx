"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { savePrefs } from "@/app/(app)/notificacoes/actions";
import { CATEGORY_META, type NotifyCategory, type NotifyPrefs } from "@/lib/notify/rules";

interface Status {
  ready: boolean;
  configured: boolean;
  publicKey: string | null;
  prefs: NotifyPrefs;
  status: { lastCheck: string | null; nextCheck: string | null } | null;
  unread: number;
  today: number;
}

type Support = "ok" | "ios-browser" | "unsupported";

function detectSupport(): Support {
  const w = window as Window & { navigator: Navigator & { standalone?: boolean } };
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || w.navigator.standalone === true;
  // No iPhone, push só existe no app aberto pela Tela de Início (iOS 16.4+).
  if (ios && !standalone) return "ios-browser";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "ok" : "unsupported";
}

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Navegador";
}

const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");

/** Sino de notificações no cabeçalho: estado, contador, ativação e configurações rápidas. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<Status | null>(null);
  const [support, setSupport] = useState<Support>("ok");
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "n/a">("n/a");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/status", { cache: "no-store" });
      if (!res.ok) return;
      const s = (await res.json()) as Status;
      setSt(s);
      const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      if (nav.setAppBadge) (s.unread > 0 ? nav.setAppBadge(s.unread) : nav.clearAppBadge?.())?.catch(() => undefined);
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    const sup = detectSupport();
    setSupport(sup);
    if (sup === "ok") {
      setPermission(Notification.permission);
      // Registra o service worker cedo: no toque, só falta pedir a permissão.
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscribed(!!sub))
        .catch(() => undefined);
    }
    void refresh();
    const id = setInterval(refresh, 120_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const active = !!st?.prefs.pushEnabled && subscribed && permission === "granted";

  /** Chamado direto no toque: o pedido de permissão precisa de um gesto do usuário. */
  async function enable() {
    if (!st?.publicKey) return;
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") throw new Error(perm === "denied" ? "Permissão negada. Libere nas configurações do aparelho (Ajustes → Notificações → DashInvest)." : "Permissão não concedida.");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(st.publicKey) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), device: deviceLabel() }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Falha ao registrar o dispositivo.");
      setSubscribed(true);
      setMsg({ ok: true, text: "Notificações ativas neste aparelho." });
      await refresh();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      // Erros do navegador (inglês, técnicos) viram uma explicação útil.
      const friendly = /registration failed|abort|push service|not allowed/i.test(raw)
        ? "O aparelho não conseguiu se registrar no serviço de notificações. Feche e abra o DashInvest pela Tela de Início e tente de novo."
        : raw || "Não foi possível ativar.";
      setMsg({ ok: false, text: friendly });
    } finally { setBusy(false); }
  }

  async function disableAll() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub?.endpoint, all: true }) });
      await sub?.unsubscribe();
      setSubscribed(false);
      setMsg({ ok: true, text: "Notificações desativadas em todos os aparelhos." });
      await refresh();
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; devices?: number };
      setMsg(body.ok ? { ok: true, text: `Teste enviado para ${body.devices} aparelho(s).` } : { ok: false, text: body.error ?? "Falha no envio." });
      await refresh();
    } finally { setBusy(false); }
  }

  async function update(patch: Partial<NotifyPrefs>) {
    if (!st) return;
    const prefs = await savePrefs(patch);
    setSt({ ...st, prefs });
  }

  const label = active ? "Notificações ativas" : "Notificações desligadas";
  return (
    <div className="bell" ref={box}>
      <button className={`bell-btn${active ? " is-on" : ""}`} aria-label={`${label}${st?.unread ? ` — ${st.unread} não lidas` : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {active && <span className="bell-live" aria-hidden="true" />}
        {!!st?.unread && <span className="bell-count">{st.unread > 99 ? "99+" : st.unread}</span>}
        <span className="bell-text">{active ? "Monitorando" : "Notificações"}</span>
      </button>

      {open && (
        <div className="bell-pop" role="dialog" aria-label="Notificações">
          <div className="row-between"><strong>NOTIFICAÇÕES</strong><Link href="/notificacoes" className="small" onClick={() => setOpen(false)}>Central{st?.unread ? ` (${st.unread})` : ""} →</Link></div>

          {st && !st.ready && <p className="small neg">Falta aplicar a migração 0005 no Supabase.</p>}
          {st && st.ready && !st.configured && <p className="small neg">Push não configurado no servidor: faltam as chaves VAPID na Vercel.</p>}

          <dl className="bell-stats">
            <dt>Status</dt><dd>{active ? "🟢 Ativas" : "⚪ Desligadas"}</dd>
            <dt>Última verificação</dt><dd>{hhmm(st?.status?.lastCheck)}</dd>
            <dt>Próxima verificação</dt><dd>{hhmm(st?.status?.nextCheck)}</dd>
            <dt>Notificações hoje</dt><dd>{st?.today ?? 0}</dd>
          </dl>

          {support === "ios-browser" && (
            <p className="small">No iPhone, as notificações funcionam no app instalado: abra o DashInvest pelo ícone da <strong>Tela de Início</strong> (Safari → Compartilhar → Adicionar à Tela de Início) e ative por lá.</p>
          )}
          {support === "unsupported" && <p className="small muted">Este navegador não suporta notificações push.</p>}

          {support === "ok" && !active && st?.ready && st.configured && (
            <>
              <p className="small">Ative as notificações para receber alertas importantes sobre sua carteira, oportunidades, mudanças de valuation, notícias e eventos relevantes.</p>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={enable}>{busy ? "Ativando…" : "Ativar notificações"}</button>
            </>
          )}

          {active && st && (
            <>
              <div className="row-wrap">
                <button className="btn btn-sm" disabled={busy} onClick={test}>Enviar notificação de teste</button>
                <button className="btn btn-sm" onClick={() => setShowSettings((v) => !v)}>{showSettings ? "Fechar configurações" : "Configurar alertas"}</button>
              </div>
              {showSettings && (
                <div className="bell-settings stack">
                  <fieldset>
                    <legend className="kpi-label">Categorias</legend>
                    {(Object.keys(CATEGORY_META) as NotifyCategory[]).map((k) => (
                      <label key={k} className="check">
                        <input type="checkbox" checked={st.prefs.categories[k]} disabled={!CATEGORY_META[k].available}
                          onChange={(e) => update({ categories: { ...st.prefs.categories, [k]: e.target.checked } })} />
                        {CATEGORY_META[k].emoji} {CATEGORY_META[k].label}{!CATEGORY_META[k].available && <span className="xsmall faint"> (próxima etapa)</span>}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset>
                    <legend className="kpi-label">Carteiras</legend>
                    <label className="check"><input type="checkbox" checked={st.prefs.markets.BR} onChange={(e) => update({ markets: { ...st.prefs.markets, BR: e.target.checked } })} /> 🇧🇷 Brasil</label>
                    <label className="check"><input type="checkbox" checked={st.prefs.markets.US} onChange={(e) => update({ markets: { ...st.prefs.markets, US: e.target.checked } })} /> 🇺🇸 Internacional</label>
                  </fieldset>
                  <fieldset>
                    <legend className="kpi-label">Horário de silêncio</legend>
                    <label className="check"><input type="checkbox" checked={st.prefs.quiet.enabled} onChange={(e) => update({ quiet: { ...st.prefs.quiet, enabled: e.target.checked } })} /> Ativo</label>
                    <div className="row">
                      <input type="time" aria-label="Início do silêncio" value={st.prefs.quiet.start} onChange={(e) => update({ quiet: { ...st.prefs.quiet, start: e.target.value } })} />
                      <span>–</span>
                      <input type="time" aria-label="Fim do silêncio" value={st.prefs.quiet.end} onChange={(e) => update({ quiet: { ...st.prefs.quiet, end: e.target.value } })} />
                    </div>
                    <label className="check"><input type="checkbox" checked={st.prefs.quiet.allowCritical} onChange={(e) => update({ quiet: { ...st.prefs.quiet, allowCritical: e.target.checked } })} /> Permitir alertas críticos no silêncio</label>
                  </fieldset>
                  <label className="check"><input type="checkbox" checked={st.prefs.hideValues} onChange={(e) => update({ hideValues: e.target.checked })} /> Ocultar valores na tela bloqueada</label>
                </div>
              )}
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={disableAll}>Desativar notificações</button>
            </>
          )}
          {msg && <p className={`small ${msg.ok ? "pos" : "neg"}`} role="status">{msg.text}</p>}
          <Link href="/notificacoes" className="btn btn-primary" onClick={() => setOpen(false)}>Abrir central de notificações{st?.unread ? ` (${st.unread} não lidas)` : ""}</Link>
        </div>
      )}
    </div>
  );
}
