-- Add assigned_to column to whatsapp_conversations
ALTER TABLE whatsapp_conversations 
ADD COLUMN assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Create index for fast queries
CREATE INDEX idx_conversations_assigned_to ON whatsapp_conversations(assigned_to);

-- Create conversation_assignments table (assignment history)
CREATE TABLE public.conversation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  assigned_from uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE conversation_assignments ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can view assignments
CREATE POLICY "Authenticated users can view assignments"
  ON conversation_assignments FOR SELECT
  TO authenticated USING (true);

-- RLS: admins and supervisors can insert assignments
CREATE POLICY "Admins and supervisors can insert assignments"
  ON conversation_assignments FOR INSERT
  TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'supervisor')
  );

-- Create indexes
CREATE INDEX idx_assignments_conversation ON conversation_assignments(conversation_id);
CREATE INDEX idx_assignments_assigned_to ON conversation_assignments(assigned_to);