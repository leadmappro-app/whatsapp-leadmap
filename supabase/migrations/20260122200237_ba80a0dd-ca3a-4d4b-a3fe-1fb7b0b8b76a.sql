-- The whatsapp_instances table already has provider_type column with default 'self_hosted'
-- We need to ensure the column can accept 'mock' as a value (which it already can since it's TEXT)
-- No schema change needed for the column itself

-- Add a comment to document the valid provider types
COMMENT ON COLUMN public.whatsapp_instances.provider_type IS 'Valid values: self_hosted, cloud, mock. Use mock for testing without external API.';