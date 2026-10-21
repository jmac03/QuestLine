// Shared page chrome: the theme-aware favicon and background music controls.
const favicon = document.querySelector('#favicon');

function updateFavicon() {
  if (!favicon) return;

  const rootStyles = getComputedStyle(document.documentElement);
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="${rootStyles.getPropertyValue('--paper').trim()}"/>
    <text x="7" y="47" fill="${rootStyles.getPropertyValue('--ink').trim()}" font-family="Arial, sans-serif" font-size="39" font-weight="700">Q</text>
    <text x="34" y="38" fill="${rootStyles.getPropertyValue('--blue').trim()}" font-family="Arial, sans-serif" font-size="39" font-weight="700">L</text>
  </svg>`;

  favicon.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;
}

const musicPreferencePrefix = 'questline.music-preferences.';
const musicPage = document.body.dataset.musicPage || 'library';
const musicBuiltInDefault = document.body.dataset.musicDefault || 'big-waves';

function readMusicPreferences(userId) {
  if (!userId) return { defaultSongId: null, pages: {} };
  try {
    const value = JSON.parse(localStorage.getItem(`${musicPreferencePrefix}${userId}`) || '{}');
    return { defaultSongId: value.defaultSongId || null, pages: value.pages || {} };
  } catch {
    return { defaultSongId: null, pages: {} };
  }
}

function writeMusicPreferences(userId, preferences) {
  if (userId) localStorage.setItem(`${musicPreferencePrefix}${userId}`, JSON.stringify(preferences));
}

function setupMusicPlayer() {
  const audio = document.querySelector('#background-music');
  const toggle = document.querySelector('#music-toggle');
  const volume = document.querySelector('#music-volume');
  const volumeValue = document.querySelector('#music-volume-value');
  if (!audio || !toggle || !volume || !volumeValue) return;

  const savedVolume = Number.parseFloat(localStorage.getItem('questline-music-volume'));
  let isPlaying = false;
  let currentUser = null;
  let availableSongs = [];
  let currentSong = null;

  if (Number.isFinite(savedVolume)) volume.value = String(Math.min(1, Math.max(0, savedVolume)));

  const songSelect = document.createElement('select');
  songSelect.className = 'music-song-select';
  songSelect.setAttribute('aria-label', 'Choose music for this page');
  const songLabel = document.createElement('label');
  songLabel.className = 'music-song-control';
  songLabel.append('This page', songSelect);
  volume.parentElement.before(songLabel);

  function updateControls(playing) {
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.setAttribute('aria-label', playing ? 'Pause background music' : 'Play background music');
    toggle.innerHTML = `<span aria-hidden="true">${playing ? 'Ⅱ' : '▶'}</span>`;
  }

  function renderSongs() {
    songSelect.replaceChildren(new Option('Use profile default', ''));
    for (const song of availableSongs) songSelect.append(new Option(song.title, song.id));
    songSelect.value = readMusicPreferences(currentUser?.id).pages[musicPage] || '';
  }

  function playCurrentSong(song) {
    if (!song || currentSong?.id === song.id) return;
    const wasPlaying = !audio.paused;
    audio.src = song.audio_url;
    audio.load();
    currentSong = song;
    const title = document.querySelector('.music-title');
    if (title) title.textContent = song.title;
    if (wasPlaying) playMusic();
  }

  function resolveSong(preferences) {
    return availableSongs.find((song) => song.id === preferences.pages[musicPage])
      || availableSongs.find((song) => song.id === preferences.defaultSongId)
      || availableSongs.find((song) => song.id === musicBuiltInDefault)
      || availableSongs[0];
  }

  async function loadSongs(user) {
    currentUser = user;
    availableSongs = await (window.questLineSongs?.listAvailable?.() || []);
    renderSongs();
    playCurrentSong(resolveSong(readMusicPreferences(user?.id)));
    window.dispatchEvent(new CustomEvent('questline:music-ready', { detail: { songs: availableSongs, user } }));
  }

  function updateVolume() {
    const value = Number(volume.value);
    audio.volume = value;
    volumeValue.textContent = `${Math.round(value * 100)}%`;
    localStorage.setItem('questline-music-volume', String(value));
  }

  function playMusic() {
    if (isPlaying) return;

    audio.play().then(() => {
      isPlaying = true;
      updateControls(true);
    }).catch(() => updateControls(false));
  }

  volume.addEventListener('input', updateVolume);
  toggle.addEventListener('click', () => {
    if (audio.paused) {
      playMusic();
      return;
    }

    audio.pause();
    isPlaying = false;
    updateControls(false);
  });

  songSelect.addEventListener('change', () => {
    if (!currentUser) {
      songSelect.value = '';
      return;
    }
    const preferences = readMusicPreferences(currentUser.id);
    if (songSelect.value) preferences.pages[musicPage] = songSelect.value;
    else delete preferences.pages[musicPage];
    writeMusicPreferences(currentUser.id, preferences);
    playCurrentSong(resolveSong(preferences));
  });

  ['pointerdown', 'keydown'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('.music-player')) playMusic();
    }, { once: true, passive: true });
  });

  updateVolume();
  updateControls(false);
  loadSongs(null).catch(() => {});
  if (window.questLineSupabase) {
    window.questLineSupabase.auth.getSession().then(({ data }) => loadSongs(data.session?.user || null)).catch(() => {});
    window.questLineSupabase.auth.onAuthStateChange((_event, session) => loadSongs(session?.user || null).catch(() => {}));
  }
  playMusic();

  window.questLineMusic = {
    getAvailableSongs: () => [...availableSongs],
    getPreferences: () => readMusicPreferences(currentUser?.id),
    async setDefaultSong(songId) {
      if (!currentUser) throw new Error('Sign in to update your music preference.');
      if (songId && !availableSongs.some((song) => song.id === songId)) throw new Error('That song is not available to you.');
      const preferences = readMusicPreferences(currentUser.id);
      preferences.defaultSongId = songId || null;
      writeMusicPreferences(currentUser.id, preferences);
      playCurrentSong(resolveSong(preferences));
    },
  };
}

window.questLineUI = { updateFavicon };
updateFavicon();
setupMusicPlayer();
