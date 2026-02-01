import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.85.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  conversationId: string;
  content?: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;
  fileName?: string;
  quotedMessageId?: string;
}

// Helper function to get Evolution API auth headers based on provider type
function getEvolutionAuthHeaders(apiKey: string, providerType: string): Record<string, string> {
  // UzAPI uses Bearer token
  if (providerType === 'uzapi') {
    return { 'Authorization': `Bearer ${apiKey}` };
  }
  // Evolution Cloud confirmou: ambos usam header 'apikey'
  return { apikey: apiKey };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: SendMessageRequest = await req.json();
    console.log('[send-whatsapp-message] Request received:', {
      conversationId: body.conversationId,
      messageType: body.messageType
    });

    // Validate request
    if (!body.conversationId || !body.messageType) {
      return new Response(
        JSON.stringify({ success: false, error: 'conversationId and messageType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.messageType === 'text' && !body.content) {
      return new Response(
        JSON.stringify({ success: false, error: 'content is required for text messages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.messageType !== 'text' && !body.mediaUrl && !body.mediaBase64) {
      return new Response(
        JSON.stringify({ success: false, error: 'mediaUrl or mediaBase64 is required for media messages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get conversation details including instance info and provider_type
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        whatsapp_contacts!inner (
          phone_number,
          name
        ),
        whatsapp_instances!inner (
          id,
          instance_name,
          provider_type,
          instance_id_external
        )
      `)
      .eq('id', body.conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[send] Conversation not found:', convError);
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const instanceName = (conversation as any).whatsapp_instances.instance_name;
    const providerType = (conversation as any).whatsapp_instances.provider_type || 'self_hosted';
    const instanceIdExternal = (conversation as any).whatsapp_instances.instance_id_external;
    const contact = (conversation as any).whatsapp_contacts;

    console.log('[send-whatsapp-message] Provider type:', providerType);

    // MOCK MODE: Skip API call, just save to DB
    if (providerType === 'mock') {
      console.log('[send-whatsapp-message] Mock mode - skipping Evolution API call');

      const messageId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const messageContent = body.messageType === 'text'
        ? (body.content || '')
        : (body.content || `Sent ${body.messageType}`);

      // Save message to database
      const { data: savedMessage, error: saveError } = await supabase
        .from('whatsapp_messages')
        .insert({
          conversation_id: body.conversationId,
          message_id: messageId,
          remote_jid: contact.phone_number,
          content: messageContent,
          message_type: body.messageType,
          media_url: body.mediaUrl || null,
          media_mimetype: body.mediaMimetype || null,
          status: 'sent',
          is_from_me: true,
          timestamp: new Date().toISOString(),
          quoted_message_id: body.quotedMessageId || null,
          metadata: {
            fileName: body.fileName,
            mock: true,
          },
        })
        .select()
        .single();

      if (saveError) {
        console.error('[send-whatsapp-message] Error saving mock message:', saveError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save message' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update conversation metadata
      await supabase
        .from('whatsapp_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: messageContent.substring(0, 100),
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.conversationId);

      console.log('[send-whatsapp-message] Mock message saved:', savedMessage.id);

      // Simulate status progression (sent -> delivered -> read) with delays
      // This happens asynchronously in the background
      setTimeout(async () => {
        try {
          await supabase
            .from('whatsapp_messages')
            .update({ status: 'delivered' })
            .eq('message_id', messageId);
          console.log('[send-whatsapp-message] Mock status updated to delivered');

          setTimeout(async () => {
            try {
              await supabase
                .from('whatsapp_messages')
                .update({ status: 'read' })
                .eq('message_id', messageId);
              console.log('[send-whatsapp-message] Mock status updated to read');
            } catch (e) {
              console.log('[send-whatsapp-message] Could not update to read:', e);
            }
          }, 3000);
        } catch (e) {
          console.log('[send-whatsapp-message] Could not update to delivered:', e);
        }
      }, 1500);

      return new Response(
        JSON.stringify({ success: true, message: savedMessage }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // REAL MODE: Call Integration API
    // Fetch instance secrets
    const { data: secrets, error: secretsError } = await supabase
      .from('whatsapp_instance_secrets')
      .select('api_url, api_key')
      .eq('instance_id', (conversation as any).whatsapp_instances.id)
      .single();

    if (secretsError || !secrets) {
      console.error('[send] Failed to fetch instance secrets:', secretsError);
      return new Response(JSON.stringify({ error: 'Instance secrets not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // For Cloud/UzAPI, use instance_id_external instead of instance_name
    const instanceIdentifier = (providerType === 'cloud' || providerType === 'uzapi') && instanceIdExternal
      ? instanceIdExternal
      : instanceName;

    console.log('[send-whatsapp-message] Sending to:', contact.phone_number, 'Provider:', providerType, 'Instance:', instanceIdentifier);

    // Determine destination number format
    const destinationNumber = getDestinationNumber(contact.phone_number);

    let endpoint = '';
    let requestBody: any = {};

    if (providerType === 'uzapi') {
      const result = buildUzApiRequest(
        secrets.api_url,
        instanceIdentifier,
        destinationNumber,
        body
      );
      endpoint = result.endpoint;
      requestBody = result.requestBody;
    } else {
      // Default to Evolution API
      const result = buildEvolutionRequest(
        secrets.api_url,
        instanceIdentifier,
        destinationNumber,
        body
      );
      endpoint = result.endpoint;
      requestBody = result.requestBody;
    }

    console.log('[send-whatsapp-message] API endpoint:', endpoint);

    // Get correct auth headers based on provider type
    const authHeaders = getEvolutionAuthHeaders(secrets.api_key, providerType);

    // Send to API
    const apiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(requestBody),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('[send-whatsapp-message] API error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send message via API', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiData = await apiResponse.json();
    console.log('[send-whatsapp-message] API response:', apiData);

    // Extract message ID
    let messageId = `msg_${Date.now()}`;

    // UzAPI/Cloud API usually retuns { messages: [{ id: '...' }] }
    if (providerType === 'uzapi' && apiData.messages && apiData.messages[0]?.id) {
      messageId = apiData.messages[0].id;
    } else if (apiData.key?.id) {
      // Evolution API
      messageId = apiData.key.id;
    }

    // Extract media URL from response if available (mainly handled by Evolution)
    let extractedMediaUrl: string | null = null;
    if (providerType !== 'uzapi') {
      if (body.messageType === 'audio' && apiData.message?.audioMessage?.url) {
        extractedMediaUrl = apiData.message.audioMessage.url;
      } else if (body.messageType === 'image' && apiData.message?.imageMessage?.url) {
        extractedMediaUrl = apiData.message.imageMessage.url;
      } else if (body.messageType === 'video' && apiData.message?.videoMessage?.url) {
        extractedMediaUrl = apiData.message.videoMessage.url;
      } else if (body.messageType === 'document' && apiData.message?.documentMessage?.url) {
        extractedMediaUrl = apiData.message.documentMessage.url;
      }
    }

    // Save message to database
    const messageContent = body.messageType === 'text'
      ? (body.content || '')
      : (body.content || `Sent ${body.messageType}`);

    const { data: savedMessage, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: body.conversationId,
        message_id: messageId,
        remote_jid: contact.phone_number,
        content: messageContent,
        message_type: body.messageType,
        media_url: extractedMediaUrl || body.mediaUrl || null,
        media_mimetype: body.mediaMimetype || null,
        status: 'sent',
        is_from_me: true,
        timestamp: new Date().toISOString(),
        quoted_message_id: body.quotedMessageId || null,
        metadata: {
          fileName: body.fileName,
        },
      })
      .select()
      .single();

    if (saveError) {
      console.error('[send-whatsapp-message] Error saving message:', saveError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save message' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update conversation metadata
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messageContent.substring(0, 100),
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.conversationId);

    console.log('[send-whatsapp-message] Message sent and saved:', savedMessage.id);

    return new Response(
      JSON.stringify({ success: true, message: savedMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-whatsapp-message] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getDestinationNumber(phoneNumber: string): string {
  // If phone ends with @lid (LinkedIn format), use complete format
  if (phoneNumber.includes('@lid')) {
    return phoneNumber;
  }
  // Otherwise, use only digits
  return phoneNumber.replace(/\D/g, '');
}

function buildEvolutionRequest(
  apiUrl: string,
  instanceName: string,
  number: string,
  body: SendMessageRequest
): { endpoint: string; requestBody: any } {
  // Remove trailing slash
  let baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;

  // Remove /manager suffix if present (message endpoints are at root level)
  baseUrl = baseUrl.replace(/\/manager$/, '');

  switch (body.messageType) {
    case 'text': {
      const requestBody: any = {
        number,
        text: body.content,
      };

      if (body.quotedMessageId) {
        requestBody.quoted = {
          key: {
            id: body.quotedMessageId,
          },
        };
      }

      return {
        endpoint: `${baseUrl}/message/sendText/${instanceName}`,
        requestBody,
      };
    }

    case 'audio': {
      // Evolution API expects either a plain base64 string or a public URL
      let audioData: string | undefined;

      if (body.mediaBase64) {
        // Strip possible data URI prefix and keep only the base64 payload
        const base64 = body.mediaBase64.startsWith('data:')
          ? body.mediaBase64.split(',')[1] || ''
          : body.mediaBase64;

        audioData = base64;
      } else if (body.mediaUrl) {
        audioData = body.mediaUrl;
      }

      if (!audioData) {
        throw new Error('Missing audio data');
      }

      return {
        endpoint: `${baseUrl}/message/sendWhatsAppAudio/${instanceName}`,
        requestBody: {
          number,
          audio: audioData,
        },
      };
    }

    case 'image':
    case 'video':
    case 'document': {
      const requestBody: any = {
        number,
        mediatype: body.messageType,
        media: body.mediaBase64 || body.mediaUrl,
      };

      if (body.content) {
        requestBody.caption = body.content;
      }

      if (body.messageType === 'document' && body.fileName) {
        requestBody.fileName = body.fileName;
      }

      return {
        endpoint: `${baseUrl}/message/sendMedia/${instanceName}`,
        requestBody,
      };
    }

    default:
      throw new Error(`Unsupported message type: ${body.messageType}`);
  }
}

function buildUzApiRequest(
  apiUrl: string,
  phoneNumberId: string,
  number: string,
  body: SendMessageRequest
): { endpoint: string; requestBody: any } {
  // Remove trailing slash
  const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;

  // Endpoint: /v1/{phone_number_id}/messages
  // Note: apiUrl is expected to be "https://api.uzapi.com.br/username"
  const endpoint = `${baseUrl}/v1/${phoneNumberId}/messages`;

  // Use structure from UzAPI Swagger
  // NO messaging_product field
  const requestBody: any = {
    to: number,
    delayMessage: 0,
    delayTyping: 0,
    type: body.messageType,
  };

  switch (body.messageType) {
    case 'text':
      requestBody.text = { body: body.content };
      if (body.quotedMessageId) {
        requestBody.context = { message_id: body.quotedMessageId };
      }
      break;

    case 'image':
      requestBody.image = {
        link: body.mediaUrl,
        caption: body.content
      };
      break;

    case 'audio':
      requestBody.audio = {
        link: body.mediaUrl
      };
      break;

    case 'video':
      requestBody.video = {
        link: body.mediaUrl,
        caption: body.content
      };
      break;

    case 'document':
      requestBody.document = {
        link: body.mediaUrl,
        caption: body.content,
        fileName: body.fileName
      };
      break;

    default:
      throw new Error(`Unsupported message type for UzAPI: ${body.messageType}`);
  }

  return { endpoint, requestBody };
}
