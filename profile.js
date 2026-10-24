const supabaseClient = window.questLineSupabase;
const loadingView = document.querySelector('#profile-loading');
const authView = document.querySelector('#profile-auth');
const accountView = document.querySelector('#profile-account');
const authForm = document.querySelector('#profile-auth-form');
const signInButton = document.querySelector('#profile-sign-in');
const message = document.querySelector('#profile-message');
const accountMessage = document.querySelector('#account-message');
const accountEmail = document.querySelector('#profile-account-email');
const defaultSongSelect = document.querySelector('#default-song-select');
const resetSongsButton = document.querySelector('#reset-songs-button');
const signOutButton = document.querySelector('#sign-out-button');
const musicPlayer = document.querySelector('.music-player');
let activeUser = null;
let authBusy = false;
let musicReady = false;
let redirectingToSignIn = false;

function redirectToSignIn() {
  if (redirectingToSignIn) return;
  redirectingToSignIn = true;
  window.location.replace('index.html?auth=required&next=profile.html');
}

function setMessage(element, text, error = false) {
  element.textContent = text || '';
  element.classList.toggle('is-error', error);
}

function renderAccount(user) {
  activeUser = user || null;
  loadingView.hidden = true;
  authView.hidden = Boolean(activeUser);
  accountView.hidden = !activeUser;
  accountEmail.textContent = activeUser?.email || activeUser?.user_metadata?.email || '';
  defaultSongSelect.disabled = !activeUser || !musicReady;
  resetSongsButton.disabled = !activeUser;
  signOutButton.disabled = !activeUser;
  if (musicPlayer) musicPlayer.hidden = !activeUser;
  if (activeUser) {
    renderSongs();
    setMessage(message, '');
  } else {
    redirectToSignIn();
  }
}

function renderSongs(songs = window.questLineMusic?.getAvailableSongs?.() || []) {
  if (!activeUser) return;
  const current = window.questLineMusic?.getPreferences?.().defaultSongId || '';
  defaultSongSelect.replaceChildren(new Option("Use each page's built-in song", ''));
  songs.forEach((song) => defaultSongSelect.append(new Option(song.title, song.id)));
  defaultSongSelect.value = current;
  defaultSongSelect.disabled = !musicReady;
}

defaultSongSelect.addEventListener('change', async () => {
  if (!activeUser) return;
  defaultSongSelect.disabled = true;
  try {
    await window.questLineMusic.setDefaultSong(defaultSongSelect.value);
    setMessage(accountMessage, 'Default song saved.');
  } catch (error) {
    setMessage(accountMessage, error.message || 'Could not save that preference.', true);
  } finally { defaultSongSelect.disabled = !activeUser || !musicReady; }
});

resetSongsButton.addEventListener('click', async () => {
  if (!activeUser) return;
  resetSongsButton.disabled = true;
  try {
    await window.questLineMusic.resetPageSongs();
    renderSongs();
    setMessage(accountMessage, 'All song preferences reset to their defaults.');
  } catch (error) {
    setMessage(accountMessage, error.message || 'Could not reset song preferences.', true);
  } finally { resetSongsButton.disabled = !activeUser; }
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (authBusy) return;
  if (!supabaseClient) return setMessage(message, 'The account service could not load.', true);
  if (!authForm.reportValidity()) return;
  authBusy = true;
  signInButton.disabled = true;
  setMessage(message, 'Signing in...');
  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email: authForm.elements.email.value.trim(), password: authForm.elements.password.value });
    if (error) setMessage(message, error.message || 'Could not sign in.', true);
    else authForm.elements.password.value = '';
  } catch (error) { setMessage(message, error.message || 'Could not sign in.', true); }
  finally { authBusy = false; signInButton.disabled = false; }
});

signOutButton.addEventListener('click', async () => {
  if (!supabaseClient || !activeUser || authBusy) return;
  authBusy = true; signOutButton.disabled = true; resetSongsButton.disabled = true; defaultSongSelect.disabled = true;
  setMessage(accountMessage, 'Signing out...');
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) setMessage(accountMessage, error.message || 'Could not sign out.', true);
  } catch (error) { setMessage(accountMessage, error.message || 'Could not sign out.', true); }
  finally { authBusy = false; signOutButton.disabled = !activeUser; resetSongsButton.disabled = !activeUser; }
});

window.addEventListener('questline:music-ready', (event) => {
  musicReady = true;
  renderSongs(event.detail?.songs || []);
});

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => renderAccount(session?.user || null));
  supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    renderAccount(data.session?.user || null);
  }).catch((error) => {
    activeUser = null;
    redirectToSignIn();
  });
} else {
  redirectToSignIn();
}
