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

function setupMusicPlayer() {
  const audio = document.querySelector('#background-music');
  const toggle = document.querySelector('#music-toggle');
  const volume = document.querySelector('#music-volume');
  const volumeValue = document.querySelector('#music-volume-value');
  if (!audio || !toggle || !volume || !volumeValue) return;

  const savedVolume = Number.parseFloat(localStorage.getItem('questline-music-volume'));
  let isPlaying = false;

  if (Number.isFinite(savedVolume)) volume.value = String(Math.min(1, Math.max(0, savedVolume)));

  function updateControls(playing) {
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.setAttribute('aria-label', playing ? 'Pause background music' : 'Play background music');
    toggle.innerHTML = `<span aria-hidden="true">${playing ? 'Ⅱ' : '▶'}</span>`;
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

  ['pointerdown', 'keydown'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('.music-player')) playMusic();
    }, { once: true, passive: true });
  });

  updateVolume();
  updateControls(false);
  playMusic();
}

window.questLineUI = { updateFavicon };
updateFavicon();
setupMusicPlayer();
