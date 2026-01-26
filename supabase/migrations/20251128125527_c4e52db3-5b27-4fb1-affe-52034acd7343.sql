-- Create whatsapp_reactions table
CREATE TABLE public.whatsapp_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  reactor_jid TEXT NOT NULL,
  is_from_me BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_reactions_message_id ON public.whatsapp_reactions(message_id);
CREATE INDEX idx_reactions_conversation_id ON public.whatsapp_reactions(conversation_id);

-- Unique constraint: one reaction per message per reactor
CREATE UNIQUE INDEX unique_reaction_per_message 
ON public.whatsapp_reactions(message_id, reactor_jid);

-- Enable Row Level Security
ALTER TABLE public.whatsapp_reactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Allow all operations on reactions" 
ON public.whatsapp_reactions 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_reactions;