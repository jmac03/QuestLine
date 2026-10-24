// Shared music catalog, ownership boundary, and preference store.
// Page scripts should use questLineSongs rather than reimplementing any of this.
const supabaseForSongs = window.questLineSupabase;
const musicPreferencePrefix = 'questline.music-preferences.';
const profilePreferencePage = '__profile__';
const localSongCatalog = Object.freeze([
  Object.freeze({ id: 'big-waves', title: 'Big Waves', artist: null, audio_url: 'assets/Big_Waves.wav', duration_seconds: null, is_default: true }),
  Object.freeze({ id: 'fire-behind-the-weave', title: 'Fire Behind the Weave', artist: null, audio_url: 'assets/Fire_Behind_the_Weave.wav', duration_seconds: null }),
  Object.freeze({ id: 'number-roller', title: 'Number Roller', artist: null, audio_url: 'assets/Number_Roller.wav', duration_seconds: null, is_default: true }),
  Object.freeze({ id: 'reich-phase', title: 'Reich Phase', artist: null, audio_url: 'assets/Reich_Phase_synchronized.wav', duration_seconds: 212.4 }),
  Object.freeze({ id: 'racing-the-weave', title: 'Racing The Weave', artist: null, audio_url: 'assets/Racing_The_Weave_60s.wav', duration_seconds: 60, is_default: true }),
  Object.freeze({ id: 'veyriths-transformation', title: "Veyrith's Transformation", artist: null, audio_url: 'assets/Veyriths_Transformation.wav', duration_seconds: null }),
]);
const catalogById = new Map(localSongCatalog.map((song) => [song.id, song]));
let currentUser = null;
let cachedPreferences = { defaultSongId: null, pages: {} };

function normalizeSongId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return catalogById.has(id) ? id : null;
}
function emptyPreferences() { return { defaultSongId: null, pages: {} }; }
function readLocalPreferences(userId) {
  try {
    const value = JSON.parse(localStorage.getItem(`${musicPreferencePrefix}${userId || 'guest'}`) || '{}');
    const pages = value?.pages && typeof value.pages === 'object' && !Array.isArray(value.pages) ? value.pages : {};
    return {
      defaultSongId: normalizeSongId(value?.defaultSongId),
      pages: Object.fromEntries(Object.entries(pages).map(([page, id]) => [page, normalizeSongId(id)]).filter(([, id]) => id)),
    };
  } catch { return emptyPreferences(); }
}
function writeLocalPreferences(userId, preferences) {
  try { localStorage.setItem(`${musicPreferencePrefix}${userId || 'guest'}`, JSON.stringify(preferences)); } catch { /* Storage is optional. */ }
}
function songIdFromGrant(grant) {
  const payload = grant?.reward_payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.type !== 'song') return null;
  return normalizeSongId(payload.song_id);
}
async function listOwned() {
  if (!supabaseForSongs) throw new Error('The rewards service is unavailable.');
  const { data: { user }, error: authError } = await supabaseForSongs.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Sign in to view your songs.');
  const { data: grants, error } = await supabaseForSongs.from('user_reward_grants').select('reward_payload').eq('user_id', user.id);
  if (error) throw error;
  const ownedSongIds = new Set((grants || []).map(songIdFromGrant).filter(Boolean));
  return localSongCatalog.filter((song) => ownedSongIds.has(song.id)).sort((a, b) => a.title.localeCompare(b.title));
}
async function listAvailable() {
  const defaults = localSongCatalog.filter((song) => song.is_default);
  if (!supabaseForSongs) return defaults;
  try {
    const owned = await listOwned();
    return [...new Map([...defaults, ...owned].map((song) => [song.id, song])).values()].sort((a, b) => a.title.localeCompare(b.title));
  } catch { return defaults; } // Fail closed: grants are never exposed without current-user verification.
}
async function loadPreferences(user) {
  currentUser = user || null;
  cachedPreferences = readLocalPreferences(currentUser?.id);
  return cachedPreferences;
}
async function persistPreference(pageKey, songId) {
  const normalizedPage = pageKey === profilePreferencePage ? profilePreferencePage : String(pageKey || '').trim();
  if (!normalizedPage) throw new Error('A music page is required.');
  const normalizedSong = normalizeSongId(songId);
  if (songId && !normalizedSong) throw new Error('That song is not in the QuestLine catalog.');
  if (normalizedSong && !(await listAvailable()).some((song) => song.id === normalizedSong)) {
    throw new Error('That song is not available to you.');
  }
  const nextPreferences = {
    defaultSongId: cachedPreferences.defaultSongId,
    pages: { ...cachedPreferences.pages },
  };
  if (normalizedPage === profilePreferencePage) nextPreferences.defaultSongId = normalizedSong;
  else if (normalizedSong) nextPreferences.pages[normalizedPage] = normalizedSong;
  else delete nextPreferences.pages[normalizedPage];
  cachedPreferences = nextPreferences;
  writeLocalPreferences(currentUser?.id, cachedPreferences);
  return cachedPreferences;
}
window.questLineSongs = {
  listCatalog: () => [...localSongCatalog], listAvailable, listOwned,
  getOwned: async (songId) => {
    const song = (await listOwned()).find((candidate) => candidate.id === normalizeSongId(songId));
    if (!song) throw new Error('That song is not among your earned rewards.');
    return song;
  },
  getPreferences: () => ({ defaultSongId: cachedPreferences.defaultSongId, pages: { ...cachedPreferences.pages } }),
  loadPreferences, setPageSong: persistPreference,
  setDefaultSong: (id) => {
    if (!currentUser) return Promise.reject(new Error('Sign in to update your music preference.'));
    return persistPreference(profilePreferencePage, id);
  },
  resetPageSongs: async () => { for (const page of Object.keys(cachedPreferences.pages)) await persistPreference(page, null); return cachedPreferences; },
  resetAllPreferences: async () => {
    if (!currentUser) throw new Error('Sign in to reset your music preferences.');
    cachedPreferences = emptyPreferences();
    writeLocalPreferences(currentUser.id, cachedPreferences);
    return cachedPreferences;
  },
  resolveSong: (available, page, builtIn) => available.find((song) => song.id === normalizeSongId(cachedPreferences.pages[page]))
    || available.find((song) => song.id === normalizeSongId(cachedPreferences.defaultSongId))
    || available.find((song) => song.id === normalizeSongId(builtIn)) || available[0] || null,
  isCatalogSong: (id) => Boolean(normalizeSongId(id)),
};
