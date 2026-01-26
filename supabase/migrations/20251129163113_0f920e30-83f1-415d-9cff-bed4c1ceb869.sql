-- Migration de Idempotência Completa
-- Garante que todas as operações podem ser re-executadas sem erros

-- ============================================
-- 1. STORAGE BUCKETS - Garantir existência
-- ============================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. TRIGGERS - Drop e Recriar Idempotentes
-- ============================================

-- Triggers de Update Timestamp
DROP TRIGGER IF EXISTS update_instances_updated_at ON public.whatsapp_instances;
CREATE TRIGGER update_instances_updated_at
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.whatsapp_contacts;
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.whatsapp_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.whatsapp_conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Triggers de Arquivamento
DROP TRIGGER IF EXISTS archive_sentiment_before_update ON public.whatsapp_sentiment_analysis;
CREATE TRIGGER archive_sentiment_before_update
  BEFORE UPDATE ON public.whatsapp_sentiment_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_sentiment_to_history();

DROP TRIGGER IF EXISTS archive_topics_before_update ON public.whatsapp_conversations;
CREATE TRIGGER archive_topics_before_update
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_topics_to_history();

-- ============================================
-- 3. REALTIME PUBLICATIONS - Verificar antes de adicionar
-- ============================================

DO $$
BEGIN
  -- whatsapp_conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public'
    AND tablename = 'whatsapp_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
  END IF;

  -- whatsapp_messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public'
    AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  END IF;

  -- whatsapp_sentiment_analysis
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public'
    AND tablename = 'whatsapp_sentiment_analysis'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sentiment_analysis;
  END IF;

  -- whatsapp_instances
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public'
    AND tablename = 'whatsapp_instances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_instances;
  END IF;

  -- whatsapp_reactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public'
    AND tablename = 'whatsapp_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_reactions;
  END IF;

  -- whatsapp_conversation_notes
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public'
    AND tablename = 'whatsapp_conversation_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversation_notes;
  END IF;
END $$;

-- ============================================
-- 4. ÍNDICES - Criar apenas se não existirem
-- ============================================

DO $$
BEGIN
  -- Índices de whatsapp_contacts
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_contacts_instance') THEN
    CREATE INDEX idx_contacts_instance ON public.whatsapp_contacts(instance_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_contacts_phone') THEN
    CREATE INDEX idx_contacts_phone ON public.whatsapp_contacts(phone_number);
  END IF;

  -- Índices de whatsapp_conversations
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_conversations_contact') THEN
    CREATE INDEX idx_conversations_contact ON public.whatsapp_conversations(contact_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_conversations_instance') THEN
    CREATE INDEX idx_conversations_instance ON public.whatsapp_conversations(instance_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_conversations_assigned') THEN
    CREATE INDEX idx_conversations_assigned ON public.whatsapp_conversations(assigned_to);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_conversations_last_message') THEN
    CREATE INDEX idx_conversations_last_message ON public.whatsapp_conversations(last_message_at DESC);
  END IF;

  -- Índices de whatsapp_messages
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_conversation') THEN
    CREATE INDEX idx_messages_conversation ON public.whatsapp_messages(conversation_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_timestamp') THEN
    CREATE INDEX idx_messages_timestamp ON public.whatsapp_messages(timestamp DESC);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_message_id') THEN
    CREATE INDEX idx_messages_message_id ON public.whatsapp_messages(message_id);
  END IF;

  -- Índices de whatsapp_sentiment_analysis
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sentiment_conversation') THEN
    CREATE INDEX idx_sentiment_conversation ON public.whatsapp_sentiment_analysis(conversation_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sentiment_contact') THEN
    CREATE INDEX idx_sentiment_contact ON public.whatsapp_sentiment_analysis(contact_id);
  END IF;

  -- Índices de whatsapp_reactions
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_reactions_message') THEN
    CREATE INDEX idx_reactions_message ON public.whatsapp_reactions(message_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_reactions_conversation') THEN
    CREATE INDEX idx_reactions_conversation ON public.whatsapp_reactions(conversation_id);
  END IF;
END $$;