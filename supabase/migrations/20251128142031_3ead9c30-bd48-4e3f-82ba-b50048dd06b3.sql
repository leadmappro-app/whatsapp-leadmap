-- 1. Adicionar campos de edição na tabela whatsapp_messages
ALTER TABLE whatsapp_messages 
ADD COLUMN edited_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN original_content TEXT DEFAULT NULL;

-- 2. Criar tabela para histórico completo de edições
CREATE TABLE whatsapp_message_edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id),
  previous_content TEXT NOT NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Índice para consultas rápidas
CREATE INDEX idx_message_edit_history_message_id 
ON whatsapp_message_edit_history(message_id);

-- 4. RLS para histórico de edições
ALTER TABLE whatsapp_message_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on edit history"
ON whatsapp_message_edit_history FOR ALL
USING (true) WITH CHECK (true);

-- 5. Habilitar realtime para a nova tabela
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_message_edit_history;