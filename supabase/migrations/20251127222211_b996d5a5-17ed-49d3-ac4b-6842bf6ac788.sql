-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Recreate the policy using the has_role function to avoid recursion
CREATE POLICY "Admins can manage roles" 
ON public.user_roles
FOR ALL 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));