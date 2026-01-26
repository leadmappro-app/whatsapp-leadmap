import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MockStatusRequest {
  messageId: string;
  conversationId: string;
  status: 'sent' | 'delivered' | 'read';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: MockStatusRequest = await req.json();
    
    if (!body.messageId || !body.status) {
      return new Response(
        JSON.stringify({ error: 'messageId and status are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[mock-message-status] Updating status for:', body.messageId, 'to:', body.status);

    // Update message status
    const { data: message, error: updateError } = await supabase
      .from('whatsapp_messages')
      .update({
        status: body.status,
        metadata: { 
          mock: true,
          status_updated_at: new Date().toISOString()
        }
      })
      .eq('message_id', body.messageId)
      .select()
      .single();

    if (updateError) {
      console.error('[mock-message-status] Error updating status:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update message status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: {
          id: message?.id,
          message_id: body.messageId,
          status: body.status,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[mock-message-status] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
