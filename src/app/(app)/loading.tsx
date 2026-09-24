/** Esqueleto exibido instantaneamente ao trocar de aba enquanto o servidor prepara a página. */
export default function Loading() {
  return (
    <div className="skeleton-page" aria-busy="true" aria-label="Carregando">
      <div className="sk sk-title" />
      <div className="sk sk-hero" />
      <div className="sk-grid">
        <div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" />
      </div>
      <div className="sk sk-block" />
      <div className="sk sk-block short" />
    </div>
  );
}
