import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { extractTradeFromDocument, type ExtractInput } from "@/lib/ocr/extract";
import { normalizeTrade } from "@/lib/ocr/normalize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Limite da Vercel para o corpo da requisição é ~4,5 MB; o navegador já reduz as fotos.
const MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/**
 * Recebe o comprovante (imagem ou PDF), extrai os dados com IA e devolve um
 * RASCUNHO validado para o formulário "Registrar compra". Nada é gravado aqui
 * e o arquivo não é armazenado.
 */
export async function POST(request: NextRequest) {
  const { user, reason } = await getSessionUser();
  if (!user || reason) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }
  if (!file || file.size === 0) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo acima de 4 MB. Envie uma imagem menor ou um recorte da tela." }, { status: 413 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  let input: ExtractInput;
  if (file.type === "application/pdf") input = { type: "pdf", base64 };
  else if ((IMAGE_TYPES as readonly string[]).includes(file.type)) input = { type: "image", mediaType: file.type as (typeof IMAGE_TYPES)[number], base64 };
  else return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG, WEBP ou PDF." }, { status: 415 });

  const result = await extractTradeFromDocument(input);
  if (!result.ok) {
    const status = result.error.kind === "not_configured" ? 501 : result.error.kind === "api" ? 502 : 422;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  const repo = await getRepo(user.id);
  const known = (await repo.getAssets().catch(() => [])).map((a) => a.ticker);
  const normalized = normalizeTrade(result.raw, known);
  return NextResponse.json({ ...normalized, model: result.model }, { headers: { "Cache-Control": "private, no-store" } });
}
