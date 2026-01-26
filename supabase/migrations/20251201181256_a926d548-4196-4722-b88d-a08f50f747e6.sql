-- Adicionar coluna is_approved na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_approved boolean DEFAULT false;