-- =============================================
-- Migration: Consolidação Final para Remix
-- Garante 100% de funcionamento em novos remixes
-- =============================================

-- 1. ENUM app_role (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
  END IF;
END $$;

-- 2. ENUM sentiment_type (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sentiment_type') THEN
    CREATE TYPE public.sentiment_type AS ENUM ('positive', 'neutral', 'negative');
  END IF;
END $$;

-- 3. Garantir tabelas críticas existem
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name text NOT NULL,
  avatar_url text,
  email text,
  status text DEFAULT 'online',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'agent',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS public.project_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_instance_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL UNIQUE,
  api_key text NOT NULL,
  api_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_macros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  shortcut text NOT NULL,
  content text NOT NULL,
  description text,
  category text DEFAULT 'geral',
  instance_id uuid,
  is_active boolean DEFAULT true,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  content text NOT NULL,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  summary text NOT NULL,
  key_points jsonb DEFAULT '[]',
  action_items jsonb DEFAULT '[]',
  sentiment_at_time varchar,
  messages_count integer DEFAULT 0,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  message_id text NOT NULL,
  emoji text NOT NULL,
  reactor_jid text NOT NULL,
  is_from_me boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_message_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  message_id text NOT NULL,
  previous_content text NOT NULL,
  edited_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_topics_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  topics text[] NOT NULL,
  primary_topic text,
  ai_confidence numeric,
  ai_reasoning text,
  categorization_model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_sentiment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  sentiment sentiment_type NOT NULL,
  confidence_score numeric,
  summary text,
  messages_analyzed integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  assigned_to uuid NOT NULL,
  assigned_from uuid,
  assigned_by uuid,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rule_type text NOT NULL,
  instance_id uuid,
  fixed_agent_id uuid,
  round_robin_agents uuid[] DEFAULT '{}',
  round_robin_last_index integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Adicionar colunas com IF NOT EXISTS
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id);

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS edited_at timestamptz,
ADD COLUMN IF NOT EXISTS original_content text;

-- 5. Migração segura de secrets (se colunas antigas existirem)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'whatsapp_instances' 
    AND column_name = 'api_key'
  ) THEN
    INSERT INTO public.whatsapp_instance_secrets (instance_id, api_key, api_url)
    SELECT id, api_key, api_url 
    FROM public.whatsapp_instances
    WHERE api_key IS NOT NULL
    ON CONFLICT (instance_id) DO NOTHING;
    
    ALTER TABLE public.whatsapp_instances DROP COLUMN IF EXISTS api_key;
    ALTER TABLE public.whatsapp_instances DROP COLUMN IF EXISTS api_url;
  END IF;
END $$;

-- 6. Políticas RLS (DROP + CREATE para idempotência)

-- project_config
DROP POLICY IF EXISTS "Only admins can manage project config" ON public.project_config;
CREATE POLICY "Only admins can manage project config" ON public.project_config
FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- profiles - admin update
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 7. Triggers (DROP + CREATE para idempotência)

-- Macros
DROP TRIGGER IF EXISTS update_macros_updated_at ON public.whatsapp_macros;
CREATE TRIGGER update_macros_updated_at
  BEFORE UPDATE ON public.whatsapp_macros
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notes
DROP TRIGGER IF EXISTS update_notes_updated_at ON public.whatsapp_conversation_notes;
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.whatsapp_conversation_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Assignment rules
DROP TRIGGER IF EXISTS update_assignment_rules_updated_at ON public.assignment_rules;
CREATE TRIGGER update_assignment_rules_updated_at
  BEFORE UPDATE ON public.assignment_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Auto-repair: Criar profiles/roles para usuários existentes sem profile
DO $$
DECLARE
  _user RECORD;
  _is_first BOOLEAN;
BEGIN
  -- Verificar se é o primeiro usuário
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) INTO _is_first;
  
  -- Para cada usuário em auth.users sem profile
  FOR _user IN 
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
  LOOP
    -- Criar profile
    INSERT INTO public.profiles (id, full_name, email, is_active)
    VALUES (
      _user.id,
      COALESCE(_user.raw_user_meta_data->>'full_name', split_part(_user.email, '@', 1)),
      _user.email,
      true
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Atribuir role (admin se primeiro, agent senão)
    IF _is_first THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (_user.id, 'admin'::app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
      
      _is_first := false; -- Próximos serão agents
    ELSE
      INSERT INTO public.user_roles (user_id, role)
      VALUES (_user.id, 'agent'::app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END LOOP;
END $$;