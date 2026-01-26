-- =====================================================
-- FASE 1: Criar tabela separada para API Keys (secrets)
-- =====================================================

-- Criar tabela para armazenar API keys (acesso restrito)
CREATE TABLE public.whatsapp_instance_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  api_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(instance_id)
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_instance_secrets ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver/modificar secrets
CREATE POLICY "Only admins can manage secrets" ON whatsapp_instance_secrets
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Migrar dados existentes
INSERT INTO whatsapp_instance_secrets (instance_id, api_key, api_url)
SELECT id, api_key, api_url FROM whatsapp_instances;

-- Remover colunas sensíveis da tabela original
ALTER TABLE whatsapp_instances DROP COLUMN api_key;
ALTER TABLE whatsapp_instances DROP COLUMN api_url;

-- =====================================================
-- FASE 3: Criar função auxiliar para verificar acesso
-- =====================================================

-- Verifica se usuário pode acessar uma conversa
CREATE OR REPLACE FUNCTION public.can_access_conversation(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Admins e supervisors podem ver tudo
    SELECT 1 WHERE has_role(_user_id, 'admin'::app_role)
    UNION
    SELECT 1 WHERE has_role(_user_id, 'supervisor'::app_role)
    UNION
    -- Agentes só veem conversas atribuídas a eles
    SELECT 1 FROM whatsapp_conversations
    WHERE id = _conversation_id AND assigned_to = _user_id
    UNION
    -- Agentes também veem conversas não atribuídas (fila)
    SELECT 1 FROM whatsapp_conversations
    WHERE id = _conversation_id AND assigned_to IS NULL
  )
$$;

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_conversations
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on conversations" ON whatsapp_conversations;

CREATE POLICY "Users can view accessible conversations" ON whatsapp_conversations
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), id)
);

CREATE POLICY "Service can insert conversations" ON whatsapp_conversations
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE POLICY "Users can update accessible conversations" ON whatsapp_conversations
FOR UPDATE USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), id)
);

CREATE POLICY "Only admins can delete conversations" ON whatsapp_conversations
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_messages
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on messages" ON whatsapp_messages;

CREATE POLICY "Users can view messages of accessible conversations" ON whatsapp_messages
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
);

CREATE POLICY "Users can insert messages in accessible conversations" ON whatsapp_messages
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
);

CREATE POLICY "Users can update own recent messages" ON whatsapp_messages
FOR UPDATE USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id) AND
  is_from_me = true AND
  timestamp > (now() - interval '15 minutes')
);

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_contacts
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on contacts" ON whatsapp_contacts;

CREATE POLICY "Authenticated users can view contacts" ON whatsapp_contacts
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Supervisors can manage contacts" ON whatsapp_contacts
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_instances
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on instances" ON whatsapp_instances;

CREATE POLICY "Authenticated users can view instances" ON whatsapp_instances
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can manage instances" ON whatsapp_instances
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_conversation_notes
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on notes" ON whatsapp_conversation_notes;

CREATE POLICY "Users can manage notes on accessible conversations" ON whatsapp_conversation_notes
FOR ALL USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
)
WITH CHECK (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
);

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_sentiment_analysis
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on sentiment" ON whatsapp_sentiment_analysis;

CREATE POLICY "Users can view sentiment of accessible conversations" ON whatsapp_sentiment_analysis
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
);

CREATE POLICY "Service can manage sentiment" ON whatsapp_sentiment_analysis
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_sentiment_history
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on sentiment history" ON whatsapp_sentiment_history;

CREATE POLICY "Users can view sentiment history of accessible conversations" ON whatsapp_sentiment_history
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
);

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_conversation_summaries
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on summaries" ON whatsapp_conversation_summaries;

CREATE POLICY "Users can view summaries of accessible conversations" ON whatsapp_conversation_summaries
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
);

CREATE POLICY "Service can manage summaries" ON whatsapp_conversation_summaries
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_macros
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on macros" ON whatsapp_macros;

CREATE POLICY "Authenticated users can view macros" ON whatsapp_macros
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Supervisors can manage macros" ON whatsapp_macros
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

-- =====================================================
-- FASE 3: Atualizar RLS - assignment_rules
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on assignment_rules" ON assignment_rules;

CREATE POLICY "Admins and supervisors can manage rules" ON assignment_rules
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_reactions
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on reactions" ON whatsapp_reactions;

CREATE POLICY "Users can view reactions on accessible conversations" ON whatsapp_reactions
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
);

CREATE POLICY "Users can add reactions on accessible conversations" ON whatsapp_reactions
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
);

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_message_edit_history
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on edit history" ON whatsapp_message_edit_history;

CREATE POLICY "Users can view edit history of accessible conversations" ON whatsapp_message_edit_history
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
);

-- =====================================================
-- FASE 3: Atualizar RLS - whatsapp_topics_history
-- =====================================================

DROP POLICY IF EXISTS "Allow all operations on topics history" ON whatsapp_topics_history;

CREATE POLICY "Users can view topics history of accessible conversations" ON whatsapp_topics_history
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
);

-- =====================================================
-- FASE 3: Atualizar RLS - profiles
-- =====================================================

DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

CREATE POLICY "Authenticated users can view profiles" ON profiles
FOR SELECT USING (auth.uid() IS NOT NULL);

-- =====================================================
-- FASE 3: Atualizar RLS - conversation_assignments
-- =====================================================

DROP POLICY IF EXISTS "Authenticated users can view assignments" ON conversation_assignments;
DROP POLICY IF EXISTS "Admins and supervisors can insert assignments" ON conversation_assignments;

CREATE POLICY "Users can view assignments of accessible conversations" ON conversation_assignments
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  can_access_conversation(auth.uid(), conversation_id)
);

CREATE POLICY "Admins and supervisors can manage assignments" ON conversation_assignments
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role)
);