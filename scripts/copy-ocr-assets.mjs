// Copia os arquivos do OCR local (Tesseract.js) para public/ocr, para serem
// servidos pelo próprio site — sem CDN externo e sem enviar a imagem a ninguém.
// Executado automaticamente antes do build e do dev (package.json).
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "public", "ocr");
const nm = (...p) => path.join(root, "node_modules", ...p);

fs.mkdirSync(path.join(out, "core"), { recursive: true });
fs.mkdirSync(path.join(out, "lang"), { recursive: true });

fs.copyFileSync(nm("tesseract.js", "dist", "worker.min.js"), path.join(out, "worker.min.js"));
// Variantes LSTM do núcleo wasm (o Tesseract escolhe SIMD/relaxed-SIMD conforme o aparelho).
for (const f of fs.readdirSync(nm("tesseract.js-core"))) {
  if (/^tesseract-core.*lstm\.wasm\.js$/.test(f)) fs.copyFileSync(nm("tesseract.js-core", f), path.join(out, "core", f));
}
// Worker do pdf.js (leitura de notas em PDF no navegador).
fs.copyFileSync(nm("pdfjs-dist", "build", "pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));
for (const lang of ["eng", "por"]) {
  fs.copyFileSync(nm("@tesseract.js-data", lang, "4.0.0_best_int", `${lang}.traineddata.gz`), path.join(out, "lang", `${lang}.traineddata.gz`));
}
console.log("OCR assets →", path.relative(root, out));
