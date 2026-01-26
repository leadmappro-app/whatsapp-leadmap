-- Add instance_id_external column for Evolution Cloud API
ALTER TABLE whatsapp_instances 
ADD COLUMN IF NOT EXISTS instance_id_external TEXT;

COMMENT ON COLUMN whatsapp_instances.instance_id_external IS 
'ID externo da instância usado pela Evolution Cloud API (UUID)';