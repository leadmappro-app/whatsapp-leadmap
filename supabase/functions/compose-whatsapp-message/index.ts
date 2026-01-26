import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, action, targetLanguage } = await req.json();

    if (!message || !action) {
      throw new Error('Message and action are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const mockAI = Deno.env.get('MOCK_AI') === 'true';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    // Mock mode fallback when AI is not available
    const useMockMode = mockAI || !lovableApiKey;

    const supabase = createClient(supabaseUrl, supabaseKey);

    let prompt = '';
    let userHistory = '';

    // Para "my_tone", buscar histórico de mensagens enviadas para aprender o estilo
    if (action === 'my_tone') {
      const { data: messages } = await supabase
        .from('whatsapp_messages')
        .select('content')
        .eq('is_from_me', true)
        .not('content', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(20);

      if (messages && messages.length > 0) {
        userHistory = messages
          .map((m, i) => `${i + 1}. "${m.content}"`)
          .join('\n');
      }
    }

    // Definir prompts para cada ação
    switch (action) {
      case 'expand':
        prompt = `Você é um assistente de atendimento. Expanda esta mensagem curta em uma resposta completa e profissional, mantendo o mesmo significado mas adicionando contexto e detalhes úteis:

"${message}"

Responda apenas com o texto expandido, sem explicações.`;
        break;

      case 'rephrase':
        prompt = `Reformule esta mensagem mantendo exatamente o mesmo significado, mas usando palavras e estrutura diferentes:

"${message}"

Responda apenas com o texto reformulado.`;
        break;

      case 'my_tone':
        if (!userHistory) {
          prompt = `Reescreva esta mensagem de forma profissional e amigável:

"${message}"

Responda apenas com a mensagem reescrita.`;
        } else {
          prompt = `Aqui estão exemplos de mensagens enviadas anteriormente:

${userHistory}

Agora reescreva esta mensagem usando o mesmo estilo de escrita dos exemplos acima, incluindo o tom, vocabulário e uso de emojis:

"${message}"

Responda apenas com a mensagem reescrita no mesmo estilo.`;
        }
        break;

      case 'friendly':
        prompt = `Reescreva esta mensagem de forma mais casual, amigável e acolhedora. Use emojis apropriados:

"${message}"

Responda apenas com a versão amigável.`;
        break;

      case 'formal':
        prompt = `Reescreva esta mensagem de forma mais profissional e formal, removendo gírias e mantendo um tom corporativo:

"${message}"

Responda apenas com a versão formal.`;
        break;

      case 'fix_grammar':
        prompt = `Corrija todos os erros de gramática, ortografia e pontuação nesta mensagem, mantendo o tom e significado:

"${message}"

Responda apenas com o texto corrigido.`;
        break;

      case 'translate':
        const languageNames: Record<string, string> = {
          'en': 'inglês',
          'es': 'espanhol',
          'fr': 'francês',
          'de': 'alemão',
          'it': 'italiano',
          'pt': 'português'
        };
        const langName = languageNames[targetLanguage || 'en'] || targetLanguage;
        prompt = `Traduza esta mensagem para ${langName}, mantendo o tom e o contexto:

"${message}"

Responda apenas com a tradução.`;
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Mock mode: simple text transformations
    if (useMockMode) {
      console.log('Using mock mode for compose action:', action);
      let composed = message;
      
      switch (action) {
        case 'expand':
          composed = `${message} Estamos à disposição para ajudar no que precisar. Aguardamos seu retorno.`;
          break;
        case 'friendly':
          composed = `${message} 😊`;
          break;
        case 'formal':
          composed = message.replace(/oi|olá/gi, 'Prezado(a)').replace(/tá|ta /gi, 'está ');
          break;
        case 'fix_grammar':
          composed = message.charAt(0).toUpperCase() + message.slice(1);
          if (!composed.endsWith('.') && !composed.endsWith('!') && !composed.endsWith('?')) {
            composed += '.';
          }
          break;
        default:
          composed = message;
      }

      return new Response(
        JSON.stringify({ original: message, composed, action }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling Lovable AI with action:', action);

    // Chamar Lovable AI Gateway
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    // Tratar erros de rate limit e pagamento
    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (aiResponse.status === 402) {
        throw new Error('Payment required. Please add credits.');
      }
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error('AI processing failed');
    }

    const aiData = await aiResponse.json();
    const composedText = aiData.choices?.[0]?.message?.content;

    if (!composedText) {
      throw new Error('No response from AI');
    }

    console.log('AI composition successful for action:', action);

    return new Response(
      JSON.stringify({
        original: message,
        composed: composedText.trim(),
        action
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in compose-whatsapp-message:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
