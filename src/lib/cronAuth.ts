import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { serverConfig } from "./config";

/** Endpoints agendados: exigem `Authorization: Bearer <CRON_SECRET>` (comparação em tempo constante). */
export function cronAuthorized(request: NextRequest): boolean {
  const secret = serverConfig.cronSecret;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? ""), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
