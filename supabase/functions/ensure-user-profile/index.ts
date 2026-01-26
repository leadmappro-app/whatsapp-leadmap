import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from JWT using getClaims
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('❌ Missing or invalid authorization header');
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Create client with user's token for getClaims
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('❌ Invalid JWT:', claimsError);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = claimsData.claims.sub;
    const userEmail = claimsData.claims.email as string | undefined;

    console.log('🔍 Checking profile/role for user:', userId);

    let profileCreated = false;
    let roleCreated = false;
    let profileAutoApproved = false;

    // Check if approval is required
    const { data: approvalConfig } = await supabaseAdmin
      .from('project_config')
      .select('value')
      .eq('key', 'require_account_approval')
      .maybeSingle();

    const requireApproval = approvalConfig?.value === 'true';
    console.log('📋 Approval config:', { requireApproval });

    // Count existing profiles to determine if first user
    const { count: profileCount } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const isFirstUser = profileCount === null || profileCount === 0;
    console.log('👤 Profile count:', profileCount, 'Is first user:', isFirstUser);

    // Check if profile exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, is_approved')
      .eq('id', userId)
      .maybeSingle();

    if (!existingProfile) {
      console.log('⚠️ Profile missing, creating...');
      
      // First user always approved; others depend on config
      const isApproved = isFirstUser ? true : !requireApproval;
      console.log('📝 Creating profile with is_approved:', isApproved);
      
      // Create profile
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          full_name: userEmail?.split('@')[0] || 'Usuário',
          email: userEmail,
          is_active: true,
          is_approved: isApproved
        });

      if (profileError) {
        console.error('❌ Error creating profile:', profileError);
      } else {
        profileCreated = true;
        console.log('✅ Profile created with is_approved:', isApproved);
      }
    } else {
      // Profile exists - check if first/only user needs auto-approval fix
      // This handles cases where profile was created without is_approved
      if (existingProfile.is_approved === false || existingProfile.is_approved === null) {
        // Re-count to check if this is the only user
        const { count: totalProfiles } = await supabaseAdmin
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        // If only one profile exists and it's not approved, auto-approve (first admin fix)
        if (totalProfiles === 1) {
          console.log('🔧 Auto-approving first/only user...');
          const { error: approveError } = await supabaseAdmin
            .from('profiles')
            .update({ is_approved: true })
            .eq('id', userId);

          if (!approveError) {
            profileAutoApproved = true;
            console.log('✅ First user auto-approved');
          } else {
            console.error('❌ Error auto-approving:', approveError);
          }
        }
      }
    }

    // Check if role exists
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingRole) {
      console.log('⚠️ Role missing, assigning...');
      
      // Re-count profiles after potential creation
      const { count: currentProfileCount } = await supabaseAdmin
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const assignedRole = (currentProfileCount === null || currentProfileCount <= 1) ? 'admin' : 'agent';
      console.log(`📝 Assigning role: ${assignedRole} (total profiles: ${currentProfileCount})`);

      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: userId,
          role: assignedRole
        });

      if (roleError) {
        console.error('❌ Error creating role:', roleError);
      } else {
        roleCreated = true;
        console.log(`✅ Role ${assignedRole} assigned`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      profileCreated,
      roleCreated,
      profileAutoApproved,
      existingProfile: !!existingProfile,
      existingRole: !!existingRole
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
