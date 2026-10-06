import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { parsePrefs } from "@/lib/notify/rules";
import { PREFS_KEY } from "@/lib/notify/service";

export const dynamic = "force-dynamic";

const Sub = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "endpoint inválido"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  device: z.string().max(80).optional(),
});

async function auth() {
  const { user, reason } = await getSessionUser();
  return user && !reason ? user : null;
}

/** Registra este dispositivo e liga o push nas preferências. */
export async function POST(request: NextRequest) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Sub.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "inscrição inválida" }, { status: 400 });
  const repo = await getRepo(user.id);
  if (!(await repo.notifyReady())) return NextResponse.json({ error: "Falta aplicar a migração 0005 no Supabase." }, { status: 409 });
  const s = parsed.data;
  await repo.savePushSubscription({ endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, device: s.device ?? null });
  const prefs = parsePrefs(await repo.getSetting(PREFS_KEY));
  if (!prefs.pushEnabled) await repo.setSetting(PREFS_KEY, { ...prefs, pushEnabled: true });
  return NextResponse.json({ ok: true });
}

/** Remove este dispositivo. `all=true` também desliga o push em todos. */
export async function DELETE(request: NextRequest) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string; all?: boolean };
  const repo = await getRepo(user.id);
  if (typeof body.endpoint === "string") await repo.removePushSubscription(body.endpoint);
  if (body.all) {
    for (const s of await repo.listPushSubscriptions()) await repo.removePushSubscription(s.endpoint);
    await repo.setSetting(PREFS_KEY, { ...parsePrefs(await repo.getSetting(PREFS_KEY)), pushEnabled: false });
  }
  return NextResponse.json({ ok: true });
}
