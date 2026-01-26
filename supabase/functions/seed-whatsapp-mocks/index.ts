import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SeedRequest {
  reset?: boolean;
  instanceId?: string;
}

interface CoverageReport {
  instances: number;
  contacts: number;
  conversations: number;
  messages: number;
  message_types: {
    text: number;
    image: number;
    document: number;
    audio: number;
    video: number;
  };
  macros: number;
  sentiment_rows: number;
  summaries: number;
  notes: number;
  pinned_notes: number;
  conversations_with_unread: number;
}

const MINIMUMS = {
  contacts: 6,
  conversations: 8,
  messages: 60,
  message_types: { text: 20, image: 5, document: 3, audio: 3, video: 2 },
  macros: 8,
  sentiment_rows: 6,
  summaries: 6,
  notes: 8,
  pinned_notes: 2,
  conversations_with_unread: 3
};

// Mock assets - minimal valid files encoded in base64
// PNG 100x100 blue solid
const MOCK_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAARklEQVR42u3QMQEAAAgDILV/51nBzwci0JlKJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFI9F4W6QIBBQ5LeQQAAAAASUVORK5CYII=';

// PDF minimal valid document  
const MOCK_PDF_BASE64 = 'JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKL01lZGlhQm94IFswIDAgNjEyIDc5Ml0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovUmVzb3VyY2VzIDw8Pj4KPj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxNDggMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA0Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgoyMjEKJSVFT0YK';

// WAV 1 second silence (minimal valid)
const MOCK_WAV_BASE64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

// MP4 minimal valid container
const MOCK_MP4_BASE64 = 'AAAAGGZ0eXBtcDQyAAAAAG1wNDJpc29tAAAACGZyZWUAAAAYbWRhdAAAAAAAAAAAAAAAAAAAAAAAAChtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAA+gAAAAoAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEhkYXQAAAAUdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAA==';

// Helper to generate random phone numbers
function generatePhone(): string {
  const ddd = ['11', '21', '31', '41', '51', '61', '71', '81'][Math.floor(Math.random() * 8)];
  const number = Math.floor(Math.random() * 900000000 + 100000000);
  return `55${ddd}${number}`;
}

// Mock contact names
const contactNames = [
  "Maria Silva", "João Santos", "Ana Oliveira", "Pedro Costa", 
  "Carla Souza", "Lucas Pereira", "Julia Lima", "Rafael Almeida",
  "Fernanda Rodrigues", "Bruno Ferreira", "Camila Martins", "Diego Nascimento"
];

// Message templates
const clientMessages = [
  "Olá, preciso de ajuda",
  "Bom dia! Vocês têm disponibilidade?",
  "Quanto custa o serviço?",
  "Gostaria de agendar uma visita",
  "Obrigado pelo atendimento!",
  "Perfeito, vamos prosseguir",
  "Tenho uma dúvida sobre meu pedido",
  "Quando posso esperar a entrega?",
  "O produto chegou com defeito",
  "Preciso falar com o responsável",
  "Vocês aceitam PIX?",
  "Qual o prazo de garantia?",
  "Podem me enviar o orçamento?",
  "Estou satisfeito com o resultado",
  "Não era isso que eu esperava",
  "Já fiz o pagamento",
  "Aguardando retorno urgente",
  "Excelente trabalho!",
];

const agentMessages = [
  "Olá! Como posso ajudar?",
  "Bom dia! Fico feliz em atendê-lo.",
  "Claro, vou verificar isso para você.",
  "O valor é R$ 150,00 com desconto.",
  "Posso agendar para amanhã às 14h?",
  "Entendo sua preocupação, vamos resolver.",
  "Seu pedido está em processamento.",
  "A entrega será em 3 dias úteis.",
  "Lamento pelo inconveniente. Vamos trocar.",
  "Vou transferir para o supervisor.",
  "Sim, aceitamos PIX, cartão e boleto.",
  "A garantia é de 12 meses.",
  "Segue o orçamento em anexo.",
  "Ficamos muito felizes com seu feedback!",
  "Pode me detalhar melhor o problema?",
  "Pagamento confirmado, obrigado!",
  "Entendido, já estou providenciando.",
  "Qualquer dúvida, estamos à disposição!",
];

// Macro templates
const macroTemplates = [
  { shortcut: "bv", name: "Boas vindas", content: "Olá! Bem-vindo(a) ao nosso atendimento. Como posso ajudá-lo(a) hoje?", category: "saudacao" },
  { shortcut: "docs", name: "Solicitar documentos", content: "Para prosseguirmos, preciso que envie os seguintes documentos: RG, CPF e comprovante de residência.", category: "solicitacao" },
  { shortcut: "agendar", name: "Agendar visita", content: "Perfeito! Posso agendar uma visita para você. Qual data e horário seria melhor?", category: "agendamento" },
  { shortcut: "pix", name: "Dados PIX", content: "Nosso PIX: contato@empresa.com.br\nApós o pagamento, envie o comprovante aqui.", category: "financeiro" },
  { shortcut: "prazo", name: "Prazo de entrega", content: "O prazo de entrega é de 5 a 10 dias úteis após a confirmação do pagamento.", category: "informacao" },
  { shortcut: "garantia", name: "Garantia do produto", content: "Nossos produtos possuem garantia de 12 meses contra defeitos de fabricação.", category: "informacao" },
  { shortcut: "suporte", name: "Suporte técnico", content: "Para suporte técnico, descreva detalhadamente o problema e envie prints se possível.", category: "suporte" },
  { shortcut: "encerrar", name: "Encerrar atendimento", content: "Posso ajudar em mais alguma coisa? Se não, agradeço pelo contato!", category: "finalizacao" },
  { shortcut: "aguarde", name: "Aguarde retorno", content: "Estou verificando isso para você. Aguarde um momento, por favor.", category: "geral" },
  { shortcut: "horario", name: "Horário de funcionamento", content: "Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.", category: "informacao" },
  { shortcut: "obrigado", name: "Agradecimento", content: "Obrigado pela confiança! Estamos à disposição. 🙏", category: "finalizacao" },
  { shortcut: "promo", name: "Promoção atual", content: "Temos 20% de desconto em todos os produtos até o final do mês! Aproveite!", category: "vendas" },
];

// Note contents
const noteContents = [
  'Cliente VIP - prioridade alta',
  'Aguardando documentação',
  'Pedido especial solicitado',
  'Reclamação em andamento - acompanhar',
  'Potencial cliente para upsell',
  'Precisa de follow-up em 3 dias',
  'Interessado em plano premium',
  'Solicitou desconto especial',
  'Indicado por outro cliente',
  'Primeira compra - conquistar fidelidade',
];

// Upload mock assets to Supabase Storage
async function uploadMockAssets(supabase: any): Promise<Record<string, string>> {
  const assets = [
    { name: 'mock.png', base64: MOCK_PNG_BASE64, mimetype: 'image/png' },
    { name: 'mock.pdf', base64: MOCK_PDF_BASE64, mimetype: 'application/pdf' },
    { name: 'mock.wav', base64: MOCK_WAV_BASE64, mimetype: 'audio/wav' },
    { name: 'mock.mp4', base64: MOCK_MP4_BASE64, mimetype: 'video/mp4' },
  ];
  
  const urls: Record<string, string> = {};
  
  // Ensure bucket exists (ignore error if already exists)
  await supabase.storage.createBucket('whatsapp-media', { public: true }).catch(() => {});
  
  for (const asset of assets) {
    try {
      const bytes = Uint8Array.from(atob(asset.base64), c => c.charCodeAt(0));
      const path = `mock/${asset.name}`;
      
      // Upload with upsert for idempotency
      await supabase.storage
        .from('whatsapp-media')
        .upload(path, bytes, {
          contentType: asset.mimetype,
          upsert: true
        });
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(path);
      
      urls[asset.name] = publicUrl;
      console.log(`[seed-whatsapp-mocks] Uploaded ${asset.name}: ${publicUrl}`);
    } catch (err) {
      console.error(`[seed-whatsapp-mocks] Error uploading ${asset.name}:`, err);
    }
  }
  
  return urls;
}

// Validate coverage meets minimums
function validateCoverage(coverage: CoverageReport): void {
  const errors: string[] = [];
  
  if (coverage.contacts < MINIMUMS.contacts) 
    errors.push(`Contatos: ${coverage.contacts}/${MINIMUMS.contacts}`);
  if (coverage.conversations < MINIMUMS.conversations) 
    errors.push(`Conversas: ${coverage.conversations}/${MINIMUMS.conversations}`);
  if (coverage.messages < MINIMUMS.messages) 
    errors.push(`Mensagens: ${coverage.messages}/${MINIMUMS.messages}`);
  if (coverage.message_types.text < MINIMUMS.message_types.text) 
    errors.push(`Textos: ${coverage.message_types.text}/${MINIMUMS.message_types.text}`);
  if (coverage.message_types.image < MINIMUMS.message_types.image) 
    errors.push(`Imagens: ${coverage.message_types.image}/${MINIMUMS.message_types.image}`);
  if (coverage.message_types.document < MINIMUMS.message_types.document) 
    errors.push(`Documentos: ${coverage.message_types.document}/${MINIMUMS.message_types.document}`);
  if (coverage.message_types.audio < MINIMUMS.message_types.audio) 
    errors.push(`Áudios: ${coverage.message_types.audio}/${MINIMUMS.message_types.audio}`);
  if (coverage.message_types.video < MINIMUMS.message_types.video) 
    errors.push(`Vídeos: ${coverage.message_types.video}/${MINIMUMS.message_types.video}`);
  if (coverage.macros < MINIMUMS.macros) 
    errors.push(`Macros: ${coverage.macros}/${MINIMUMS.macros}`);
  if (coverage.sentiment_rows < MINIMUMS.sentiment_rows) 
    errors.push(`Sentimentos: ${coverage.sentiment_rows}/${MINIMUMS.sentiment_rows}`);
  if (coverage.summaries < MINIMUMS.summaries) 
    errors.push(`Resumos: ${coverage.summaries}/${MINIMUMS.summaries}`);
  if (coverage.notes < MINIMUMS.notes) 
    errors.push(`Notas: ${coverage.notes}/${MINIMUMS.notes}`);
  if (coverage.pinned_notes < MINIMUMS.pinned_notes) 
    errors.push(`Notas fixadas: ${coverage.pinned_notes}/${MINIMUMS.pinned_notes}`);
  if (coverage.conversations_with_unread < MINIMUMS.conversations_with_unread) 
    errors.push(`Conversas não lidas: ${coverage.conversations_with_unread}/${MINIMUMS.conversations_with_unread}`);
  
  if (errors.length > 0) {
    throw new Error(`Coverage insuficiente:\n${errors.join('\n')}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token from request (case-insensitive)
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Authorization required', details: { authMethodTried: 'none' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Client "admin" (service role) – usado também pro restante do seed
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    let authMethod = 'getUser(token)';
    let user = null as any;

    // Método 1: getUser(token) com SERVICE_ROLE
    const { data: m1Data, error: m1Error } = await supabase.auth.getUser(token);
    if (m1Data?.user) user = m1Data.user;

    if (!user) {
      // Método 2: Fallback com global headers
      authMethod = 'globalHeaders';
      const authClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const { data: m2Data, error: m2Error } = await authClient.auth.getUser();
      if (m2Data?.user) user = m2Data.user;

      if (!user) {
        // Ambos falharam — logar diagnóstico
        let jwtPayload: any = {};
        try { jwtPayload = JSON.parse(atob(token.split('.')[1])); } catch (_) {}

        console.error('[seed-whatsapp-mocks] Auth failed:', {
          method1Error: m1Error?.message,
          method2Error: m2Error?.message,
          supabaseHost: new URL(supabaseUrl).host,
          jwtIss: jwtPayload.iss,
          jwtSub: jwtPayload.sub,
          jwtExp: jwtPayload.exp,
          nowTimestamp: Math.floor(Date.now() / 1000),
        });

        return new Response(
          JSON.stringify({
            error: 'Invalid token',
            details: {
              authMethodTried: 'both',
              method1Error: m1Error?.message,
              method2Error: m2Error?.message,
            },
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('[seed-whatsapp-mocks] Auth success via:', authMethod, 'user:', user.id);

    const body: SeedRequest = await req.json().catch(() => ({}));
    console.log('[seed-whatsapp-mocks] Starting seed for user:', user.id, 'reset:', body.reset);

    // Upload mock assets to storage first
    console.log('[seed-whatsapp-mocks] Uploading mock media assets...');
    const mediaUrls = await uploadMockAssets(supabase);
    console.log('[seed-whatsapp-mocks] Media URLs:', mediaUrls);

    let instanceId: string;

    // If instanceId is provided, use that specific instance
    if (body.instanceId) {
      const { data: specifiedInstance, error: specError } = await supabase
        .from('whatsapp_instances')
        .select('id, provider_type')
        .eq('id', body.instanceId)
        .single();

      if (specError || !specifiedInstance) {
        return new Response(
          JSON.stringify({ error: 'Instance not found', instanceId: body.instanceId }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      instanceId = specifiedInstance.id;
      console.log('[seed-whatsapp-mocks] Using specified instance:', instanceId);

      if (body.reset) {
        // Delete existing data for this instance
        console.log('[seed-whatsapp-mocks] Resetting data for specified instance...');
        
        const { data: conversations } = await supabase
          .from('whatsapp_conversations')
          .select('id')
          .eq('instance_id', instanceId);

        const convIds = conversations?.map(c => c.id) || [];

        if (convIds.length > 0) {
          await supabase.from('whatsapp_messages').delete().in('conversation_id', convIds);
          await supabase.from('whatsapp_sentiment_analysis').delete().in('conversation_id', convIds);
          await supabase.from('whatsapp_sentiment_history').delete().in('conversation_id', convIds);
          await supabase.from('whatsapp_topics_history').delete().in('conversation_id', convIds);
          await supabase.from('whatsapp_conversation_summaries').delete().in('conversation_id', convIds);
          await supabase.from('whatsapp_conversation_notes').delete().in('conversation_id', convIds);
          await supabase.from('whatsapp_reactions').delete().in('conversation_id', convIds);
        }

        await supabase.from('whatsapp_conversations').delete().eq('instance_id', instanceId);
        await supabase.from('whatsapp_contacts').delete().eq('instance_id', instanceId);
        await supabase.from('whatsapp_macros').delete().eq('instance_id', instanceId);
      }
    } else {
      // Check if mock instance already exists
      const { data: existingInstance } = await supabase
        .from('whatsapp_instances')
        .select('id')
        .eq('provider_type', 'mock')
        .single();

    if (existingInstance && body.reset) {
      // Delete existing mock data
      console.log('[seed-whatsapp-mocks] Resetting existing mock data...');
      
      // Get conversations to delete related data
      const { data: conversations } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('instance_id', existingInstance.id);

      const convIds = conversations?.map(c => c.id) || [];

      if (convIds.length > 0) {
        await supabase.from('whatsapp_messages').delete().in('conversation_id', convIds);
        await supabase.from('whatsapp_sentiment_analysis').delete().in('conversation_id', convIds);
        await supabase.from('whatsapp_sentiment_history').delete().in('conversation_id', convIds);
        await supabase.from('whatsapp_topics_history').delete().in('conversation_id', convIds);
        await supabase.from('whatsapp_conversation_summaries').delete().in('conversation_id', convIds);
        await supabase.from('whatsapp_conversation_notes').delete().in('conversation_id', convIds);
        await supabase.from('whatsapp_reactions').delete().in('conversation_id', convIds);
      }

      await supabase.from('whatsapp_conversations').delete().eq('instance_id', existingInstance.id);
      await supabase.from('whatsapp_contacts').delete().eq('instance_id', existingInstance.id);
      await supabase.from('whatsapp_macros').delete().eq('instance_id', existingInstance.id);
      
      instanceId = existingInstance.id;
      console.log('[seed-whatsapp-mocks] Reusing instance:', instanceId);
    } else if (existingInstance) {
      instanceId = existingInstance.id;
      console.log('[seed-whatsapp-mocks] Using existing instance:', instanceId);
    } else {
      // Create mock instance
      const tempInstanceId = crypto.randomUUID();
      
      const { data: newInstance, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .insert({
          id: tempInstanceId,
          name: 'Mock Instance',
          instance_name: 'mock-01',
          provider_type: 'mock',
          status: 'connected',
          qr_code: null,
          metadata: { 
            provider: 'mock', 
            phone: '+5511999999999',
            displayName: 'Mock WhatsApp'
          },
        })
        .select()
        .single();

      if (instanceError) {
        console.error('[seed-whatsapp-mocks] Error creating instance:', instanceError);
        throw instanceError;
      }

      // Create secrets for instance
      await supabase
        .from('whatsapp_instance_secrets')
        .insert({
          instance_id: newInstance.id,
          api_url: 'mock://local',
          api_key: 'mock',
        });

      instanceId = newInstance.id;
      console.log('[seed-whatsapp-mocks] Created new instance:', instanceId);
    }
    } // Close the else block for non-specified instanceId

    // Initialize coverage tracking
    const messageTypeCounts = { text: 0, image: 0, document: 0, audio: 0, video: 0 };
    let totalMessages = 0;
    let sentimentCount = 0;
    let summaryCount = 0;
    let notesCount = 0;
    let pinnedNotesCount = 0;
    let unreadConvCount = 0;

    // Create contacts (10 minimum)
    const numContacts = 10;
    const contacts: any[] = [];
    
    for (let i = 0; i < numContacts; i++) {
      const { data: contact, error } = await supabase
        .from('whatsapp_contacts')
        .insert({
          instance_id: instanceId,
          name: contactNames[i % contactNames.length] + (i >= contactNames.length ? ` ${i + 1}` : ''),
          phone_number: generatePhone() + '@s.whatsapp.net',
          is_group: false,
          metadata: { mock: true },
        })
        .select()
        .single();
      
      if (contact) contacts.push(contact);
    }
    console.log('[seed-whatsapp-mocks] Created contacts:', contacts.length);

    // Create conversations (10 minimum)
    // Guard Rail: 60% assigned to user, 40% NULL (queue) - NO random UUIDs
    const numConversations = 10;
    const conversations: any[] = [];
    const statuses = ['active', 'active', 'active', 'active', 'active', 'resolved', 'resolved', 'archived'];

    for (let i = 0; i < numConversations && i < contacts.length; i++) {
      // Guard Rail: Safe assignment - 60% user, 40% null
      let assignedTo: string | null = null;
      if (i < Math.floor(numConversations * 0.6)) {
        assignedTo = user.id; // 60% assigned to current user
      } else {
        assignedTo = null; // 40% in queue (visible to all)
      }
      
      const { data: conversation, error } = await supabase
        .from('whatsapp_conversations')
        .insert({
          instance_id: instanceId,
          contact_id: contacts[i].id,
          status: statuses[i % statuses.length],
          assigned_to: assignedTo,
          last_message_at: new Date().toISOString(),
          last_message_preview: 'Carregando...',
          unread_count: 0,
          metadata: { mock: true },
        })
        .select()
        .single();
      
      if (conversation) conversations.push(conversation);
    }
    console.log('[seed-whatsapp-mocks] Created conversations:', conversations.length);
    console.log('[seed-whatsapp-mocks] Assigned to user:', Math.floor(numConversations * 0.6), 'In queue:', numConversations - Math.floor(numConversations * 0.6));

    // Create messages with MANDATORY PACKAGE per conversation
    for (let convIndex = 0; convIndex < conversations.length; convIndex++) {
      const conv = conversations[convIndex];
      const contact = contacts.find(c => c.id === conv.contact_id);
      const remoteJid = contact?.phone_number || 'unknown';
      const messages: any[] = [];
      
      // Start time for this conversation (7 days ago to now, distributed)
      let msgTime = new Date();
      msgTime.setDate(msgTime.getDate() - 7 + convIndex); // Distribute across 7 days
      
      // MANDATORY PACKAGE: Each conversation must have these message types
      const mandatoryPackage = [
        // Text messages - at least 4 per conversation
        { is_from_me: false, message_type: 'text', content: clientMessages[convIndex % clientMessages.length] },
        { is_from_me: true, message_type: 'text', content: agentMessages[convIndex % agentMessages.length] },
        { is_from_me: false, message_type: 'text', content: clientMessages[(convIndex + 1) % clientMessages.length] },
        { is_from_me: true, message_type: 'text', content: agentMessages[(convIndex + 1) % agentMessages.length] },
        // Media messages - 1 of each type
        { is_from_me: false, message_type: 'image', content: '[Imagem]', media_url: mediaUrls['mock.png'], media_mimetype: 'image/png' },
        { is_from_me: true, message_type: 'document', content: '[Documento]', media_url: mediaUrls['mock.pdf'], media_mimetype: 'application/pdf' },
        { is_from_me: false, message_type: 'audio', content: '[Áudio]', media_url: mediaUrls['mock.wav'], media_mimetype: 'audio/wav' },
        { is_from_me: true, message_type: 'video', content: '[Vídeo]', media_url: mediaUrls['mock.mp4'], media_mimetype: 'video/mp4' },
      ];
      
      // Generate message IDs first so we can reference them for quotes
      const messageIds: string[] = [];
      for (let i = 0; i < mandatoryPackage.length + 4; i++) {
        messageIds.push(`mock_${conv.id.slice(0, 8)}_${i}_${Date.now()}`);
      }
      
      // Create mandatory messages
      for (let i = 0; i < mandatoryPackage.length; i++) {
        const pkg = mandatoryPackage[i];
        msgTime = new Date(msgTime.getTime() + (10 + Math.random() * 30) * 60 * 1000); // 10-40 min apart
        
        const msg: any = {
          conversation_id: conv.id,
          message_id: messageIds[i],
          remote_jid: remoteJid,
          content: pkg.content,
          message_type: pkg.message_type,
          media_url: pkg.media_url || null,
          media_mimetype: pkg.media_mimetype || null,
          is_from_me: pkg.is_from_me,
          status: pkg.is_from_me ? ['sent', 'delivered', 'read'][Math.floor(Math.random() * 3)] : 'delivered',
          timestamp: msgTime.toISOString(),
          quoted_message_id: null,
        };
        
        // Add quoted_message_id to 5th message (referencing 1st message)
        if (i === 4 && messageIds.length > 0) {
          msg.quoted_message_id = messageIds[0];
        }
        
        messages.push(msg);
        messageTypeCounts[pkg.message_type as keyof typeof messageTypeCounts]++;
      }
      
      // Add 4 more random text messages for variety
      for (let i = 0; i < 4; i++) {
        const isFromMe = i % 2 === 0;
        msgTime = new Date(msgTime.getTime() + (5 + Math.random() * 20) * 60 * 1000);
        
        messages.push({
          conversation_id: conv.id,
          message_id: messageIds[mandatoryPackage.length + i],
          remote_jid: remoteJid,
          content: isFromMe 
            ? agentMessages[(convIndex + i + 2) % agentMessages.length]
            : clientMessages[(convIndex + i + 2) % clientMessages.length],
          message_type: 'text',
          media_url: null,
          media_mimetype: null,
          is_from_me: isFromMe,
          status: isFromMe ? ['sent', 'delivered', 'read', 'failed'][Math.floor(Math.random() * 4)] : 'delivered',
          timestamp: msgTime.toISOString(),
          quoted_message_id: null,
        });
        messageTypeCounts.text++;
      }

      // Insert all messages for this conversation
      if (messages.length > 0) {
        const { error: msgError } = await supabase.from('whatsapp_messages').insert(messages);
        if (msgError) console.error('[seed-whatsapp-mocks] Error inserting messages:', msgError);
        totalMessages += messages.length;
        
        // EXPLICIT UPDATE: last_message_at, last_message_preview, unread_count
        const lastMsg = messages[messages.length - 1];
        const inboundMessages = messages.filter(m => !m.is_from_me);
        
        // Guard Rail: Set unread > 0 for first 4 conversations (to meet minimum 3)
        const shouldHaveUnread = convIndex < 4;
        const unreadCount = shouldHaveUnread ? (2 + Math.floor(Math.random() * 4)) : 0;
        if (shouldHaveUnread) unreadConvCount++;
        
        await supabase
          .from('whatsapp_conversations')
          .update({
            last_message_at: lastMsg.timestamp,
            last_message_preview: lastMsg.message_type === 'text' 
              ? lastMsg.content.substring(0, 100) 
              : `[${lastMsg.message_type === 'image' ? 'Imagem' : lastMsg.message_type === 'document' ? 'Documento' : lastMsg.message_type === 'audio' ? 'Áudio' : 'Vídeo'}]`,
            unread_count: unreadCount
          })
          .eq('id', conv.id);
      }
    }
    console.log('[seed-whatsapp-mocks] Created messages:', totalMessages);
    console.log('[seed-whatsapp-mocks] Message types:', messageTypeCounts);

    // Create macros (12 total, meeting minimum of 8)
    const macrosToInsert = macroTemplates.map((m, i) => ({
      ...m,
      instance_id: instanceId,
      is_active: true,
      usage_count: Math.floor(Math.random() * 50),
    }));

    const { error: macroError } = await supabase.from('whatsapp_macros').insert(macrosToInsert);
    if (macroError) console.error('[seed-whatsapp-mocks] Error inserting macros:', macroError);
    console.log('[seed-whatsapp-mocks] Created macros:', macrosToInsert.length);

    // Create sentiment analysis for 8 conversations (meeting minimum of 6)
    const sentiments: Array<'positive' | 'neutral' | 'negative'> = ['positive', 'neutral', 'negative'];
    const sentimentDescriptions = {
      positive: 'Cliente satisfeito com o atendimento, demonstra confiança e interesse.',
      neutral: 'Conversa neutra, cliente busca informações sem demonstrar emoção específica.',
      negative: 'Cliente demonstra insatisfação ou frustração, requer atenção especial.',
    };

    for (let i = 0; i < Math.min(8, conversations.length); i++) {
      const conv = conversations[i];
      const sentiment = sentiments[i % sentiments.length];
      
      const { error: sentError } = await supabase.from('whatsapp_sentiment_analysis').upsert({
        conversation_id: conv.id,
        contact_id: conv.contact_id,
        sentiment,
        confidence_score: 0.75 + Math.random() * 0.2,
        summary: sentimentDescriptions[sentiment],
        reasoning: `Análise automática baseada nas últimas ${8 + i} mensagens da conversa.`,
        messages_analyzed: 8 + Math.floor(Math.random() * 8),
        metadata: { mock: true, analyzed_at: new Date().toISOString() },
      }, { onConflict: 'conversation_id' });
      
      if (!sentError) sentimentCount++;
    }
    console.log('[seed-whatsapp-mocks] Created sentiment analyses:', sentimentCount);

    // Create summaries for 8 conversations (meeting minimum of 6)
    for (let i = 0; i < Math.min(8, conversations.length); i++) {
      const conv = conversations[i];
      const contact = contacts.find(c => c.id === conv.contact_id);
      
      const { error: summaryError } = await supabase.from('whatsapp_conversation_summaries').insert({
        conversation_id: conv.id,
        summary: `Conversa com ${contact?.name || 'cliente'} sobre atendimento e solicitações. O cliente entrou em contato buscando informações e suporte.`,
        key_points: [
          'Cliente entrou em contato para tirar dúvidas',
          'Informações detalhadas foram fornecidas',
          'Atendimento foi realizado com sucesso',
          'Cliente demonstrou interesse em continuar'
        ],
        action_items: [
          'Enviar orçamento detalhado',
          'Agendar follow-up em 3 dias',
          'Verificar disponibilidade de produtos'
        ],
        sentiment_at_time: sentiments[i % sentiments.length],
        messages_count: 10 + Math.floor(Math.random() * 10),
        period_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        period_end: new Date().toISOString(),
      });
      
      if (!summaryError) summaryCount++;
    }
    console.log('[seed-whatsapp-mocks] Created summaries:', summaryCount);

    // Create notes for 10 conversations (meeting minimum of 8, with 3+ pinned)
    for (let i = 0; i < Math.min(10, conversations.length); i++) {
      const numNotes = i < 3 ? 3 : 2; // First 3 conversations get 3 notes, rest get 2
      
      for (let j = 0; j < numNotes; j++) {
        // First 3 conversations get a pinned note
        const isPinned = i < 3 && j === 0;
        if (isPinned) pinnedNotesCount++;
        
        const { error: noteError } = await supabase.from('whatsapp_conversation_notes').insert({
          conversation_id: conversations[i].id,
          content: noteContents[(i + j) % noteContents.length],
          is_pinned: isPinned,
        });
        
        if (!noteError) notesCount++;
      }
    }
    console.log('[seed-whatsapp-mocks] Created notes:', notesCount, '(pinned:', pinnedNotesCount, ')');

    // Build coverage report
    const coverage: CoverageReport = {
      instances: 1,
      contacts: contacts.length,
      conversations: conversations.length,
      messages: totalMessages,
      message_types: messageTypeCounts,
      macros: macrosToInsert.length,
      sentiment_rows: sentimentCount,
      summaries: summaryCount,
      notes: notesCount,
      pinned_notes: pinnedNotesCount,
      conversations_with_unread: unreadConvCount,
    };

    console.log('[seed-whatsapp-mocks] Coverage report:', coverage);

    // Validate coverage meets minimums
    validateCoverage(coverage);

    return new Response(
      JSON.stringify({
        success: true,
        instanceId,
        conversationIds: conversations.map(c => c.id),
        firstConversationId: conversations[0]?.id,
        coverage,
        stats: {
          contacts: contacts.length,
          conversations: conversations.length,
          messages: totalMessages,
          macros: macrosToInsert.length,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[seed-whatsapp-mocks] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
