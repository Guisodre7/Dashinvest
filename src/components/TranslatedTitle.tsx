import { translateToPt } from "@/lib/translate";

/**
 * Título de notícia em português (tradução automática gratuita). Renderizado dentro de
 * <Suspense> com o original como fallback: a página não espera a tradução, e se ela falhar
 * fica o original. O original aparece ao passar o mouse.
 */
export default async function TranslatedTitle({ text }: { text: string }) {
  const pt = await translateToPt(text);
  return pt && pt !== text ? <span title={`Original: ${text}`}>{pt}</span> : <>{text}</>;
}
