/** Linha "Classe · % · Ativos" — mesmo formato na estratégia Brasil e Internacional. */
export default function ClassRow({ name, nameField, pctField, pct, listField, list, listHint }: {
  name: string; nameField?: string; pctField?: string; pct?: number | null; listField?: string; list?: string; listHint?: string;
}) {
  return (
    <div className="class-row">
      {nameField ? <input name={nameField} defaultValue={name} aria-label="Nome da classe" placeholder="Nova classe" /> : <strong className="small">{name}</strong>}
      {pctField ? <label className="pct"><input name={pctField} inputMode="decimal" defaultValue={pct ?? ""} aria-label={`% ${name}`} placeholder="0" /><span>%</span></label> : <span />}
      {listField ? <input name={listField} defaultValue={list ?? ""} aria-label={`Ativos de ${name}`} placeholder="TICKER, TICKER" autoCapitalize="characters" /> : <span className="xsmall faint">{listHint}</span>}
    </div>
  );
}
