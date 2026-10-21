// Songs are app assets for now. The database stores only the reward grant;
// the grant payload references a catalog ID such as { type: 'song', song_id: 'big-waves' }.
// The signed-in user's grants are the permission boundary for the future picker.

const supabaseForSongs = window.questLineSupabase;
const localSongCatalog = Object.freeze([
  Object.freeze({
    id: 'big-waves',
    title: 'Big Waves',
    artist: null,
    audio_url: 'assets/Big_Waves.wav',
    duration_seconds: null,
    is_default: true,
  }),
  Object.freeze({
    id: 'fire-behind-the-weave',
    title: 'Fire Behind the Weave',
    artist: null,
    audio_url: 'assets/Fire_Behind_the_Weave.wav',
    duration_seconds: null,
  }),
  Object.freeze({
    id: 'number-roller',
    title: 'Number Roller',
    artist: null,
    audio_url: 'assets/Number_Roller.wav',
    duration_seconds: null,
    is_default: true,
  }),
]);

function songIdFromGrant(grant) {
  const payload = grant?.reward_payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.type !== 'song') return null;
  return typeof payload.song_id === 'string' ? payload.song_id : null;
}

window.questLineSongs = {
  listCatalog() {
    return [...localSongCatalog];
  },

  async listAvailable() {
    const defaults = localSongCatalog.filter((song) => song.is_default);
    if (!supabaseForSongs) return defaults;
    try {
      const owned = await this.listOwned();
      return [...new Map([...defaults, ...owned].map((song) => [song.id, song])).values()]
        .sort((left, right) => left.title.localeCompare(right.title));
    } catch {
      return defaults;
    }
  },

  async listOwned() {
    if (!supabaseForSongs) throw new Error('The rewards service is unavailable.');

    const { data: { user }, error: authError } = await supabaseForSongs.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error('Sign in to view your songs.');

    const { data: grants, error } = await supabaseForSongs
      .from('user_reward_grants')
      .select('reward_payload')
      .eq('user_id', user.id);

    if (error) throw error;

    const ownedSongIds = new Set((grants || []).map(songIdFromGrant).filter(Boolean));
    return localSongCatalog
      .filter((song) => ownedSongIds.has(song.id))
      .sort((left, right) => left.title.localeCompare(right.title));
  },

  async getOwned(songId) {
    const song = (await this.listOwned()).find((candidate) => candidate.id === songId);
    if (!song) throw new Error('That song is not among your earned rewards.');
    return song;
  },
};
