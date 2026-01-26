import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmartReplySuggestion {
  text: string;
  tone: 'formal' | 'friendly' | 'direct';
}

const defaultSuggestions: SmartReplySuggestion[] = [
  { text: "Olá! Como posso ajudá-lo(a) hoje?", tone: "formal" },
  { text: "Oi! Em que posso te ajudar? 😊", tone: "friendly" },
  { text: "Oi! Qual sua dúvida?", tone: "direct" }
];

// Generate contextual mock suggestions
function generateMockSuggestions(contactName: string, lastMessage: string): SmartReplySuggestion[] {
  const lowerMsg = lastMessage.toLowerCase();
  
  // Check for common patterns
  if (lowerMsg.includes('preço') || lowerMsg.includes('valor') || lowerMsg.includes('custo') || lowerMsg.includes('quanto')) {
    return [
      { text: `${contactName}, o valor é R$ 150,00 com desconto especial. Posso enviar mais detalhes?`, tone: "formal" },
      { text: `Oi ${contactName}! 😊 O preço está ótimo agora: R$ 150. Quer aproveitar?`, tone: "friendly" },
      { text: `R$ 150,00. Aceita PIX, cartão ou boleto. Qual prefere?`, tone: "direct" }
    ];
  }
  
  if (lowerMsg.includes('agendar') || lowerMsg.includes('horário') || lowerMsg.includes('disponível') || lowerMsg.includes('agenda')) {
    return [
      { text: `Perfeito, ${contactName}. Tenho disponibilidade amanhã às 14h ou 16h. Qual horário prefere?`, tone: "formal" },
      { text: `Show! 📅 Posso agendar pra amanhã de tarde. 14h ou 16h, qual fica melhor pra você?`, tone: "friendly" },
      { text: `Amanhã 14h ou 16h. Qual horário?`, tone: "direct" }
    ];
  }
  
  if (lowerMsg.includes('problema') || lowerMsg.includes('defeito') || lowerMsg.includes('não funciona') || lowerMsg.includes('reclamação')) {
    return [
      { text: `${contactName}, lamento pelo inconveniente. Pode me detalhar o problema para resolvermos rapidamente?`, tone: "formal" },
      { text: `Puxa, sinto muito pelo transtorno 😔 Me conta mais sobre o problema que vou resolver pra você!`, tone: "friendly" },
      { text: `Entendi. Qual o problema exatamente? Vou verificar agora.`, tone: "direct" }
    ];
  }
  
  if (lowerMsg.includes('obrigado') || lowerMsg.includes('agradeço') || lowerMsg.includes('valeu')) {
    return [
      { text: `Por nada, ${contactName}! Estamos à disposição para qualquer outra necessidade.`, tone: "formal" },
      { text: `Imagina! 😊 Precisando, só chamar. Abraço!`, tone: "friendly" },
      { text: `Disponha! Qualquer coisa é só falar.`, tone: "direct" }
    ];
  }
  
  if (lowerMsg.includes('pix') || lowerMsg.includes('pagamento') || lowerMsg.includes('pagar')) {
    return [
      { text: `${contactName}, nosso PIX é contato@empresa.com.br. Após o pagamento, envie o comprovante aqui.`, tone: "formal" },
      { text: `PIX: contato@empresa.com.br 📲 Me manda o comprovante depois que pagar!`, tone: "friendly" },
      { text: `PIX: contato@empresa.com.br. Envie comprovante após pagar.`, tone: "direct" }
    ];
  }
  
  // Default contextual responses
  return [
    { text: `Olá, ${contactName}! Entendi sua mensagem. Como posso ajudá-lo(a) com isso?`, tone: "formal" },
    { text: `Oi ${contactName}! 😊 Vou te ajudar com isso. Me conta mais!`, tone: "friendly" },
    { text: `Ok, ${contactName}. O que precisa exatamente?`, tone: "direct" }
  ];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId } = await req.json();

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: 'conversationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const mockAI = Deno.env.get('MOCK_AI') === 'true';

    console.log('Fetching messages for conversation:', conversationId);

    // Check if this is a mock instance
    const { data: conversationCheck } = await supabase
      .from('whatsapp_conversations')
      .select('whatsapp_instances!inner(provider_type)')
      .eq('id', conversationId)
      .single();

    const isMockInstance = (conversationCheck as any)?.whatsapp_instances?.provider_type === 'mock';
    const useMockSuggestions = isMockInstance || mockAI || !LOVABLE_API_KEY;

    // Buscar últimas 10 mensagens da conversa
    const { data: messages, error: messagesError } = await supabase
      .from('whatsapp_messages')
      .select('content, is_from_me, timestamp, message_type')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return new Response(
        JSON.stringify({ suggestions: defaultSuggestions, context: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar dados do contato
    const { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('contact:whatsapp_contacts(name)')
      .eq('id', conversationId)
      .single();

    const contactName = conversation?.contact?.name || 'Cliente';

    // Filtrar apenas mensagens de texto e inverter ordem (mais antigas primeiro)
    const textMessages = messages?.filter(m => m.message_type === 'text').reverse() || [];

    if (textMessages.length === 0) {
      console.log('No text messages found, returning defaults');
      return new Response(
        JSON.stringify({ suggestions: defaultSuggestions, context: { contactName, lastMessage: '' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Identificar última mensagem do cliente
    const lastClientMessage = textMessages.filter(m => !m.is_from_me).pop();

    if (!lastClientMessage) {
      console.log('No client messages found, returning defaults');
      return new Response(
        JSON.stringify({ suggestions: defaultSuggestions, context: { contactName, lastMessage: '' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use mock suggestions if needed
    if (useMockSuggestions) {
      console.log('Using mock suggestions (mock:', isMockInstance, ', mockAI:', mockAI, ', hasKey:', !!LOVABLE_API_KEY, ')');
      const mockSuggestions = generateMockSuggestions(contactName, lastClientMessage.content);
      return new Response(
        JSON.stringify({
          suggestions: mockSuggestions,
          context: {
            contactName,
            lastMessage: lastClientMessage.content
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Montar histórico das últimas 8 mensagens para contexto
    const recentMessages = textMessages.slice(-8).map(m => 
      `${m.is_from_me ? 'Você' : contactName}: ${m.content}`
    ).join('\n');

    console.log('Calling Lovable AI for suggestions...');

    const systemPrompt = `Você é um assistente que gera respostas CURTAS (até 2 frases) e ÚTEIS para atendimento ao cliente.

REGRAS:
- Foque em resolver ou encaminhar, não cumprimente à toa
- Varie o tom: formal, amigável, direto
- Use português do Brasil
- Se for sobre agendamento, proponha 1-2 opções de horário
- Se for instrução operacional, traga passos claros
- Seja objetivo e útil

CONTEXTO:
- Cliente: ${contactName}
- Última mensagem do cliente: "${lastClientMessage.content}"
- Histórico recente:
${recentMessages}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Gere 3 sugestões de resposta com tons diferentes.' }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'suggest_replies',
            description: 'Retorna 3 sugestões de resposta com tons diferentes',
            parameters: {
              type: 'object',
              properties: {
                suggestions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string', description: 'Texto da sugestão (máximo 2 frases)' },
                      tone: { 
                        type: 'string', 
                        enum: ['formal', 'friendly', 'direct'],
                        description: 'Tom da resposta'
                      }
                    },
                    required: ['text', 'tone']
                  },
                  minItems: 3,
                  maxItems: 3
                }
              },
              required: ['suggestions']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'suggest_replies' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded. Please try again in a moment.',
            suggestions: generateMockSuggestions(contactName, lastClientMessage.content),
            context: { contactName, lastMessage: lastClientMessage.content }
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ 
            error: 'Insufficient credits. Please add credits to your Lovable AI workspace.',
            suggestions: generateMockSuggestions(contactName, lastClientMessage.content),
            context: { contactName, lastMessage: lastClientMessage.content }
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fallback to mock suggestions on error
      return new Response(
        JSON.stringify({ 
          suggestions: generateMockSuggestions(contactName, lastClientMessage.content),
          context: { contactName, lastMessage: lastClientMessage.content }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    console.log('AI response received:', JSON.stringify(aiData));

    // Extrair sugestões do tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error('No tool call in AI response');
      return new Response(
        JSON.stringify({ 
          suggestions: generateMockSuggestions(contactName, lastClientMessage.content),
          context: { contactName, lastMessage: lastClientMessage.content }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const suggestionsData = JSON.parse(toolCall.function.arguments);
    const suggestions = suggestionsData.suggestions || generateMockSuggestions(contactName, lastClientMessage.content);

    console.log('Returning suggestions:', suggestions);

    return new Response(
      JSON.stringify({
        suggestions,
        context: {
          contactName,
          lastMessage: lastClientMessage.content
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in suggest-smart-replies:', error);
    return new Response(
      JSON.stringify({ 
        suggestions: defaultSuggestions,
        context: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
