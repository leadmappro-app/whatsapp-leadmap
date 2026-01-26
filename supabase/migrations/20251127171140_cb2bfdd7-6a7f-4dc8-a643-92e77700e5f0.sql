-- Add notes column to whatsapp_contacts table
ALTER TABLE public.whatsapp_contacts 
ADD COLUMN IF NOT EXISTS notes text;