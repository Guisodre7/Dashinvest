import PasswordForms from "./PasswordForms";
import { requireUser } from "@/lib/auth";

export default async function ContaPage({ searchParams }: { searchParams: Promise<{ redefinir?: string }> }) {
  const user = await requireUser();
  const recovering = (await searchParams).redefinir === "1";
  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero"><div><div className="hero-title">Minha conta</div><h1>{user.email}</h1></div></section>
      <section className="section grid grid-2">
        <div className="card stack">
          <h3>Alterar senha</h3>
          {recovering && <div className="banner small">Link confirmado. Defina a nova senha abaixo — sem precisar da antiga.</div>}
          <PasswordForms recovering={recovering} />
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
