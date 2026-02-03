-- Add waba_id column to whatsapp_instances table
-- WhatsApp Business Account ID (WABA-ID) is different from Phone Number ID
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS waba_id VARCHAR(255);

COMMENT ON COLUMN public.whatsapp_instances.waba_id IS 'WhatsApp Business Account ID - required for UzAPI integration';
