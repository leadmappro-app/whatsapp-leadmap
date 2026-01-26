-- Resetar todas as transcrições que foram geradas com o método errado
UPDATE whatsapp_messages 
SET audio_transcription = NULL, 
    transcription_status = NULL
WHERE message_type = 'audio' 
  AND transcription_status = 'completed';