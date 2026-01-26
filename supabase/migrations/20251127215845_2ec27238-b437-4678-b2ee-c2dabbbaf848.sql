-- Add is_active and email columns to profiles table
ALTER TABLE profiles 
ADD COLUMN is_active boolean DEFAULT true NOT NULL,
ADD COLUMN email text;

-- Create index for filtering active users
CREATE INDEX idx_profiles_is_active ON profiles(is_active);

-- Update trigger to include email and is_active for new users
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

  INSERT INTO public.profiles (id, full_name, email, is_active)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    true
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, _assigned_role);
  
  RETURN new;
END;
$$;