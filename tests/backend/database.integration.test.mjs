import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const supabaseUrl = process.env.QUESTLINE_SUPABASE_URL || 'https://obbxdederwlzeoudajhi.supabase.co';
const anonKey = process.env.QUESTLINE_SUPABASE_ANON_KEY || 'sb_publishable_KS_33te2Kb-5po-N9xFJVA_5OVRuoW0';
const serviceRoleKey = process.env.QUESTLINE_SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(serviceRoleKey);

const temporaryEmail = `questline-db-test-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
const temporaryPassword = `QuestLine-${crypto.randomUUID()}-Aa1!`;
let temporaryUserId;
let accessToken;
let rewardTrackId;

async function request(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      ...options.headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json',
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function adminRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...options.headers,
      'Content-Type': 'application/json',
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function rpc(name, args) {
  return request(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

async function createTemporaryUser() {
  const result = await adminRequest('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: temporaryEmail,
      password: temporaryPassword,
      email_confirm: true,
    }),
  });
  assert.equal(result.response.ok, true, `Could not create test user: ${JSON.stringify(result.body)}`);
  temporaryUserId = result.body.id;

  const signIn = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: temporaryEmail, password: temporaryPassword }),
  });
  assert.equal(signIn.response.ok, true, `Could not sign in test user: ${JSON.stringify(signIn.body)}`);
  accessToken = signIn.body.access_token;
}

async function deleteTemporaryUser() {
  if (rewardTrackId) {
    await adminRequest(`/rest/v1/reward_track_milestones?track_id=eq.${rewardTrackId}`, { method: 'DELETE' });
    await adminRequest(`/rest/v1/reward_tracks?id=eq.${rewardTrackId}`, { method: 'DELETE' });
  }
  if (!temporaryUserId) return;
  const result = await adminRequest(`/auth/v1/admin/users/${temporaryUserId}`, { method: 'DELETE' });
  assert.equal(result.response.ok, true, `Could not delete test user: ${JSON.stringify(result.body)}`);
}

if (!configured) {
  test('database integration configuration', { skip: 'Set QUESTLINE_SUPABASE_SERVICE_ROLE_KEY to run database tests.' }, () => {});
} else {
  test.before(async () => {
    await createTemporaryUser();
  });

  test.after(async () => {
    await deleteTemporaryUser();
  });

  test('evaluates deterministic Number Roll results in the database', async () => {
    const cases = [
      [2, 160, 'Rare', ['prime', 'even', 'low_ball']],
      [42, 110, 'Uncommon', ['even', 'lucky_number', 'low_ball']],
      [777, 210, 'Rare', ['palindrome', 'odd', 'repeating_digits', 'lucky_number']],
    ];

    for (const [roll, scoreGain, rarity, badges] of cases) {
      const result = await rpc('number_roll_result', { p_roll: roll });
      assert.equal(result.response.ok, true, JSON.stringify(result.body));
      assert.equal(result.body.roll, roll);
      assert.equal(result.body.scoreGain, scoreGain);
      assert.equal(result.body.rarity, rarity);
      for (const badge of badges) assert.ok(result.body.badges.includes(badge), `${roll} missing ${badge}`);
    }

    for (const roll of [0, 1001]) {
      const result = await rpc('number_roll_result', { p_roll: roll });
      assert.equal(result.response.ok, false);
    }
  });

  test('creates authenticated roll state and persists one roll', async () => {
    const initial = await rpc('get_roll_state', {});
    assert.equal(initial.response.ok, true, JSON.stringify(initial.body));
    assert.equal(initial.body.currentEnergy, initial.body.maxEnergy);
    assert.equal(initial.body.totalScore, 0);
    assert.deepEqual(initial.body.recentRolls, []);

    const requestId = crypto.randomUUID();
    const roll = await rpc('roll_number', { p_request_id: requestId });
    assert.equal(roll.response.ok, true, JSON.stringify(roll.body));
    assert.ok(roll.body.roll >= 1 && roll.body.roll <= 1000);
    assert.equal(roll.body.currentEnergy, initial.body.maxEnergy - 1);
    assert.ok(roll.body.totalScore >= roll.body.scoreGain);

    const state = await rpc('get_roll_state', {});
    assert.equal(state.response.ok, true, JSON.stringify(state.body));
    assert.equal(state.body.currentEnergy, initial.body.maxEnergy - 1);
    assert.equal(state.body.recentRolls.length, 1);
    assert.equal(state.body.recentRolls[0].roll_value, roll.body.roll);
  });

  test('makes roll requests idempotent', async () => {
    const requestId = crypto.randomUUID();
    const first = await rpc('roll_number', { p_request_id: requestId });
    assert.equal(first.response.ok, true, JSON.stringify(first.body));

    const retry = await rpc('roll_number', { p_request_id: requestId });
    assert.equal(retry.response.ok, true, JSON.stringify(retry.body));
    assert.equal(retry.body.roll, first.body.roll);
    assert.equal(retry.body.scoreGain, first.body.scoreGain);
    assert.equal(retry.body.currentEnergy, first.body.currentEnergy);
    assert.equal(retry.body.totalScore, first.body.totalScore);
  });

  test('awards selected reward-track progress and reached grants from score changes', async () => {
    const slug = `db-test-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const trackResult = await adminRequest('/rest/v1/reward_tracks', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        slug,
        name: 'Database Test Track',
        score_step: 1,
        points_per_score_milestone: 1,
        is_active: true,
      }),
    });
    assert.equal(trackResult.response.ok, true, JSON.stringify(trackResult.body));
    rewardTrackId = Array.isArray(trackResult.body) ? trackResult.body[0].id : trackResult.body.id;

    const milestoneResult = await adminRequest('/rest/v1/reward_track_milestones', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        track_id: rewardTrackId,
        points_required: 1,
        name: 'Database Test Song',
        reward_payload: { type: 'song', song_id: 'big-waves' },
      }),
    });
    assert.equal(milestoneResult.response.ok, true, JSON.stringify(milestoneResult.body));

    const selected = await rpc('select_reward_track', { p_track_id: rewardTrackId });
    assert.equal(selected.response.ok, true, JSON.stringify(selected.body));

    const roll = await rpc('roll_number', { p_request_id: crypto.randomUUID() });
    assert.equal(roll.response.ok, true, JSON.stringify(roll.body));

    const progress = await request(`/rest/v1/user_reward_track_progress?track_id=eq.${rewardTrackId}&select=*`);
    assert.equal(progress.response.ok, true, JSON.stringify(progress.body));
    assert.equal(progress.body.length, 1);
    assert.ok(progress.body[0].points >= 1);

    const grants = await request(`/rest/v1/user_reward_grants?track_id=eq.${rewardTrackId}&select=*`);
    assert.equal(grants.response.ok, true, JSON.stringify(grants.body));
    assert.equal(grants.body.length, 1);
    assert.deepEqual(grants.body[0].reward_payload, { type: 'song', song_id: 'big-waves' });
  });

  test('rejects invalid roll requests and anonymous database access', async () => {
    const invalidRequest = await rpc('roll_number', { p_request_id: 'not-a-uuid' });
    assert.equal(invalidRequest.response.ok, false);

    const anonymous = await fetch(`${supabaseUrl}/rest/v1/rpc/get_roll_state`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(anonymous.ok, false);
  });

  test('enforces the energy limit and returns only the five newest rolls', async () => {
    const stateBefore = await rpc('get_roll_state', {});
    assert.equal(stateBefore.response.ok, true, JSON.stringify(stateBefore.body));

    let remaining = stateBefore.body.currentEnergy;
    for (let index = 0; index < remaining; index += 1) {
      const result = await rpc('roll_number', { p_request_id: crypto.randomUUID() });
      assert.equal(result.response.ok, true, JSON.stringify(result.body));
    }

    const exhausted = await rpc('get_roll_state', {});
    assert.equal(exhausted.response.ok, true, JSON.stringify(exhausted.body));
    assert.equal(exhausted.body.currentEnergy, 0);
    assert.equal(exhausted.body.canRoll, false);
    assert.equal(exhausted.body.recentRolls.length, 5);

    const rejected = await rpc('roll_number', { p_request_id: crypto.randomUUID() });
    assert.equal(rejected.response.ok, false);
  });

  test('does not expose Number Roll tables through the authenticated data API', async () => {
    for (const table of ['number_roll_players', 'number_rolls']) {
      const result = await request(`/rest/v1/${table}?select=*`);
      assert.equal(result.response.ok, false, `${table} was directly readable: ${JSON.stringify(result.body)}`);
    }
  });
}
