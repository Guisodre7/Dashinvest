import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { sendTest } from "@/lib/notify/service";

export const dynamic = "force-dynamic";

/** "Enviar notificação de teste": push real + registro no histórico. */
export async function POST() {
  const { user, reason } = await getSessionUser();
  if (!user || reason) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const devices = await sendTest(await getRepo(user.id));
    return NextResponse.json({ ok: true, devices });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 400 });
  }
}
