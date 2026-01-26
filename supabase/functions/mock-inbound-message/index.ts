import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MockInboundRequest {
  conversationId: string;
  content: string;
  messageType?: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  mediaMimetype?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user from token
    const { data: { user }, error: authError } = await createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: MockInboundRequest = await req.json();
    
    if (!body.conversationId || !body.content) {
      return new Response(
        JSON.stringify({ error: 'conversationId and content are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[mock-inbound-message] Simulating inbound message for:', body.conversationId);

    // Fetch conversation to get contact info
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        whatsapp_contacts!inner (
          phone_number,
          name
        ),
        whatsapp_instances!inner (
          provider_type
        )
      `)
      .eq('id', body.conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify this is a mock instance
    if ((conversation as any).whatsapp_instances.provider_type !== 'mock') {
      return new Response(
        JSON.stringify({ error: 'This function only works with mock instances' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messageType = body.messageType || 'text';
    const now = new Date();
    const messageId = `mock_inbound_${now.getTime()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Determine display content
    let displayContent = body.content;
    if (messageType !== 'text' && !body.content) {
      displayContent = `[${messageType === 'image' ? 'Imagem' : messageType === 'audio' ? 'Áudio' : messageType === 'video' ? 'Vídeo' : 'Documento'}]`;
    }

    // Insert message as received (is_from_me = false)
    const { data: message, error: msgError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: body.conversationId,
        message_id: messageId,
        remote_jid: (conversation as any).whatsapp_contacts.phone_number,
        content: displayContent,
        message_type: messageType,
        media_url: body.mediaUrl || null,
        media_mimetype: body.mediaMimetype || null,
        is_from_me: false,
        status: 'delivered',
        timestamp: now.toISOString(),
        metadata: { mock: true, simulated: true },
      })
      .select()
      .single();

    if (msgError) {
      console.error('[mock-inbound-message] Error inserting message:', msgError);
      return new Response(
        JSON.stringify({ error: 'Failed to insert message' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update conversation
    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: now.toISOString(),
        last_message_preview: displayContent.substring(0, 100),
        unread_count: (conversation.unread_count || 0) + 1,
        updated_at: now.toISOString(),
        status: 'active', // Reopen if was resolved
      })
      .eq('id', body.conversationId);

    if (updateError) {
      console.error('[mock-inbound-message] Error updating conversation:', updateError);
    }

    console.log('[mock-inbound-message] Message created:', message.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: {
          id: message.id,
          message_id: message.message_id,
          content: message.content,
          timestamp: message.timestamp,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[mock-inbound-message] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
