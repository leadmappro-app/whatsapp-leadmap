-- Add audio transcription fields to whatsapp_messages table
ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS audio_transcription TEXT,
ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(20) DEFAULT NULL;

-- Create index for transcription status queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_transcription_status 
ON public.whatsapp_messages(transcription_status) 
WHERE transcription_status IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_messages.audio_transcription IS 'AI-generated transcription of audio messages';
COMMENT ON COLUMN public.whatsapp_messages.transcription_status IS 'Status of transcription: processing, completed, failed';