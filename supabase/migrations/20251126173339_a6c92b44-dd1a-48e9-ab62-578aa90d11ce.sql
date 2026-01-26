-- Fix security warnings: add search_path to functions

-- Drop trigger first, then function
DROP TRIGGER IF EXISTS sentiment_archive_trigger ON public.whatsapp_sentiment_analysis;
DROP FUNCTION IF EXISTS archive_sentiment_to_history();

-- Recreate function with search_path
CREATE OR REPLACE FUNCTION archive_sentiment_to_history()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.whatsapp_sentiment_history (
    conversation_id,
    contact_id,
    sentiment,
    confidence_score,
    summary,
    messages_analyzed,
    created_at
  ) VALUES (
    OLD.conversation_id,
    OLD.contact_id,
    OLD.sentiment,
    OLD.confidence_score,
    OLD.summary,
    OLD.messages_analyzed,
    OLD.created_at
  );
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER sentiment_archive_trigger
BEFORE UPDATE ON public.whatsapp_sentiment_analysis
FOR EACH ROW
EXECUTE FUNCTION archive_sentiment_to_history();

-- Drop triggers for update_updated_at_column
DROP TRIGGER IF EXISTS update_instances_updated_at ON public.whatsapp_instances;
DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.whatsapp_contacts;
DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.whatsapp_conversations;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Recreate function with search_path
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate triggers
CREATE TRIGGER update_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.whatsapp_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();