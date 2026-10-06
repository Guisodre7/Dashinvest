"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { parseUserNumber } from "@/lib/userNumber";

/** Meta da divisão Brasil × Exterior (0–100% Brasil). */
export async function saveSplitTarget(_: { ok: boolean; message: string | null }, fd: FormData) {
  const user = await requireUser();
  const v = parseUserNumber(fd.get("br_pct"));
  if (v === null || v < 0 || v > 100) return { ok: false, message: "Informe um percentual entre 0 e 100." };
  await (await getRepo(user.id)).setSetting("split_target", v);
  revalidatePath("/geral");
  return { ok: true, message: `Meta salva: ${v}% Brasil / ${100 - v}% exterior.` };
}
