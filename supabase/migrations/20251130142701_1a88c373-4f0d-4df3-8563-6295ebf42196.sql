-- =============================================
-- Migration: Garantir Storage Buckets para Remix
-- =============================================

-- 1. Criar bucket whatsapp-media (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Criar bucket avatars (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Políticas RLS para whatsapp-media
DROP POLICY IF EXISTS "Allow authenticated uploads to whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from whatsapp-media" ON storage.objects;

CREATE POLICY "Allow authenticated uploads to whatsapp-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "Allow public read access to whatsapp-media"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'whatsapp-media');

CREATE POLICY "Allow authenticated deletes from whatsapp-media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'whatsapp-media');

-- 4. Políticas RLS para avatars
DROP POLICY IF EXISTS "Allow users to upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own avatar" ON storage.objects;

CREATE POLICY "Allow users to upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Allow public read access to avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Allow users to update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Allow users to delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);