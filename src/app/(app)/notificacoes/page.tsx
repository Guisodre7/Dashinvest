import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { CATEGORY_META, NEWS_LINK_PREFIX, PRIORITY_LABEL, TABS, type NotifyTab } from "@/lib/notify/rules";
import { markAllRead, updateNotification } from "./actions";

/** Separa o link da matéria (linha "🔗 Notícia completa (veículo): url") do texto. */
function splitNewsLink(body: string): { text: string; link: { source: string; href: string } | null } {
  const lines = body.split("\n");
  const i = lines.findIndex((l) => l.startsWith(NEWS_LINK_PREFIX));
  if (i < 0) return { text: body, link: null };
  const m = lines[i].match(/\(([^)]*)\):\s*(https?:\/\/\S+)\s*$/);
  lines.splice(i, 1);
  return { text: lines.join("\n"), link: m ? { source: m[1], href: m[2] } : null };
}

const DELIVERY: Record<string, string> = {
  sent: "enviada ao celular", quiet: "guardada (horário de silêncio)", in_app: "só na central", failed: "falha no envio", test: "teste",
};

export default async function NotificacoesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const { tab: rawTab } = await searchParams;
  const archived = rawTab === "arquivadas";
  const tab = (TABS.find((t) => t.key === rawTab)?.key ?? "todas") as NotifyTab;
  const ready = await repo.notifyReady();
  const all = ready ? await repo.listNotifications({ limit: 200, archived }) : [];
  const list = archived || tab === "todas" ? all : all.filter((n) => CATEGORY_META[n.category]?.tab === tab);
  const unread = all.filter((n) => !n.read_at).length;

  const Btn = ({ id, op, label }: { id: string; op: string; label: string }) => (
    <form action={updateNotification}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} /><button className="btn btn-sm">{label}</button></form>
  );

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero">
        <div>
          <h1>Notificações</h1>
          <p className="muted small">O que o monitor identificou como relevante. Preço subindo ou caindo sozinho não gera alerta; mudanças de valuation, tese, fundamentos, carteira e eventos, sim.</p>
        </div>
      </section>

      {!ready && <div className="banner banner-warn">Falta aplicar <code>supabase/migrations/0005_notifications.sql</code> no SQL Editor do Supabase.</div>}

      <section className="section stack">
        <nav className="tabs" aria-label="Filtros">
          {TABS.map((t) => <Link key={t.key} href={t.key === "todas" ? "/notificacoes" : `/notificacoes?tab=${t.key}`} aria-current={!archived && tab === t.key ? "page" : undefined}>{t.label}</Link>)}
          <Link href="/notificacoes?tab=arquivadas" aria-current={archived ? "page" : undefined}>Arquivadas</Link>
        </nav>
        {unread > 0 && !archived && <form action={markAllRead}><button className="btn btn-sm">Marcar todas como lidas ({unread})</button></form>}

        {list.length === 0 ? <p className="small faint">Nenhuma notificação aqui.</p> : (
          <ul className="m-list" aria-label="Notificações">
            {list.map((n) => {
              const meta = CATEGORY_META[n.category];
              return (
                <li key={n.id} className={`m-row notif-item${n.read_at ? "" : " unread"}`}>
                  <div className="m-row-top">
                    <div className="m-id">
                      <span className="ticker">{n.important ? "⭐ " : ""}{n.delivery === "test" ? "" : `${meta?.emoji} `}{n.title}</span>
                      <span className="xsmall faint">
                        {new Date(n.created_at!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {" · "}{meta?.label}{" · "}{PRIORITY_LABEL[n.priority]}{" · "}{DELIVERY[n.delivery] ?? n.delivery}{n.opened_at ? " · aberta" : ""}
                      </span>
                    </div>
                  </div>
                  {(() => {
                    const { text, link } = splitNewsLink(n.body);
                    return (
                      <>
                        <div className="m-row-sub small" style={{ whiteSpace: "pre-line" }}>{text}</div>
                        {link && <div className="m-row-sub small"><a href={link.href} target="_blank" rel="noopener noreferrer">Ler a notícia completa{link.source ? ` (${link.source})` : ""} ↗</a></div>}
                      </>
                    );
                  })()}
                  {n.reason && <div className="m-row-sub xsmall faint">Por que este alerta: {n.reason}</div>}
                  <div className="row-wrap" style={{ marginTop: 6 }}>
                    <Link href={n.url} className="btn btn-primary btn-sm">Abrir análise</Link>
                    <Btn id={n.id!} op={n.read_at ? "unread" : "read"} label={n.read_at ? "Marcar não lida" : "Marcar lida"} />
                    <Btn id={n.id!} op={n.important ? "unimportant" : "important"} label={n.important ? "Tirar importante" : "Importante"} />
                    <Btn id={n.id!} op={archived ? "unarchive" : "archive"} label={archived ? "Desarquivar" : "Arquivar"} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
