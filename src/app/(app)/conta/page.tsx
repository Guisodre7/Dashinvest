import ActionForm from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { changePassword } from "./actions";

export default async function ContaPage() {
  const user = await requireUser();
  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero"><div><div className="hero-title">Minha conta</div><h1>{user.email}</h1></div></section>
      <section className="section grid grid-2">
        <div className="card stack">
          <h3>Alterar senha</h3>
          <ActionForm action={changePassword} submitLabel="Alterar senha" className="stack">
            <label>Senha atual<input name="current" type="password" autoComplete="current-password" required /></label>
            <label>Nova senha<input name="next" type="password" autoComplete="new-password" required minLength={12} /></label>
            <label>Confirmar nova senha<input name="confirm" type="password" autoComplete="new-password" required minLength={12} /></label>
            <p className="xsmall faint">Mínimo de 12 caracteres. A sessão atual continua aberta; o código do autenticador (MFA) segue igual.</p>
          </ActionForm>
        </div>
        <div className="card stack small">
          <h3>Segurança</h3>
          <p className="muted">Acesso protegido por senha + código do app autenticador (MFA). O painel nunca executa ordens na corretora.</p>
          <form action="/auth/signout" method="post"><button className="btn btn-sm">Sair desta conta</button></form>
        </div>
      </section>
    </div>
  );
}
