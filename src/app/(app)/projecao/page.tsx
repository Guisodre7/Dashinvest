import ProjectionClient from "@/components/projection/ProjectionClient";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { computeBundle, initialForm, loadPrefill } from "@/lib/projection/server";

export const metadata = { title: "Projeção Patrimonial — Carteira Internacional" };

export default async function ProjecaoPage() {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const [prefill, saved, runs] = await Promise.all([
    loadPrefill(repo),
    repo.getProjectionSettings().catch(() => null),
    repo.listProjectionRuns(10).catch(() => []),
  ]);
  const defaults = initialForm(null, prefill);
  const form = initialForm(saved, prefill);
  const bundle = computeBundle(form, prefill.currentSplit);

  const notes: string[] = [];
  if (prefill.strategicUsd !== null) {
    notes.push(`Carteira internacional atual: US$ ${prefill.strategicUsd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} (estratégica) + US$ ${(prefill.legacyUsd ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} em VOO (legado).`);
  } else if (prefill.missingPrices.length) {
    notes.push(`Sem cotação para ${prefill.missingPrices.join(", ")} — informe o patrimônio no exterior manualmente.`);
  }
  if (prefill.usdBrl) notes.push(`USD/BRL atual: ${prefill.usdBrl.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} (${prefill.usdBrlSource}).`);
  else notes.push("Câmbio atual indisponível — o USD/BRL inicial é uma premissa editável.");
  if (saved) notes.push("Premissas carregadas do seu cadastro salvo; os valores da carteira real não são atualizados automaticamente sobre premissas salvas.");

  return <ProjectionClient initialBundle={bundle} defaults={defaults} runs={runs} prefillNote={notes} hasSaved={!!saved} />;
}
