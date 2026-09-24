"use client";
/**
 * OCR 100% local e gratuito: roda no navegador com Tesseract.js (wasm).
 * Os arquivos do motor e dos idiomas (inglês + português) são servidos pelo
 * próprio site em /ocr — a imagem nunca sai do aparelho.
 * PDFs com texto são lidos diretamente (pdf.js); PDFs escaneados passam pelo OCR.
 */
import type { Worker } from "tesseract.js";

export type OcrProgress = (label: string, fraction: number | null) => void;

let workerPromise: Promise<Worker> | null = null;

async function getWorker(onProgress?: OcrProgress): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import("tesseract.js");
      const base = `${window.location.origin}/ocr`;
      return createWorker(["eng", "por"], OEM.LSTM_ONLY, {
        workerPath: `${base}/worker.min.js`,
        corePath: `${base}/core`,
        langPath: `${base}/lang`,
        logger: (m) => {
          const label =
            m.status === "recognizing text" ? "Lendo o texto" :
            m.status.includes("load") || m.status.includes("initializ") ? "Preparando o leitor (1ª vez pode demorar)" : null;
          if (label) progressHandler?.(label, typeof m.progress === "number" ? m.progress : null);
        },
      });
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  progressHandler = onProgress ?? null;
  return workerPromise;
}

let progressHandler: OcrProgress | null = null;

export async function ocrImage(image: Blob | HTMLCanvasElement, onProgress?: OcrProgress): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(image);
  return { text: data.text, confidence: data.confidence };
}

/** Texto de um PDF: camada de texto quando existe; senão, OCR da 1ª página renderizada. */
export async function readPdf(file: Blob, onProgress?: OcrProgress): Promise<{ text: string; confidence: number; viaOcr: boolean }> {
  onProgress?.("Abrindo PDF", null);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/ocr/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Agrupa por linha (coordenada y) para manter rótulo e valor juntos.
    const lines = new Map<number, string[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      lines.set(y, [...(lines.get(y) ?? []), item.str]);
    }
    text += [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, parts]) => parts.join(" ")).join("\n") + "\n";
  }
  if (text.replace(/\s/g, "").length >= 40) return { text, confidence: 100, viaOcr: false };

  // PDF escaneado: renderiza a 1ª página e aplica OCR.
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
  const r = await ocrImage(canvas, onProgress);
  return { ...r, viaOcr: true };
}
