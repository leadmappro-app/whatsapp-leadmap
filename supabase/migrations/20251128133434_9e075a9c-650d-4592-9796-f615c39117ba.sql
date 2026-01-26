-- ============================================================
-- PARTE 1: Reativar Trigger de Histórico de Sentimento
-- ============================================================

CREATE TRIGGER archive_sentiment_before_update
  BEFORE UPDATE ON public.whatsapp_sentiment_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_sentiment_to_history();

-- ============================================================
-- PARTE 2: Criar Tabela de Histórico de Tópicos
-- ============================================================

CREATE TABLE public.whatsapp_topics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  topics TEXT[] NOT NULL,
  primary_topic TEXT,
  ai_confidence NUMERIC,
  ai_reasoning TEXT,
  categorization_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_topics_history_conversation 
  ON public.whatsapp_topics_history(conversation_id);
CREATE INDEX idx_topics_history_contact 
  ON public.whatsapp_topics_history(contact_id);
CREATE INDEX idx_topics_history_created 
  ON public.whatsapp_topics_history(created_at DESC);

-- RLS Policy
ALTER TABLE public.whatsapp_topics_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on topics history" 
  ON public.whatsapp_topics_history 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- ============================================================
-- PARTE 3: Criar Função de Arquivamento de Tópicos
-- ============================================================

CREATE OR REPLACE FUNCTION public.archive_topics_to_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_topics TEXT[];
  old_primary TEXT;
  old_confidence NUMERIC;
  old_reasoning TEXT;
  old_model TEXT;
  old_categorized_at TIMESTAMPTZ;
BEGIN
  -- Extrair dados antigos do metadata JSONB
  IF OLD.metadata ? 'topics' THEN
    old_topics := ARRAY(SELECT jsonb_array_elements_text(OLD.metadata->'topics'));
    old_primary := OLD.metadata->>'primary_topic';
    old_confidence := (OLD.metadata->>'ai_confidence')::NUMERIC;
    old_reasoning := OLD.metadata->>'ai_reasoning';
    old_model := OLD.metadata->>'categorization_model';
    old_categorized_at := (OLD.metadata->>'categorized_at')::TIMESTAMPTZ;
    
    -- Só arquivar se tinha tópicos anteriores
    IF array_length(old_topics, 1) > 0 THEN
      INSERT INTO public.whatsapp_topics_history (
        conversation_id,
        contact_id,
        topics,
        primary_topic,
        ai_confidence,
        ai_reasoning,
        categorization_model,
        created_at
      ) VALUES (
        OLD.id,
        OLD.contact_id,
        old_topics,
        old_primary,
        old_confidence,
        old_reasoning,
        old_model,
        COALESCE(old_categorized_at, OLD.updated_at)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================================
-- PARTE 4: Criar Trigger de Tópicos
-- ============================================================

CREATE TRIGGER archive_topics_before_update
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW
  WHEN (
    OLD.metadata->>'topics' IS NOT NULL 
    AND NEW.metadata->>'topics' IS DISTINCT FROM OLD.metadata->>'topics'
  )
  EXECUTE FUNCTION public.archive_topics_to_history();

-- ============================================================
-- PARTE 5: Habilitar Realtime
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_topics_history;