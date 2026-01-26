-- =============================================
-- Migration: Garantir Trigger on_auth_user_created
-- CRÍTICO para cadastro de novos usuários
-- =============================================

-- 1. Garantir função handle_new_user existe com versão atualizada
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_first_user boolean;
  _assigned_role app_role;
BEGIN
  -- Check if this is the first user
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _is_first_user;
  
  IF _is_first_user THEN
    _assigned_role := 'admin';
  ELSE
    _assigned_role := 'agent';
  END IF;

  -- Insert profile with conflict handling
  INSERT INTO public.profiles (id, full_name, email, is_active)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    true
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Insert role with conflict handling
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, _assigned_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN new;
END;
$$;

-- 2. Drop trigger se existir (idempotente)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Criar trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();