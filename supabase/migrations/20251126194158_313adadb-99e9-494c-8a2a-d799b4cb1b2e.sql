-- Create table for conversation summaries
CREATE TABLE whatsapp_conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_points JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  sentiment_at_time VARCHAR(20),
  messages_count INTEGER DEFAULT 0,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for summaries
CREATE INDEX idx_summaries_conversation ON whatsapp_conversation_summaries(conversation_id);
CREATE INDEX idx_summaries_created ON whatsapp_conversation_summaries(created_at DESC);

-- Enable RLS for summaries
ALTER TABLE whatsapp_conversation_summaries ENABLE ROW LEVEL SECURITY;

-- Create policy for summaries
CREATE POLICY "Allow all operations on summaries" 
ON whatsapp_conversation_summaries 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create table for conversation notes
CREATE TABLE whatsapp_conversation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for notes
CREATE INDEX idx_notes_conversation ON whatsapp_conversation_notes(conversation_id);
CREATE INDEX idx_notes_pinned ON whatsapp_conversation_notes(conversation_id, is_pinned DESC, created_at DESC);

-- Enable RLS for notes
ALTER TABLE whatsapp_conversation_notes ENABLE ROW LEVEL SECURITY;

-- Create policy for notes
CREATE POLICY "Allow all operations on notes" 
ON whatsapp_conversation_notes 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Add trigger for updated_at on notes
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON whatsapp_conversation_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();