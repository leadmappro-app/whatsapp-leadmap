import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeRequest {
  conversationId: string;
}

interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  summary: string;
  reasoning: string;
}

// Heuristic sentiment analysis for mock mode or when AI is unavailable
function analyzeHeuristic(messages: { content: string }[]): SentimentResult {
  const negativeWords = [
    'raiva', 'péssimo', 'horrível', 'reclamação', 'cancelar', 'não gostei', 
    'absurdo', 'problema', 'defeito', 'frustrado', 'irritado', 'insatisfeito',
    'nunca mais', 'pior', 'demora', 'vergonha', 'inaceitável', 'desrespeito'
  ];
  
  const positiveWords = [
    'obrigado', 'ótimo', 'perfeito', 'resolvido', 'excelente', 'maravilhoso',
    'parabéns', 'satisfeito', 'adorei', 'recomendo', 'sensacional', 'incrível',
    'top', 'show', 'bom', 'melhor', 'gostei', 'agradeço'
  ];

  let positiveScore = 0;
  let negativeScore = 0;
  let totalWords = 0;

  const allContent = messages.map(m => m.content.toLowerCase()).join(' ');

  for (const word of positiveWords) {
    const matches = allContent.split(word).length - 1;
    positiveScore += matches;
    totalWords += matches;
  }

  for (const word of negativeWords) {
    const matches = allContent.split(word).length - 1;
    negativeScore += matches;
    totalWords += matches;
  }

  let sentiment: 'positive' | 'neutral' | 'negative';
  let confidence: number;
  let summary: string;
  let reasoning: string;

  if (totalWords === 0) {
    sentiment = 'neutral';
    confidence = 0.5;
    summary = 'Conversa com tom neutro, sem indicadores fortes de emoção.';
    reasoning = 'Análise heurística não encontrou palavras-chave de sentimento.';
  } else if (positiveScore > negativeScore * 1.5) {
    sentiment = 'positive';
    confidence = Math.min(0.9, 0.6 + (positiveScore / totalWords) * 0.3);
    summary = 'Cliente demonstra satisfação com o atendimento.';
    reasoning = `Encontradas ${positiveScore} palavras positivas vs ${negativeScore} negativas.`;
  } else if (negativeScore > positiveScore * 1.5) {
    sentiment = 'negative';
    confidence = Math.min(0.9, 0.6 + (negativeScore / totalWords) * 0.3);
    summary = 'Cliente demonstra insatisfação ou frustração.';
    reasoning = `Encontradas ${negativeScore} palavras negativas vs ${positiveScore} positivas.`;
  } else {
    sentiment = 'neutral';
    confidence = 0.6;
    summary = 'Sentimento misto ou neutro identificado na conversa.';
    reasoning = `Balanço equilibrado: ${positiveScore} positivas, ${negativeScore} negativas.`;
  }

  return { sentiment, confidence, summary, reasoning };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const mockAI = Deno.env.get('MOCK_AI') === 'true';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { conversationId } = await req.json() as AnalyzeRequest;

    if (!conversationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'conversationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing sentiment for conversation: ${conversationId}`);

    // Check if this is a mock instance
    const { data: conversationData } = await supabase
      .from('whatsapp_conversations')
      .select('instance_id, contact_id, whatsapp_instances!inner(provider_type)')
      .eq('id', conversationId)
      .single();

    const isMockInstance = (conversationData as any)?.whatsapp_instances?.provider_type === 'mock';
    const useMockAnalysis = isMockInstance || mockAI || !lovableApiKey;

    console.log(`Using mock analysis: ${useMockAnalysis} (isMock: ${isMockInstance}, mockAI: ${mockAI}, hasKey: ${!!lovableApiKey})`);

    // Fetch last 10 messages from contact (is_from_me = false)
    const { data: messages, error: messagesError } = await supabase
      .from('whatsapp_messages')
      .select('content, timestamp')
      .eq('conversation_id', conversationId)
      .eq('is_from_me', false)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch messages' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check minimum messages requirement
    if (!messages || messages.length < 3) {
      console.log(`Insufficient messages: ${messages?.length || 0}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Mínimo 3 mensagens necessário para análise',
          messagesFound: messages?.length || 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch conversation and contact data
    const { data: conversation, error: conversationError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        id,
        contact_id,
        whatsapp_contacts (
          id,
          name,
          phone_number
        )
      `)
      .eq('id', conversationId)
      .single();

    if (conversationError || !conversation) {
      console.error('Error fetching conversation:', conversationError);
      return new Response(
        JSON.stringify({ success: false, error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: SentimentResult;

    if (useMockAnalysis) {
      // Use heuristic analysis
      console.log('Using heuristic sentiment analysis');
      result = analyzeHeuristic(messages);
    } else {
      // Use AI analysis
      // Reverse messages to show oldest first
      const orderedMessages = [...messages].reverse();

      // Build prompt for AI
      const messagesText = orderedMessages
        .map((msg, index) => `${index + 1}. [${new Date(msg.timestamp).toLocaleString('pt-BR')}]: "${msg.content}"`)
        .join('\n');

      const prompt = `Analise o sentimento das últimas mensagens deste cliente de WhatsApp.

**Mensagens (mais antigas para mais recentes):**
${messagesText}

**Critérios de Análise:**
- **positive**: Cliente satisfeito, agradecido, animado, elogios
- **neutral**: Tom profissional, dúvidas técnicas, informações
- **negative**: Frustrado, insatisfeito, reclamando, impaciente

Analise o contexto geral e determine o sentimento predominante.`;

      console.log('Calling Lovable AI Gateway...');

      // Call Lovable AI Gateway with tool calling for structured output
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
          tools: [{
            type: "function",
            function: {
              name: "analyze_sentiment",
              description: "Analisa o sentimento das mensagens do cliente",
              parameters: {
                type: "object",
                properties: {
                  sentiment: {
                    type: "string",
                    enum: ["positive", "neutral", "negative"],
                    description: "Sentimento geral detectado"
                  },
                  confidence: {
                    type: "number",
                    description: "Score de confiança entre 0.00 e 1.00"
                  },
                  summary: {
                    type: "string",
                    description: "Resumo curto do sentimento (máx 100 caracteres)"
                  },
                  reasoning: {
                    type: "string",
                    description: "Explicação do raciocínio"
                  }
                },
                required: ["sentiment", "confidence", "summary", "reasoning"],
                additionalProperties: false
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "analyze_sentiment" } }
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('Lovable AI error:', aiResponse.status, errorText);

        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Rate limit excedido. Tente novamente em alguns segundos.' 
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (aiResponse.status === 402) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Créditos insuficientes. Adicione créditos ao workspace.' 
            }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fallback to heuristic on AI error
        console.log('AI failed, falling back to heuristic');
        result = analyzeHeuristic(messages);
      } else {
        const aiData = await aiResponse.json();
        console.log('AI response received:', JSON.stringify(aiData));

        // Extract sentiment result from tool call
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall?.function?.arguments) {
          console.error('No tool call in AI response, using heuristic');
          result = analyzeHeuristic(messages);
        } else {
          result = JSON.parse(toolCall.function.arguments);
          console.log('Parsed sentiment result:', result);

          // Validate sentiment value
          if (!['positive', 'neutral', 'negative'].includes(result.sentiment)) {
            console.error('Invalid sentiment value:', result.sentiment);
            result = analyzeHeuristic(messages);
          }
        }
      }
    }

    // UPSERT into whatsapp_sentiment_analysis (trigger will archive old one)
    const { data: analysis, error: upsertError } = await supabase
      .from('whatsapp_sentiment_analysis')
      .upsert({
        conversation_id: conversationId,
        contact_id: conversation.contact_id,
        sentiment: result.sentiment,
        confidence_score: result.confidence,
        summary: result.summary.substring(0, 100), // Ensure max 100 chars
        reasoning: result.reasoning,
        messages_analyzed: messages.length,
        metadata: { 
          model: useMockAnalysis ? 'heuristic' : 'google/gemini-2.5-flash',
          analyzed_at: new Date().toISOString(),
          mock: useMockAnalysis
        }
      }, {
        onConflict: 'conversation_id'
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Error saving analysis:', upsertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save analysis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analysis saved successfully:', analysis.id);

    return new Response(
      JSON.stringify({
        success: true,
        analysis: {
          id: analysis.id,
          conversation_id: analysis.conversation_id,
          sentiment: analysis.sentiment,
          confidence_score: analysis.confidence_score,
          summary: analysis.summary,
          reasoning: analysis.reasoning,
          messages_analyzed: analysis.messages_analyzed
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
