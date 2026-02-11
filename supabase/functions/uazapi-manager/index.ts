import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Auth validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Unauthorized');

    const body = await req.json();
    const { action, name, instance_name, phoneNumber, instanceId } = body;
    let { webhookUrl } = body;

    // Default webhook if missing
    if (!webhookUrl && supabaseUrl) {
      webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
    }

    // Global Configs from Secrets or project_config table
    let adminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN');
    let baseUrl = Deno.env.get('UAZAPI_BASE_URL') || 'https://api.uzapi.com.br';
    let username = Deno.env.get('UAZAPI_USERNAME');

    // If missing in env, try database
    if (!adminToken || !username) {
      console.log('[uazapi-manager] Config missing in env, checking project_config table...');
      const { data: dbConfig } = await supabaseAdmin
        .from('project_config')
        .select('key, value')
        .in('key', ['uazapi_admin_token', 'uazapi_username', 'uazapi_base_url']);
      
      if (dbConfig) {
        const tokenVal = dbConfig.find(c => c.key === 'uazapi_admin_token')?.value;
        const userVal = dbConfig.find(c => c.key === 'uazapi_username')?.value;
        const urlVal = dbConfig.find(c => c.key === 'uazapi_base_url')?.value;
        
        if (tokenVal) adminToken = tokenVal;
        if (userVal) username = userVal;
        if (urlVal) baseUrl = urlVal;
      }
    }

    if (!adminToken || !username) {
      throw new Error('UAZAPI global configuration missing (Admin Token or Username)');
    }

    if (action === 'create-instance') {
      console.log(`[uazapi-manager] Creating instance: ${instance_name} for user: ${user.id}`);

      // 1. Create Deployment in UazAPI
      const createResponse = await fetch(`${baseUrl}/${username}/v1/instance/add`, {
        method: 'POST',
        headers: {
          'admintoken': adminToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          appVersion: 'latest',
          authenticationMethod: 'QRCode',
          phoneNumber: phoneNumber || '',
          webhook: webhookUrl || '',
          resources: {
            requests: { cpu: '100m', memory: '128Mi' },
            limits: { cpu: '200m', memory: '512Mi' }
          }
        })
      });

      const createData = await createResponse.json();
      console.log('[uazapi-manager] UazAPI Create Response:', createData);

      if (!createResponse.ok) {
        throw new Error(createData.message || createData.error || 'Failed to create instance in UazAPI');
      }

      // The response usually contains the password/token for the new instance
      const instanceToken = createData.token || createData.password || createData.data?.token || createData.data?.password;
      const phoneNumberId = createData.phoneNumberId || createData.data?.phoneNumberId || createData.instanceId || createData.data?.instanceId || instance_name;

      // 2. Save in Database
      const { data: instance, error: dbError } = await supabaseAdmin
        .from('whatsapp_instances')
        .insert({
          name: name || instance_name,
          instance_name: instance_name,
          instance_id_external: phoneNumberId,
          provider_type: 'uzapi',
          status: 'connecting',
          metadata: { 
            waba_id: createData.wabaId || createData.data?.wabaId || null,
            uazapi_data: createData 
          }
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // 3. Save Secrets
      const { error: secretError } = await supabaseAdmin
        .from('whatsapp_instance_secrets')
        .insert({
          instance_id: instance.id,
          api_url: username, // For UazAPI we store the tenant username here
          api_key: instanceToken
        });

      if (secretError) throw secretError;

      return new Response(JSON.stringify({ success: true, instance }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get-qrcode') {
      // Fetch secrets
      const { data: secrets } = await supabaseAdmin
        .from('whatsapp_instance_secrets')
        .select('api_key, api_url')
        .eq('instance_id', instanceId)
        .single();

      const { data: inst } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('instance_id_external, instance_name')
        .eq('id', instanceId)
        .single();

      if (!secrets || !inst) throw new Error('Instance not found');

      const identifier = inst.instance_id_external || inst.instance_name;
      console.log(`[uazapi-manager] Fetching QR for: ${identifier} (Tenant: ${secrets.api_url})`);

      // 1. Get deployment ID if not already saved (sometimes uazapi needs it)
      // 2. Fetch QR data
      const endpoints = [
        `${baseUrl}/${secrets.api_url}/v1/${identifier}/instance`,
        `${baseUrl}/${secrets.api_url}/v1/${identifier}/status`,
        `${baseUrl}/api/v1/instance/${identifier}/qrcode`
      ];

      let qrData: any = null;
      let lastError: any = null;

      for (const url of endpoints) {
        try {
          console.log(`[uazapi-manager] Trying QR endpoint: ${url}`);
          const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${secrets.api_key}` }
          });
          
          if (response.ok) {
            const data = await response.json();
            // Check if it contains QR data
            if (data.qrcode || data.base64 || data.data?.qrcode || data.data?.base64 || data.instance?.qrcode) {
              qrData = data;
              console.log(`[uazapi-manager] Found QR data at ${url}`);
              break;
            }
          }
        } catch (e) {
          lastError = e;
        }
      }

      if (!qrData && lastError) throw lastError;
      if (!qrData) qrData = { error: 'QR Code not available yet. Make sure instance is connecting.' };

      // Normalization for frontend
      let normalizedQr = qrData.qrcode || qrData.base64 || qrData.data?.qrcode || qrData.data?.base64 || qrData.instance?.qrcode;
      
      // If it's a raw base64 string, add the data URL prefix
      if (typeof normalizedQr === 'string' && normalizedQr.length > 100 && !normalizedQr.startsWith('http') && !normalizedQr.startsWith('data:')) {
        normalizedQr = `data:image/png;base64,${normalizedQr}`;
      }

      return new Response(JSON.stringify({ ...qrData, qrcode: normalizedQr }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error('Invalid action');

  } catch (error: any) {
    console.error('[uazapi-manager] Catch Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
