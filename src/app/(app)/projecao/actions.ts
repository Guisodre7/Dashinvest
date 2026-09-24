"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { computeBundle, loadPrefill, type ProjectionBundle } from "@/lib/projection/server";
import { projectionFormSchema, toInput, toScenarioMap } from "@/lib/projection/settings";
import { simulateAll } from "@/lib/projection/engine";

export type ProjectionActionResult =
  | { ok: true; bundle: ProjectionBundle; message?: string }
  | { ok: false; errors: string[] };

/** Valida no servidor — nunca confia em cálculos enviados pelo navegador. */
function validate(raw: unknown) {
  const parsed = projectionFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "formulário"}: ${i.message}`) };
  }
  return { ok: true as const, form: parsed.data };
}

export async function runProjection(raw: unknown): Promise<ProjectionActionResult> {
  const user = await requireUser();
  const v = validate(raw);
  if (!v.ok) return v;
  const prefill = v.form.useCurrentAllocation ? await loadPrefill(await getRepo(user.id)) : null;
  return { ok: true, bundle: computeBundle(v.form, prefill?.currentSplit ?? null) };
}

export async function saveAssumptions(raw: unknown): Promise<ProjectionActionResult> {
  const user = await requireUser();
  const v = validate(raw);
  if (!v.ok) return v;
  const repo = await getRepo(user.id);
  try {
    await repo.saveProjectionSettings(v.form);
  } catch (err) {
    return { ok: false, errors: [`Não foi possível salvar: ${err instanceof Error ? err.message : "erro"}`] };
  }
  const prefill = v.form.useCurrentAllocation ? await loadPrefill(repo) : null;
  revalidatePath("/projecao");
  return { ok: true, bundle: computeBundle(v.form, prefill?.currentSplit ?? null), message: "Premissas salvas." };
}

export async function resetAssumptions(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  try {
    await (await getRepo(user.id)).deleteProjectionSettings();
  } catch (err) {
    return { ok: false, message: `Não foi possível restaurar: ${err instanceof Error ? err.message : "erro"}` };
  }
  revalidatePath("/projecao");
  return { ok: true, message: "Premissas padrão restauradas." };
}

/** Salva a simulação (resumo + série mensal) recalculando no servidor. */
export async function saveRun(raw: unknown, label: string | null): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const v = validate(raw);
  if (!v.ok) return { ok: false, message: v.errors.join(" ") };
  const repo = await getRepo(user.id);
  const prefill = v.form.useCurrentAllocation ? await loadPrefill(repo) : null;
  const results = simulateAll(toInput(v.form, prefill?.currentSplit ?? null), toScenarioMap(v.form));
  try {
    await repo.saveProjectionRun({ label: label?.trim().slice(0, 80) || null, form: v.form, results });
  } catch (err) {
    return { ok: false, message: `Não foi possível salvar a simulação: ${err instanceof Error ? err.message : "erro"}` };
  }
  revalidatePath("/projecao");
  return { ok: true, message: "Simulação salva." };
}
