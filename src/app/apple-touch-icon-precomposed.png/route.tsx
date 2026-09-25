import { ImageResponse } from "next/og";
import { AppIconMark } from "@/lib/appIcon";

/** Endereço padrão que o iOS procura ao "Adicionar à Tela de Início". */
export function GET() {
  return new ImageResponse(<AppIconMark size={180} />, {
    width: 180, height: 180,
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
