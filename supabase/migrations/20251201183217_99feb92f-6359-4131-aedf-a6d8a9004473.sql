-- Atualizar função handle_new_user para suportar aprovação de contas
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_first_user boolean;
  _assigned_role app_role;
  _require_approval boolean;
  _is_approved boolean;
BEGIN
  -- Verificar se é o primeiro usuário
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _is_first_user;
  
  -- Verificar se aprovação de conta está habilitada
  SELECT (value = 'true') INTO _require_approval
  FROM public.project_config
  WHERE key = 'require_account_approval'
  LIMIT 1;
  
  -- Se _require_approval é NULL (configuração não existe), assume false
  _require_approval := COALESCE(_require_approval, false);
  
  IF _is_first_user THEN
    _assigned_role := 'admin';
    _is_approved := true; -- Primeiro usuário sempre aprovado
  ELSE
    _assigned_role := 'agent';
    -- Se aprovação obrigatória está desabilitada, aprovar automaticamente
    _is_approved := NOT _require_approval;
  END IF;

  -- Inserir perfil com is_approved definido
  INSERT INTO public.profiles (id, full_name, email, is_active, is_approved)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    true,
    _is_approved
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Inserir role com conflict handling
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, _assigned_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN new;
END;
$function$;