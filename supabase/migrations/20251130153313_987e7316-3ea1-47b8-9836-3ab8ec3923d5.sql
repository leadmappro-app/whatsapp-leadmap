-- Adicionar policy para leitura pública das configurações de segurança
-- Necessário para que o SignupForm (sem autenticação) possa verificar restrições de domínio

CREATE POLICY "Public can read security configs" ON public.project_config
FOR SELECT
TO anon
USING (key IN ('restrict_signup_by_domain', 'allowed_email_domains'));