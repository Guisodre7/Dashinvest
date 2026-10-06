import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { explainChange, type Snap } from "@/lib/analysis/changes";
import { ACTION_META, BAND_META } from "@/lib/analysis/stance";
import { loadContext } from "@/lib/data/load";
import { HISTORY_KEY, loadStances, snapshotNear, type StanceHistory } from "@/lib/data/stances";

const fmt = (v: number | null, d = 2) => (v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));

export default async function MudancasPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await requireUser();
  const { d } = await searchParams;
  const days = [7, 30, 90].includes(Number(d)) ? Number(d) : 30;
  const ctx = await loadContext(user);
  const [{ stances }, hist] = await Promise.all([loadStances(ctx, ctx.repo), ctx.repo.getSetting<StanceHistory>(HISTORY_KEY).catch(() => null)]);
  const ref = hist ? snapshotNear(hist, days) : null;
  const price = (t: string) => ctx.analyses.find((a) => a.ticker === t)?.price ?? null;

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero">
        <div>
          <h1>O que mudou?</h1>
          <p className="muted small">Compara a análise de hoje com a anterior: preço, faixa de valuation, tese e postura — para entender a evolução da decisão, não só do preço.</p>
        </div>
      </section>
      <nav className="tabs section" aria-label="Período">
        {[7, 30, 90].map((n) => <Link key={n} href={`/mudancas?d=${n}`} aria-current={n === days ? "page" : undefined}>{n} dias</Link>)}
      </nav>
      {!ref ? (
        <div className="banner banner-warn section">O histórico de análises começa a ser gravado hoje (uma vez por dia, pelo monitor). A comparação aparece a partir de amanhã e fica completa depois de {days} dias.</div>
      ) : (
        <section className="section stack">
          <p className="xsmall faint">Comparando com {ref.date.split("-").reverse().join("/")}{Number(new Date(ref.date)) > Date.now() - days * 86_400_000 + 86_400_000 ? ` (histórico ainda menor que ${days} dias)` : ""}.</p>
          <ul className="m-list">
            {stances.map((s) => {
              const before = ref.snap[s.ticker] as Snap | undefined;
              const now: Snap = { p: price(s.ticker), b: s.band, q: s.quality, t: s.thesis, a: s.action, f: s.bands.length ? s.bands[2].low! / 0.95 : null };
              if (!before) return <li key={s.ticker} className="m-row"><strong>{s.ticker}</strong> <span className="xsmall faint">sem análise anterior registrada</span></li>;
              const c = explainChange(before, now);
              return (
                <li key={s.ticker} className={`m-row${c.changed ? " notif-item unread" : ""}`}>
                  <div className="row-between"><Link href={`/ativo/${encodeURIComponent(s.ticker)}#realizacao`} className="ticker">{s.ticker}</Link>{c.changed && <span className="badge">mudou</span>}</div>
                  <div className="grid grid-2 small" style={{ gap: 8 }}>
                    <div><div className="kpi-label">Antes</div>Preço US$ {fmt(before.p)} · {before.b ? BAND_META[before.b].label : "sem faixa"} · tese {before.t} · {ACTION_META[before.a].label}</div>
                    <div><div className="kpi-label">Hoje</div>Preço US$ {fmt(now.p)} · {now.b ? BAND_META[now.b].label : "sem faixa"} · tese {now.t} · {ACTION_META[now.a].label}</div>
                  </div>
                  <div className="small"><strong>Conclusão:</strong> {c.conclusion}</div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
