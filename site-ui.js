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

const musicPage = document.body.dataset.musicPage || 'library';
const musicBuiltInDefault = document.body.dataset.musicDefault || 'big-waves';

function updateProfileNavigation(user) {
  const avatar = document.querySelector('#profile-avatar');
  const name = document.querySelector('#profile-name');
  if (!avatar || !name) return;
  if (!user) {
    avatar.textContent = '?';
    name.textContent = 'Profile';
    return;
  }
  const email = user.email || '';
  const initials = email.split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
  avatar.textContent = initials || '?';
  name.textContent = 'Profile';
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
  let musicReady = false;
  let songLoadRequest = 0;

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
    songSelect.value = window.questLineSongs?.getPreferences?.().pages[musicPage] || '';
  }

  function playCurrentSong(song) {
    if (!song || currentSong?.id === song.id) return;
    const wasPlaying = !audio.paused;
    isPlaying = false;
    audio.src = song.audio_url;
    audio.load();
    currentSong = song;
    const title = document.querySelector('.music-title');
    if (title) title.textContent = song.title;
    if (wasPlaying) playMusic();
  }

  function resolveSong() {
    return window.questLineSongs?.resolveSong?.(availableSongs, musicPage, musicBuiltInDefault) || availableSongs[0];
  }

  async function loadSongs(user) {
    const request = ++songLoadRequest;
    currentUser = user;
    await window.questLineSongs?.loadPreferences?.(user);
    const songs = await (window.questLineSongs?.listAvailable?.() || []);
    if (request !== songLoadRequest) return;
    availableSongs = songs;
    renderSongs();
    playCurrentSong(resolveSong());
    musicReady = true;
    window.dispatchEvent(new CustomEvent('questline:music-ready', { detail: { songs: availableSongs, user } }));
    playMusic();
  }

  function updateVolume() {
    const value = Number(volume.value);
    audio.volume = value;
    volumeValue.textContent = `${Math.round(value * 100)}%`;
    localStorage.setItem('questline-music-volume', String(value));
  }

  function playMusic() {
    if (!musicReady || isPlaying) return;

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
    const chosenSong = availableSongs.find((song) => song.id === songSelect.value);
    if (!currentUser && chosenSong && !chosenSong.is_default) {
      songSelect.value = '';
      return;
    }
    window.questLineSongs.setPageSong(musicPage, chosenSong?.id || null)
      .then(() => playCurrentSong(resolveSong()))
      .catch((error) => console.error('Could not save page music preference.', error));
  });

  ['pointerdown', 'keydown'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('.music-player')) playMusic();
    }, { once: true, passive: true });
  });

  updateVolume();
  updateControls(false);
  if (window.questLineSupabase) {
    window.questLineSupabase.auth.onAuthStateChange((_event, session) => {
      updateProfileNavigation(session?.user || null);
      loadSongs(session?.user || null).catch((error) => console.error('Could not load background music.', error));
    });
    window.questLineSupabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        updateProfileNavigation(data.session?.user || null);
        return loadSongs(data.session?.user || null);
      })
      .catch((error) => console.error('Could not load background music preferences.', error));
  } else {
    updateProfileNavigation(null);
    loadSongs(null).catch((error) => console.error('Could not load background music.', error));
  }

  window.questLineMusic = {
    getAvailableSongs: () => [...availableSongs],
    getPreferences: () => window.questLineSongs?.getPreferences?.() || { defaultSongId: null, pages: {} },
    async setDefaultSong(songId) {
      if (!currentUser) throw new Error('Sign in to update your music preference.');
      if (songId && !availableSongs.some((song) => song.id === songId)) throw new Error('That song is not available to you.');
      await window.questLineSongs.setDefaultSong(songId || null);
      playCurrentSong(resolveSong());
    },
    async resetPageSongs() {
      if (!currentUser) throw new Error('Sign in to reset your music preferences.');
      await window.questLineSongs.resetAllPreferences();
      songSelect.value = '';
      playCurrentSong(resolveSong());
    },
  };
}

window.questLineUI = { updateFavicon };
updateFavicon();
setupMusicPlayer();
