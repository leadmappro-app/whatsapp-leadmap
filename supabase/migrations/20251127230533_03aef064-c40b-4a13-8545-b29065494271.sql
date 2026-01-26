-- Create assignment_rules table for auto-assignment system
CREATE TABLE public.assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('fixed', 'round_robin')),
  
  -- For "fixed" rule: specific agent
  fixed_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- For "round_robin" rule: list of participating agents
  round_robin_agents UUID[] DEFAULT '{}',
  round_robin_last_index INT DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one active rule per instance
CREATE UNIQUE INDEX unique_active_rule_per_instance 
ON public.assignment_rules (instance_id) 
WHERE is_active = true;

-- RLS policies
ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on assignment_rules" 
ON public.assignment_rules
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_assignment_rules_updated_at
BEFORE UPDATE ON public.assignment_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();