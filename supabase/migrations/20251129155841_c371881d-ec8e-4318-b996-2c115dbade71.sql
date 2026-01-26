-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remover cron jobs antigos se existirem
DO $$
BEGIN
  PERFORM cron.unschedule('check-instances-status');
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('sync-contact-profiles-daily');
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Criar cron job para verificar status das instâncias (a cada 5 minutos)
SELECT cron.schedule(
  'check-instances-status',
  '*/5 * * * *',
  $$
  SELECT CASE 
    WHEN (SELECT value FROM public.project_config WHERE key = 'project_url') IS NOT NULL THEN
      net.http_post(
        url := (SELECT value FROM public.project_config WHERE key = 'project_url') 
               || '/functions/v1/check-instances-status',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.project_config WHERE key = 'anon_key')
        ),
        body := jsonb_build_object('time', now())
      )
    ELSE NULL
  END;
  $$
);

-- Criar cron job para sincronizar perfis de contatos (diariamente às 3h AM)
SELECT cron.schedule(
  'sync-contact-profiles-daily',
  '0 3 * * *',
  $$
  SELECT CASE 
    WHEN (SELECT value FROM public.project_config WHERE key = 'project_url') IS NOT NULL THEN
      net.http_post(
        url := (SELECT value FROM public.project_config WHERE key = 'project_url') 
               || '/functions/v1/sync-contact-profiles',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM public.project_config WHERE key = 'anon_key')
        ),
        body := jsonb_build_object('time', now())
      )
    ELSE NULL
  END;
  $$
);