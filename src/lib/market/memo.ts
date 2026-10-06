/**
 * Cache curto em memória (por instância) para dados com horário: diferente do
 * cache de dados do Next, nunca entrega uma cópia vencida "uma última vez".
 * Erros não ficam guardados.
 */
const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn();
  store.set(key, { at: Date.now(), value });
  value.catch(() => { if (store.get(key)?.value === value) store.delete(key); });
  if (store.size > 500) store.delete(store.keys().next().value!);
  return value;
}
