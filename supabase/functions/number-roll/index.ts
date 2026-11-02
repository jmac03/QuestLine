import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return response({ error: 'Authentication is required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return response({ error: 'Server configuration is incomplete' }, 500);

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return response({ error: 'Authentication is required' }, 401);

  let payload: { request_id?: unknown } = {};
  try { payload = await request.json(); } catch { return response({ error: 'Invalid JSON body' }, 400); }
  if (!isUuid(payload.request_id)) return response({ error: 'request_id must be a UUID' }, 400);

  const { data, error } = await client.rpc('roll_number', { p_request_id: payload.request_id });
  if (error) return response({ error: error.message }, 400);
  return response(data as Record<string, unknown>);
});
