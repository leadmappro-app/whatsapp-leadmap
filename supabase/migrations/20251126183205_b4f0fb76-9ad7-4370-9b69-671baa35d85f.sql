-- Create whatsapp_macros table
CREATE TABLE public.whatsapp_macros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  name text NOT NULL,
  shortcut text NOT NULL,
  content text NOT NULL,
  description text,
  category text DEFAULT 'geral',
  is_active boolean DEFAULT true,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique index for shortcuts per instance
CREATE UNIQUE INDEX idx_macros_instance_shortcut 
  ON whatsapp_macros(instance_id, shortcut) 
  WHERE is_active = true;

-- Create index for performance
CREATE INDEX idx_macros_active ON whatsapp_macros(is_active);
CREATE INDEX idx_macros_category ON whatsapp_macros(category);

-- Add trigger for updated_at
CREATE TRIGGER update_macros_updated_at
  BEFORE UPDATE ON whatsapp_macros
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE whatsapp_macros ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (consistent with project pattern)
CREATE POLICY "Allow all operations on macros"
  ON whatsapp_macros FOR ALL
  USING (true) WITH CHECK (true);