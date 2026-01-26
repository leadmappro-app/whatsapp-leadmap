-- Limpar URLs corrompidas com caracteres extras após ponto e vírgula
UPDATE whatsapp_messages 
SET media_url = SPLIT_PART(media_url, ';', 1)
WHERE media_url LIKE '%;%'
  AND message_type IN ('audio', 'video', 'image', 'document', 'sticker');

-- Resetar transcrições de áudios que foram transcritos com URLs corrompidas
UPDATE whatsapp_messages 
SET audio_transcription = NULL, 
    transcription_status = NULL
WHERE message_type = 'audio' 
  AND transcription_status = 'completed'
  AND (audio_transcription IS NULL OR audio_transcription = '');