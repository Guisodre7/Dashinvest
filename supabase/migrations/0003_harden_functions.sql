-- is_authorized_user() é usada pelas políticas RLS (papel authenticated).
-- Não precisa ser executável por visitantes anônimos.
revoke execute on function public.is_authorized_user() from public, anon;
grant execute on function public.is_authorized_user() to authenticated;
