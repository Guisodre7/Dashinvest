"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { parseUserNumber } from "@/lib/userNumber";
import { getTheses, saveTheses } from "@/lib/data/theses";
import { BASE_THESES } from "@/lib/thesis/baseTheses";
import { reviewConclusion, THESIS_STATES, type PremiseStatus, type Thesis, type ThesisState } from "@/lib/thesis/logic";

type FormState = { ok: boolean; message: string | null };
const str = (v: FormDataEntryValue | null, max = 2000) => String(v ?? "").trim().slice(0, max) || null;
const lines = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 12).map((l) => l.slice(0, 300));
const num = (v: FormDataEntryValue | null) => { const n = parseUserNumber(v); return n !== null && n > 0 ? n : null; };

export async function createThesis(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const ticker = String(fd.get("ticker") ?? "").trim().toUpperCase();
  const market = fd.get("market") === "BR" ? "BR" : "US";
  if (!(market === "BR" ? /^[A-Z]{4}\d{1,2}$/ : /^[A-Z.]{1,10}$/).test(ticker)) return { ok: false, message: "Ativo inválido." };
  const text = str(fd.get("text"));
  if (!text || text.length < 10) return { ok: false, message: "Escreva a tese (por que você comprou ou quer comprar)." };
  const premises = lines(fd.get("premises"));
  if (!premises.length) return { ok: false, message: "Liste ao menos uma premissa (uma por linha) — é o que será revisado depois." };
  const band = str(fd.get("band"), 20) as Thesis["band"];
  const quality = str(fd.get("quality"), 20) as Thesis["quality"];
  const t: Thesis = {
    id: randomUUID(), market, ticker, created_at: new Date().toISOString(),
    price: num(fd.get("price")), quantity: num(fd.get("quantity")), band, quality,
    text, premises, expectation: str(fd.get("expectation"), 600), risks: lines(fd.get("risks")),
    changeMyMind: str(fd.get("change"), 600), confirms: str(fd.get("confirms"), 600), horizon: str(fd.get("horizon"), 60), status: "ativa", reviews: [],
  };
  const repo = await getRepo(user.id);
  await saveTheses(repo, [t, ...(await getTheses(repo))]);
  revalidatePath("/teses");
  redirect(`/teses/${t.id}`);
}

export async function reviewThesis(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const list = await getTheses(repo);
  const t = list.find((x) => x.id === fd.get("id"));
  if (!t) return { ok: false, message: "Tese não encontrada." };
  const allowed: PremiseStatus[] = ["mantida", "enfraquecida", "quebrada", "sem avaliação"];
  const statuses = t.premises.map((_, i) => { const v = String(fd.get(`p${i}`) ?? "sem avaliação") as PremiseStatus; return allowed.includes(v) ? v : "sem avaliação"; });
  const conclusion = reviewConclusion(statuses);
  t.reviews = [{ date: new Date().toISOString(), price: num(fd.get("price")), statuses, note: str(fd.get("note"), 1000), conclusion }, ...t.reviews].slice(0, 50);
  await saveTheses(repo, list);
  revalidatePath(`/teses/${t.id}`);
  return { ok: true, message: `Revisão salva: ${conclusion}.` };
}

export async function setThesisStatus(fd: FormData): Promise<void> {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const list = await getTheses(repo);
  const t = list.find((x) => x.id === fd.get("id"));
  if (!t) return;
  t.status = fd.get("status") === "encerrada" ? "encerrada" : "ativa";
  await saveTheses(repo, list);
  revalidatePath(`/teses/${t.id}`);
  revalidatePath("/teses");
}

/**
 * Carrega as teses-base (docs/DASHINVEST_TESES_BASE.md). Não apaga nada: tese ativa do mesmo
 * ativo recebe os campos da base que estiverem vazios (texto e revisões do usuário preservados);
 * ativo sem tese ganha uma nova.
 */
export async function importBaseTheses(_: FormState, _fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const list = await getTheses(repo);
  let created = 0, updated = 0;
  for (const b of BASE_THESES) {
    const t = list.find((x) => x.ticker === b.ticker && x.market === b.market && x.status === "ativa");
    if (t) {
      t.role ??= b.role;
      t.invalidates = t.invalidates?.length ? t.invalidates : b.invalidates;
      t.monitor = t.monitor?.length ? t.monitor : b.monitor;
      t.valuationApproach ??= b.valuationApproach;
      t.kind ??= b.kind;
      t.confirms ??= b.confirms.join("; ");
      if (!t.premises.length) t.premises = b.confirms;
      updated++;
    } else {
      list.unshift({
        id: randomUUID(), market: b.market, ticker: b.ticker, created_at: new Date().toISOString(),
        price: null, quantity: null, band: null, quality: null, text: b.text, premises: b.confirms,
        expectation: null, risks: [], changeMyMind: b.invalidates.join("; "), confirms: b.confirms.join("; "),
        horizon: b.horizon, status: "ativa", reviews: [], role: b.role, threatens: [], invalidates: b.invalidates,
        monitor: b.monitor, valuationApproach: b.valuationApproach, kind: b.kind, source: "base",
        state: "intacta", stateLog: [{ date: new Date().toISOString(), state: "intacta", reason: "tese-base carregada", by: "usuário" }],
      });
      created++;
    }
  }
  await saveTheses(repo, list);
  revalidatePath("/teses");
  return { ok: true, message: `Teses-base carregadas: ${created} nova(s), ${updated} complementada(s). Nada foi apagado.` };
}

/** Estado da tese definido pelo usuário — sempre com o evento que causou a mudança. */
export async function setThesisState(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const list = await getTheses(repo);
  const t = list.find((x) => x.id === fd.get("id"));
  if (!t) return { ok: false, message: "Tese não encontrada." };
  const state = String(fd.get("state") ?? "") as ThesisState;
  if (!THESIS_STATES.includes(state)) return { ok: false, message: "Estado inválido." };
  const reason = str(fd.get("reason"), 600);
  if (!reason) return { ok: false, message: "Explique o evento que motivou a mudança (ex.: resultado do 3T, fato relevante)." };
  t.state = state;
  t.stateLog = [{ date: new Date().toISOString(), state, reason, by: "usuário" as const }, ...(t.stateLog ?? [])].slice(0, 50);
  await saveTheses(repo, list);
  revalidatePath(`/teses/${t.id}`);
  revalidatePath("/teses");
  return { ok: true, message: `Estado da tese: ${state}.` };
}

/** Listas editáveis: o que ameaça e o que invalida (uma por linha). */
export async function saveThesisSignals(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const list = await getTheses(repo);
  const t = list.find((x) => x.id === fd.get("id"));
  if (!t) return { ok: false, message: "Tese não encontrada." };
  t.threatens = lines(fd.get("threatens"));
  t.invalidates = lines(fd.get("invalidates"));
  await saveTheses(repo, list);
  revalidatePath(`/teses/${t.id}`);
  return { ok: true, message: "Sinais da tese salvos." };
}
