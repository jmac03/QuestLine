import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../supabase/functions/claim-reward/index.ts', import.meta.url), 'utf8');

test('claim reward edge function validates HTTP and authentication input', () => {
  assert.match(source, /request\.method === 'OPTIONS'/);
  assert.match(source, /request\.method !== 'POST'/);
  assert.match(source, /Authentication is required/);
  assert.match(source, /milestone_id must be a UUID/);
});

test('claim reward edge function trusts JWT identity and server-side reward data', () => {
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /user\.id/);
  assert.match(source, /reward_payload/);
  assert.doesNotMatch(source, /body\.user_id/);
  assert.doesNotMatch(source, /body\.song_id/);
});

test('claim reward edge function enforces track, progress, and duplicate rules', () => {
  assert.match(source, /This is not your selected reward track/);
  assert.match(source, /This milestone has not been reached/);
  assert.match(source, /This song reward was already granted/);
  assert.match(source, /grant_song_reward/);
});
