-- Add provider_type column to whatsapp_instances
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS provider_type TEXT NOT NULL DEFAULT 'self_hosted';

-- Add comment for documentation
COMMENT ON COLUMN public.whatsapp_instances.provider_type IS 'Type of Evolution API provider: self_hosted or cloud';