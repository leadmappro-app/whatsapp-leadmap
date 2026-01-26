-- Migration: Fix trigger and auto-repair users without profile/role
-- This migration ensures all remixes will work correctly

-- 1. Drop trigger if exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Recreate handle_new_user function with conflict handling
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

-- 3. Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Auto-repair: Create profiles for existing users without profile
INSERT INTO public.profiles (id, full_name, email, is_active)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  u.email,
  true
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- 5. Auto-repair: Assign admin role to first user without role
WITH first_user AS (
  SELECT u.id
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
  ORDER BY u.created_at ASC
  LIMIT 1
)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM first_user
ON CONFLICT (user_id, role) DO NOTHING;

-- 6. Auto-repair: Assign agent role to remaining users without role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'agent'::app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT (user_id, role) DO NOTHING;