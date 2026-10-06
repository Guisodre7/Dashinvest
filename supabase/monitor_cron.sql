-- =====================================================================
-- Agendamento GRATUITO do monitor de notificações (Supabase pg_cron).
-- O plano gratuito da Vercel só roda cron 1x/dia; aqui o próprio Supabase
-- chama o endpoint protegido a cada hora, só em dias úteis, 9h–19h de
-- Brasília (12h–22h UTC), cobrindo B3 e NYSE.
--
-- ANTES DE EXECUTAR, troque:
--   SEU-DOMINIO.vercel.app  → o domínio do DashInvest na Vercel
--   COLE_AQUI_O_CRON_SECRET → o mesmo valor de CRON_SECRET da Vercel
-- O segredo fica só no banco (tabela cron.job), nunca no código.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'dashinvest-monitor';

select cron.schedule(
  'dashinvest-monitor',
  '7 12-22 * * 1-5',
  $$
  select net.http_get(
    url := 'https://SEU-DOMINIO.vercel.app/api/cron/monitor',
    headers := jsonb_build_object('Authorization', 'Bearer COLE_AQUI_O_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
  $$
);

-- Conferir: select jobname, schedule, active from cron.job;
-- Últimas execuções: select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
