import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Use POST.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return response({ error: 'Authentication is required.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: 'Reward service is not configured.' }, 500);
  }

  // Validate the caller's JWT without giving the request's user any elevated client.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return response({ error: 'Authentication is invalid.' }, 401);

  let body: { milestone_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return response({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (!isUuid(body.milestone_id)) {
    return response({ error: 'milestone_id must be a UUID.' }, 400);
  }

  // All reads below use the service client because grant creation is deliberately
  // inaccessible to normal authenticated clients. The user identity is still
  // always taken from the verified JWT, never from the request body.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: milestone, error: milestoneError } = await adminClient
    .from('reward_track_milestones')
    .select('id, track_id, points_required, name, reward_payload')
    .eq('id', body.milestone_id)
    .maybeSingle();
  if (milestoneError) return response({ error: milestoneError.message }, 500);
  if (!milestone) return response({ error: 'Milestone not found.' }, 404);

  const payload = milestone.reward_payload;
  const songId = payload && typeof payload === 'object' && !Array.isArray(payload)
    && payload.type === 'song' && typeof payload.song_id === 'string'
    ? payload.song_id.trim()
    : '';
  if (!songId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(songId)) {
    return response({ error: 'This milestone is not a valid song reward.' }, 400);
  }

  const [{ data: selection, error: selectionError }, { data: progress, error: progressError }, { data: grants, error: grantsError }] = await Promise.all([
    adminClient
      .from('user_reward_track_selections')
      .select('track_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    adminClient
      .from('user_reward_track_progress')
      .select('points')
      .eq('user_id', user.id)
      .eq('track_id', milestone.track_id)
      .maybeSingle(),
    adminClient
      .from('user_reward_grants')
      .select('id, milestone_id, reward_payload')
      .eq('user_id', user.id)
      .eq('track_id', milestone.track_id),
  ]);
  if (selectionError || progressError || grantsError) {
    return response({ error: (selectionError || progressError || grantsError)?.message }, 500);
  }
  if (selection?.track_id !== milestone.track_id) {
    return response({ error: 'This is not your selected reward track.' }, 409);
  }
  if (Number(progress?.points || 0) < Number(milestone.points_required)) {
    return response({ error: 'This milestone has not been reached.' }, 409);
  }

  const alreadyGranted = (grants || []).some((grant) => {
    return grant.milestone_id === milestone.id;
  });
  if (alreadyGranted) return response({ error: 'This song reward was already granted.' }, 409);

  const { data: grantId, error: grantError } = await adminClient.rpc('grant_song_reward', {
    p_user_id: user.id,
    p_track_id: milestone.track_id,
    p_reward_name: milestone.name || 'Song reward',
    p_song_id: songId,
    p_milestone_id: milestone.id,
  });
  if (grantError) return response({ error: grantError.message }, 500);

  return response({ grant_id: grantId, song_id: songId });
});
