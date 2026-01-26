-- Criar tabela para armazenar configurações do projeto
CREATE TABLE IF NOT EXISTS public.project_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Apenas admins podem acessar
ALTER TABLE public.project_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage project config"
ON public.project_config
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));