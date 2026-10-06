"use client";
import type { OcrProgress } from "./localOcr";

/** Reduz fotos grandes (e converte HEIC quando o navegador consegue decodificar) para JPEG ≤ 2000px. */
export async function compressImage(file: File): Promise<Blob> {
  if (file.type === "application/pdf") return file;
  if (file.size < 1.2 * 1024 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

/** Foto, print ou PDF → texto, no próprio aparelho (gratuito, nada é enviado). */
export async function readDocumentText(file: File, onProgress?: OcrProgress): Promise<{ text: string; confidence: number }> {
  const { ocrImage, readPdf } = await import("./localOcr");
  return file.type === "application/pdf" ? readPdf(file, onProgress) : ocrImage(await compressImage(file), onProgress);
}
