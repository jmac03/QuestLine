export const user = { id: '11111111-1111-4111-8111-111111111111', email: 'tester@example.com' };
export const track = { id: '22222222-2222-4222-8222-222222222222', slug: 'adventurer', name: 'Adventurer', description: 'Test track' };
export const milestone = { id: '33333333-3333-4333-8333-333333333333', track_id: track.id, points_required: 10, name: 'Song reward', reward_payload: { type: 'song', song_id: 'big-waves' } };

export const mockSupabase = ({ authenticated = true, energy = 3, rewardPoints = 10, rollError = null } = {}) => `
  (() => {
    const user = ${JSON.stringify(authenticated ? user : null)};
    const track = ${JSON.stringify(track)};
    const milestone = ${JSON.stringify(milestone)};
    const state = { currentEnergy: ${energy}, maxEnergy: 10, totalScore: 120, bestScore: 80, canRoll: ${energy > 0}, recentRolls: [{ roll_value: 17, score_gain: 5, rarity: 'Common', badges: ['close_to_average'] }] };
    let rewardPoints = Number(localStorage.getItem('questline-test-reward-points') || ${rewardPoints});
    const auth = {
      getSession: async () => ({ data: { session: user ? { user } : null }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      signInWithPassword: async () => ({ data: { user }, error: null }),
      signUp: async () => ({ data: { user }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: (callback) => { window.__authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    };
    const query = (table) => {
      const result = table === 'reward_tracks' ? [track] : table === 'reward_track_milestones' ? [milestone] : table === 'user_reward_track_progress' ? [{ track_id: track.id, points: rewardPoints }] : table === 'user_reward_track_selections' ? [{ track_id: track.id }] : [];
      const builder = { select: () => builder, eq: () => builder, order: () => builder, maybeSingle: async () => ({ data: result[0] || null, error: null }), then: (resolve) => resolve({ data: result, error: null }) };
      return builder;
    };
    window.__mockCalls = [];
    window.supabase = { createClient: () => ({
      auth,
      from: query,
      rpc: async (name, args) => {
        window.__mockCalls.push({ type: 'rpc', name, args });
        if (name === 'get_roll_state') return { data: state, error: null };
        if (name === 'roll_number') {
          if (!args?.p_request_id || !/^[0-9a-f-]{36}$/.test(args.p_request_id)) return { data: null, error: { message: 'p_request_id is required' } };
          if (${JSON.stringify(rollError)}) return { data: null, error: { message: ${JSON.stringify(rollError)} } };
          state.currentEnergy = 2;
          state.totalScore = 135;
          state.bestScore = 95;
          state.recentRolls = [{ roll_value: 42, score_gain: 15, rarity: 'Rare', badges: ['lucky_number'] }];
          rewardPoints += 1;
          localStorage.setItem('questline-test-reward-points', String(rewardPoints));
          return { data: { roll: 42, scoreGain: 15, rarity: 'Rare', badges: ['lucky_number'], canRoll: true, currentEnergy: 2, maxEnergy: 10, totalScore: 135, bestScore: 95 }, error: null };
        }
        return { data: null, error: null };
      },
      functions: { invoke: async (name, options) => { window.__mockCalls.push({ type: 'function', name, options }); return { data: { grant_id: '44444444-4444-4444-8444-444444444444', song_id: 'big-waves' }, error: null }; } },
    }) };
  })();
`;
