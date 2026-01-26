import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId } = await req.json();

    if (!conversationId) {
      throw new Error('conversationId é obrigatório');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY'); // Sem ! - pode ser undefined

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Gerando resumo para conversa:', conversationId);

    // 1. Buscar últimas 30 mensagens da conversa
    const { data: messages, error: messagesError } = await supabase
      .from('whatsapp_messages')
      .select('content, timestamp, is_from_me')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(30);

    if (messagesError) throw messagesError;

    if (!messages || messages.length < 5) {
      return new Response(
        JSON.stringify({ message: 'Mínimo de 5 mensagens necessário para resumo.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 2. Buscar dados da conversa e contato (inclui instance para verificar provider_type)
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(name),
        instance:whatsapp_instances(provider_type)
      `)
      .eq('id', conversationId)
      .single();

    if (convError) throw convError;

    const contactName = conversation.contact?.name || 'Cliente';
    const isMockInstance = conversation.instance?.provider_type === 'mock';
    const useMockSummary = isMockInstance || !lovableApiKey;

    // 3. Se mock ou sem API key, usar fallback heurístico
    if (useMockSummary) {
      console.log('Usando fallback heurístico para resumo (mock ou sem API key)');

      // Análise heurística das mensagens
      const inboundMessages = messages.filter(m => !m.is_from_me);
      const outboundMessages = messages.filter(m => m.is_from_me);
      
      // Detectar palavras-chave para sentimento
      const allContent = messages.map(m => m.content.toLowerCase()).join(' ');
      let sentiment = 'neutral';
      const positiveWords = ['obrigado', 'perfeito', 'ótimo', 'excelente', 'maravilhoso', 'adorei'];
      const negativeWords = ['problema', 'erro', 'ruim', 'péssimo', 'cancelar', 'reclamação'];
      
      const positiveCount = positiveWords.filter(w => allContent.includes(w)).length;
      const negativeCount = negativeWords.filter(w => allContent.includes(w)).length;
      
      if (positiveCount > negativeCount) sentiment = 'positive';
      else if (negativeCount > positiveCount) sentiment = 'negative';

      // Gerar resumo baseado em templates
      const summaryTemplates = [
        `Conversa com ${contactName} contendo ${messages.length} mensagens trocadas.`,
        `Atendimento a ${contactName} com ${inboundMessages.length} mensagens recebidas e ${outboundMessages.length} enviadas.`,
        `Interação com ${contactName} ao longo do período analisado.`
      ];

      const keyPointsTemplates = [
        'Cliente iniciou contato',
        'Informações foram solicitadas',
        'Atendente forneceu orientações',
        'Documentos/mídia foram compartilhados',
        'Conversa em andamento'
      ];

      const actionItemsTemplates = [
        'Acompanhar resolução em 24h',
        'Verificar satisfação do cliente',
        'Atualizar cadastro se necessário'
      ];

      const result = {
        summary: summaryTemplates[Math.floor(Math.random() * summaryTemplates.length)],
        key_points: keyPointsTemplates.slice(0, 3 + Math.floor(Math.random() * 2)),
        action_items: actionItemsTemplates.slice(0, 1 + Math.floor(Math.random() * 2)),
        sentiment: sentiment
      };

      // Salvar resumo heurístico
      const { data: savedSummary, error: saveError } = await supabase
        .from('whatsapp_conversation_summaries')
        .insert({
          conversation_id: conversationId,
          summary: result.summary,
          key_points: result.key_points,
          action_items: result.action_items,
          sentiment_at_time: result.sentiment,
          messages_count: messages.length,
          period_start: messages[messages.length - 1].timestamp,
          period_end: messages[0].timestamp,
        })
        .select()
        .single();

      if (saveError) throw saveError;

      console.log('Resumo heurístico salvo com sucesso');

      return new Response(
        JSON.stringify({ success: true, summary: savedSummary, source: 'heuristic' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Formatar mensagens para IA (fluxo normal com API key)
    const messagesText = messages
      .reverse()
      .map((m) => `[${m.is_from_me ? 'Atendente' : 'Cliente'}]: ${m.content}`)
      .join('\n');

    const prompt = `Analise esta conversa de WhatsApp e gere um resumo estruturado.

**Conversa com: ${contactName}**

${messagesText}

**Instruções:**
1. Crie um resumo conciso (máx 200 palavras) do que foi discutido
2. Liste os pontos-chave da conversa (máx 5)
3. Identifique ações pendentes ou próximos passos (máx 3)
4. Avalie o sentimento geral: "positive", "neutral" ou "negative"

Retorne APENAS um JSON válido sem markdown:
{
  "summary": "Resumo da conversa...",
  "key_points": ["Ponto 1", "Ponto 2"],
  "action_items": ["Ação 1", "Ação 2"],
  "sentiment": "positive"
}`;

    // 5. Chamar Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente de atendimento ao cliente. Gere resumos objetivos e úteis. Sempre responda com JSON válido sem formatação markdown.'
          },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições atingido. Tente novamente mais tarde.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos à sua workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Erro na geração: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;

    console.log('Resposta da IA:', aiContent);

    // Extrair JSON
    let result;
    try {
      result = JSON.parse(aiContent);
    } catch {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Resposta da IA não contém JSON válido');
      }
    }

    // 6. Salvar resumo
    const { data: savedSummary, error: saveError } = await supabase
      .from('whatsapp_conversation_summaries')
      .insert({
        conversation_id: conversationId,
        summary: result.summary,
        key_points: result.key_points || [],
        action_items: result.action_items || [],
        sentiment_at_time: result.sentiment,
        messages_count: messages.length,
        period_start: messages[0].timestamp,
        period_end: messages[messages.length - 1].timestamp,
      })
      .select()
      .single();

    if (saveError) throw saveError;

    console.log('Resumo salvo com sucesso');

    return new Response(
      JSON.stringify({ success: true, summary: savedSummary, source: 'ai' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro ao gerar resumo:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
