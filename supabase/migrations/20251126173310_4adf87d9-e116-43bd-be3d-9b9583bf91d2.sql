-- Create sentiment enum
CREATE TYPE public.sentiment_type AS ENUM ('positive', 'neutral', 'negative');

-- Create whatsapp_instances table
CREATE TABLE public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  instance_name VARCHAR(255) NOT NULL UNIQUE,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'disconnected',
  qr_code TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create whatsapp_contacts table
CREATE TABLE public.whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  profile_picture_url TEXT,
  is_group BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(instance_id, phone_number)
);

-- Create whatsapp_conversations table
CREATE TABLE public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'active',
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create whatsapp_messages table
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  remote_jid VARCHAR(255) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text',
  media_url TEXT,
  media_mimetype VARCHAR(100),
  is_from_me BOOLEAN DEFAULT false,
  status VARCHAR(50) DEFAULT 'sent',
  quoted_message_id VARCHAR(255),
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, message_id)
);

-- Create whatsapp_sentiment_analysis table
CREATE TABLE public.whatsapp_sentiment_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
  sentiment public.sentiment_type NOT NULL DEFAULT 'neutral',
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  summary TEXT,
  reasoning TEXT,
  messages_analyzed INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create whatsapp_sentiment_history table
CREATE TABLE public.whatsapp_sentiment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
  sentiment public.sentiment_type NOT NULL,
  confidence_score DECIMAL(3,2),
  summary TEXT,
  messages_analyzed INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sentiment_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sentiment_history ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for development
CREATE POLICY "Allow all operations on instances" ON public.whatsapp_instances FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on contacts" ON public.whatsapp_contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on conversations" ON public.whatsapp_conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on messages" ON public.whatsapp_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on sentiment" ON public.whatsapp_sentiment_analysis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on sentiment history" ON public.whatsapp_sentiment_history FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_contacts_instance ON public.whatsapp_contacts(instance_id);
CREATE INDEX idx_contacts_phone ON public.whatsapp_contacts(phone_number);
CREATE INDEX idx_conversations_instance ON public.whatsapp_conversations(instance_id);
CREATE INDEX idx_conversations_contact ON public.whatsapp_conversations(contact_id);
CREATE INDEX idx_messages_conversation ON public.whatsapp_messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON public.whatsapp_messages(timestamp DESC);
CREATE INDEX idx_sentiment_conversation ON public.whatsapp_sentiment_analysis(conversation_id);
CREATE INDEX idx_sentiment_contact ON public.whatsapp_sentiment_analysis(contact_id);
CREATE INDEX idx_sentiment_type ON public.whatsapp_sentiment_analysis(sentiment);

-- Create trigger function to archive old sentiment to history
CREATE OR REPLACE FUNCTION archive_sentiment_to_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Archive old sentiment data before update
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on sentiment analysis table
CREATE TRIGGER sentiment_archive_trigger
BEFORE UPDATE ON public.whatsapp_sentiment_analysis
FOR EACH ROW
EXECUTE FUNCTION archive_sentiment_to_history();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.whatsapp_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sentiment_analysis;

-- Create storage bucket for media
INSERT INTO storage.buckets (id, name, public) 
VALUES ('whatsapp-media', 'whatsapp-media', true);

-- Create storage policy for public read access
CREATE POLICY "Public read access for whatsapp media"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-media');

-- Create storage policy for authenticated uploads
CREATE POLICY "Allow uploads to whatsapp media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'whatsapp-media');