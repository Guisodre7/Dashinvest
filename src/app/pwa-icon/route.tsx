import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { AppIconMark } from "@/lib/appIcon";

/** Ícones PNG do manifest (192/512) para instalar na tela inicial. */
export function GET(request: NextRequest) {
  const s = request.nextUrl.searchParams.get("s") === "192" ? 192 : 512;
  return new ImageResponse(<AppIconMark size={s} />, {
    width: s, height: s,
    headers: { "Cache-Control": "public, max-age=604800, immutable" },
  });
}
