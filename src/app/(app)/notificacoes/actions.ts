"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { parsePrefs, type NotifyPrefs } from "@/lib/notify/rules";
import { PREFS_KEY } from "@/lib/notify/service";

/** Salva preferências (validadas: valores inválidos voltam ao padrão). */
export async function savePrefs(prefs: Partial<NotifyPrefs>): Promise<NotifyPrefs> {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const merged = parsePrefs({ ...parsePrefs(await repo.getSetting(PREFS_KEY)), ...prefs });
  await repo.setSetting(PREFS_KEY, merged);
  return merged;
}

type Op = "read" | "unread" | "archive" | "unarchive" | "important" | "unimportant";

export async function updateNotification(fd: FormData): Promise<void> {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const id = String(fd.get("id") ?? "");
  const op = String(fd.get("op") ?? "") as Op;
  const now = new Date().toISOString();
  const patch = {
    read: { read_at: now }, unread: { read_at: null }, archive: { archived: true, read_at: now }, unarchive: { archived: false },
    important: { important: true }, unimportant: { important: false },
  }[op];
  if (!id || !patch) return;
  await repo.updateNotification(id, patch);
  revalidatePath("/notificacoes");
}

export async function markAllRead(): Promise<void> {
  const user = await requireUser();
  await (await getRepo(user.id)).markAllNotificationsRead();
  revalidatePath("/notificacoes");
}
