-- =============================================
-- Migration: Configurar Realtime para Tabelas
-- CRÍTICO para funcionalidades em tempo real
-- =============================================

-- 1. Configurar REPLICA IDENTITY FULL para capturar dados completos em updates
ALTER TABLE public.whatsapp_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_sentiment_analysis REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_instances REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_conversation_notes REPLICA IDENTITY FULL;

-- 2. Adicionar tabelas à publicação supabase_realtime (idempotente)
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