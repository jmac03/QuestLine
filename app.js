// This file is the core logic for the QuestLine library page.
// It keeps the browser tab favicon in sync with the site theme,
// loads reward data from Supabase, handles sign-in / sign-out,
// and lets a signed-in user pick an active reward track or equip a color theme.

const queryParams = new URLSearchParams(window.location.search);
const requestedNextPage = queryParams.get('next');
const nextPage = ['number-roll.html', 'profile.html'].includes(requestedNextPage)
  ? requestedNextPage
  : null;
const signUpRequested = queryParams.get('mode') === 'signup';
const requiresAuthentication = document.body.dataset.requiresAuth === 'true';
let isNavigatingToGame = false;

function continueToRequestedPage() {
  if (!nextPage || isNavigatingToGame) return;
  isNavigatingToGame = true;
  window.location.assign(nextPage);
}

const profileButton = document.querySelector('#profile-button');
const profileAvatar = document.querySelector('#profile-avatar');
const profileName = document.querySelector('#profile-name');
const authDialog = document.querySelector('#auth-dialog');
const authTitle = document.querySelector('#auth-title');
const authFormView = document.querySelector('#auth-form-view');
const accountView = document.querySelector('#account-view');
const authForm = document.querySelector('#auth-form');
const authEmail = document.querySelector('#auth-email');
const authPassword = document.querySelector('#auth-password');
const authSubmit = document.querySelector('#auth-submit');
const authMessage = document.querySelector('#auth-message');
const accountEmail = document.querySelector('#account-email');
const accountMessage = document.querySelector('#account-message');
const defaultSongSelect = document.querySelector('#default-song-select');
const signOutButton = document.querySelector('#sign-out-button');
const signInTab = document.querySelector('#sign-in-tab');
const signUpTab = document.querySelector('#sign-up-tab');
const rewardPoints = document.querySelector('#reward-points');
const rewardStatus = document.querySelector('#reward-status');
const rewardTrackGrid = document.querySelector('#reward-track-grid');
const grantedRewards = document.querySelector('#granted-rewards');
const grantList = document.querySelector('#grant-list');
const defaultThemeButton = document.querySelector('#default-theme-button');
const rewardsAuthButton = document.querySelector('#rewards-auth-button');
let isSigningUp = false;
let activeUser = null;
let rewardRequestId = 0;
let rewardLoadFailures = 0;
let equippedColorThemeGrantId = null;

function promptForSignIn(message = 'Sign in to continue.') {
  if (!authDialog || activeUser) return;
  setAuthMode(false);
  setAuthMessage(message);
  if (!authDialog.open) authDialog.showModal();
  authEmail?.focus();
}

function setRewardsAuthButtonVisible(visible) {
  if (rewardsAuthButton) rewardsAuthButton.hidden = !visible;
}

function renderDefaultSongSelect(songs = window.questLineMusic?.getAvailableSongs?.() || []) {
  if (!defaultSongSelect) return;
  const currentValue = window.questLineMusic?.getPreferences?.().defaultSongId || '';
  defaultSongSelect.replaceChildren(new Option('Use each page\'s built-in song', ''));
  for (const song of songs) defaultSongSelect.append(new Option(song.title, song.id));
  defaultSongSelect.value = currentValue;
}

const supabaseClient = window.questLineSupabase;

function setRewardStatus(message, isError = false) {
  if (!rewardStatus) return;
  rewardStatus.textContent = message;
  rewardStatus.classList.toggle('is-error', isError);
}

function formatRewardPayload(payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return String(payload);

  return Object.entries(payload)
    .map(([key, value]) => `${key.replace(/[_-]/g, ' ')}: ${typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}`)
    .join(' · ');
}

function appendTextElement(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function getSongRewardId(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return payload.type === 'song' && typeof payload.song_id === 'string'
    ? payload.song_id
    : null;
}

async function claimSongReward(milestone, button) {
  if (!activeUser || !supabaseClient) return;

  button.disabled = true;
  button.textContent = 'Claiming…';
  setRewardStatus('Claiming your song reward…');
  try {
    const { data, error } = await supabaseClient.functions.invoke('claim-song-reward', {
      body: { milestone_id: milestone.id },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    await loadRewardData(activeUser);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    setRewardStatus(`Could not claim this song: ${message}`, true);
    button.disabled = false;
    button.textContent = 'Claim song';
  }
}

// This function creates the cards that show all active reward tracks,
// their progress toward each milestone, and the list of rewards already granted.
function renderRewardTracks(tracks, selection, progressRows, milestones, grants) {
  rewardTrackGrid.replaceChildren();
  grantList.replaceChildren();

  const selectedTrackId = selection?.track_id;
  const progressByTrack = new Map(progressRows.map((progress) => [progress.track_id, progress]));
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const grantedSongIds = new Set(grants.map((grant) => getSongRewardId(grant.reward_payload)).filter(Boolean));
  const selectedProgress = progressByTrack.get(selectedTrackId);
  const totalPoints = selectedProgress
    ? Number(selectedProgress.points) || 0
    : progressRows.reduce((sum, progress) => sum + (Number(progress.points) || 0), 0);
  rewardPoints.textContent = totalPoints.toLocaleString();

  setRewardStatus(!tracks.length
    ? 'There are no active reward tracks right now.'
    : selectedTrackId
      ? 'Your reward track progress'
      : 'Select a reward track to start earning rewards.');

  for (const track of tracks) {
    const progress = progressByTrack.get(track.id);
    const points = Number(progress?.points) || 0;
    const isSelected = track.id === selectedTrackId;
    const trackMilestones = milestones.filter((milestone) => milestone.track_id === track.id);
    const nextMilestone = trackMilestones.find((milestone) => Number(milestone.points_required) > points);
    const previousMilestone = [...trackMilestones].reverse().find((milestone) => Number(milestone.points_required) <= points);
    const currentThreshold = Number(previousMilestone?.points_required) || 0;
    const nextThreshold = Number(nextMilestone?.points_required);
    const progressPercent = nextMilestone
      ? Math.min(100, Math.max(0, ((points - currentThreshold) / (nextThreshold - currentThreshold)) * 100))
      : trackMilestones.length ? 100 : 0;
    const card = document.createElement('article');
    card.className = 'reward-track-card';
    card.classList.toggle('is-selected', isSelected);
    card.setAttribute('aria-label', `${track.name}${isSelected ? ', selected' : ''}`);

    const cardHeader = document.createElement('div');
    cardHeader.className = 'reward-track-header';
    const headingGroup = document.createElement('div');
    appendTextElement(headingGroup, 'p', 'reward-track-kicker', track.slug || 'Reward track');
    appendTextElement(headingGroup, 'h3', '', track.name);
    cardHeader.append(headingGroup);
    if (isSelected) appendTextElement(cardHeader, 'span', 'selected-track-label', 'Selected');
    card.append(cardHeader);

    if (track.description) appendTextElement(card, 'p', 'reward-track-description', track.description);

    const progressHeader = document.createElement('div');
    progressHeader.className = 'track-progress-heading';
    appendTextElement(progressHeader, 'span', '', `${points.toLocaleString()} points`);
    appendTextElement(progressHeader, 'span', '', nextMilestone ? `${(nextThreshold - points).toLocaleString()} to next reward` : 'All milestones reached');
    card.append(progressHeader);

    const progressTrack = document.createElement('div');
    progressTrack.className = 'track-progress';
    progressTrack.setAttribute('role', 'progressbar');
    progressTrack.setAttribute('aria-label', `${track.name} milestone progress`);
    progressTrack.setAttribute('aria-valuemin', '0');
    progressTrack.setAttribute('aria-valuemax', '100');
    progressTrack.setAttribute('aria-valuenow', String(Math.round(progressPercent)));
    const progressFill = document.createElement('span');
    progressFill.style.width = `${progressPercent}%`;
    progressTrack.append(progressFill);
    card.append(progressTrack);

    if (trackMilestones.length) {
      const milestoneList = document.createElement('ol');
      milestoneList.className = 'milestone-list';
      for (const milestone of trackMilestones) {
        const reached = points >= Number(milestone.points_required);
        const item = document.createElement('li');
        item.className = reached ? 'milestone-item is-reached' : 'milestone-item';
        appendTextElement(item, 'span', 'milestone-points', `${Number(milestone.points_required).toLocaleString()} pts`);
        const detail = document.createElement('div');
        appendTextElement(detail, 'strong', '', milestone.name || 'Milestone reward');
        const payloadText = formatRewardPayload(milestone.reward_payload);
        if (payloadText) appendTextElement(detail, 'span', 'milestone-reward', payloadText);
        const songId = getSongRewardId(milestone.reward_payload);
        const songAlreadyGranted = songId && grantedSongIds.has(songId);
        if (songId && reached && isSelected) {
          const claimButton = document.createElement('button');
          claimButton.className = 'claim-reward-button';
          claimButton.type = 'button';
          claimButton.textContent = songAlreadyGranted ? 'Song claimed' : 'Claim song';
          claimButton.disabled = Boolean(songAlreadyGranted);
          if (!songAlreadyGranted) claimButton.addEventListener('click', () => claimSongReward(milestone, claimButton));
          detail.append(claimButton);
        }
        item.append(detail);
        appendTextElement(item, 'span', 'milestone-state', songAlreadyGranted ? 'Claimed' : reached ? 'Reached' : 'Upcoming');
        milestoneList.append(item);
      }
      card.append(milestoneList);
    } else {
      appendTextElement(card, 'p', 'milestone-empty', 'Milestones will appear here when they are added.');
    }

    if (isSelected) {
      appendTextElement(card, 'p', 'track-selection-note', 'This is your active reward track.');
    } else {
      const selectButton = document.createElement('button');
      selectButton.className = 'select-track-button';
      selectButton.type = 'button';
      selectButton.textContent = 'Choose this track';
      selectButton.addEventListener('click', () => selectRewardTrack(track.id, selectButton));
      card.append(selectButton);
    }
    rewardTrackGrid.append(card);
  }

  if (!grants.length) {
    grantedRewards.hidden = true;
    return;
  }

  grantedRewards.hidden = false;
  for (const grant of grants) {
    const item = document.createElement('li');
    item.className = 'grant-item';
    const trackName = trackById.get(grant.track_id)?.name || 'Reward track';
    appendTextElement(item, 'span', 'grant-track', trackName);
    appendTextElement(item, 'strong', 'grant-name', grant.reward_name || 'Reward earned');
    const payloadText = formatRewardPayload(grant.reward_payload);
    if (payloadText) appendTextElement(item, 'span', 'grant-payload', payloadText);
    const date = grant.granted_at ? new Date(grant.granted_at) : null;
    if (date && !Number.isNaN(date.getTime())) {
      appendTextElement(item, 'time', 'grant-date', date.toLocaleDateString());
    }
    if (window.questLineRewardTheme?.isColorSchemeReward(grant)) {
      const equipButton = document.createElement('button');
      equipButton.className = 'equip-theme-button';
      equipButton.type = 'button';
      equipButton.textContent = grant.id === equippedColorThemeGrantId ? 'Using this color scheme' : 'Use this color scheme';
      equipButton.disabled = grant.id === equippedColorThemeGrantId;
      equipButton.addEventListener('click', () => equipColorTheme(grant, equipButton));
      item.append(equipButton);
    }
    grantList.append(item);
  }
}

// This function saves a color-scheme reward for the signed-in user and then refreshes the page state.
// The actual theme application is handled by reward-theme.js, but this function is what triggers it.
async function equipColorTheme(grant, button) {
  if (!activeUser || !window.questLineRewardTheme) return;

  button.disabled = true;
  button.textContent = 'Saving…';
  setRewardStatus('Saving your color scheme in this browser…');
  try {
    window.questLineRewardTheme.equip(activeUser, grant.id);
    await loadRewardData(activeUser);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    setRewardStatus(`Could not equip this color scheme: ${message}`, true);
    button.disabled = false;
    button.textContent = 'Use this color scheme';
  }
}

// Clears the user's saved theme preference and returns the app to the default palette.
async function useDefaultTheme() {
  if (!activeUser || !window.questLineRewardTheme) return;

  defaultThemeButton.disabled = true;
  defaultThemeButton.textContent = 'Saving…';
  try {
    window.questLineRewardTheme.useDefault(activeUser);
    await loadRewardData(activeUser);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    setRewardStatus(`Could not restore the default colors: ${message}`, true);
  } finally {
    defaultThemeButton.disabled = false;
    defaultThemeButton.textContent = 'Use default colors';
  }
}

// This is the main data-loading pipeline for rewards.
// It fetches the reward track catalog, the user's selected track, their point totals,
// the milestone list, and all earned grant records, then renders the UI.
async function loadRewardData(user) {
  if (!rewardStatus) return;
  const requestId = ++rewardRequestId;
  if (!user) {
    setRewardsAuthButtonVisible(true);
    equippedColorThemeGrantId = null;
    window.questLineRewardTheme?.setOwnedGrants(null, []);
    defaultThemeButton.hidden = true;
    rewardPoints.textContent = '—';
    rewardTrackGrid.replaceChildren();
    grantList.replaceChildren();
    grantedRewards.hidden = true;
    setRewardStatus('Sign in to view and choose a reward track.');
    if (requiresAuthentication) promptForSignIn('Sign in to view your rewards.');
    return;
  }
  if (!supabaseClient) {
    setRewardsAuthButtonVisible(true);
    equippedColorThemeGrantId = null;
    window.questLineRewardTheme?.setOwnedGrants(null, []);
    defaultThemeButton.hidden = true;
    setRewardStatus('The rewards service could not load. Check your connection and try again.', true);
    return;
  }

  rewardPoints.textContent = '—';
  rewardTrackGrid.replaceChildren();
  grantList.replaceChildren();
  grantedRewards.hidden = true;
  window.questLineRewardTheme?.reset();
  setRewardStatus('Loading your reward tracks…');
  try {
    const { data: { user: authenticatedUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError) throw authError;
    if (!authenticatedUser) throw new Error('Sign in to view rewards.');

    const [tracksResult, selectionResult, progressResult, milestonesResult, grantsResult] = await Promise.all([
      supabaseClient.from('reward_tracks')
        .select('id, slug, name, description')
        .eq('is_active', true)
        .order('name'),
      supabaseClient.from('user_reward_track_selections')
        .select('track_id')
        .eq('user_id', authenticatedUser.id)
        .maybeSingle(),
      supabaseClient.from('user_reward_track_progress')
        .select('track_id, points')
        .eq('user_id', authenticatedUser.id),
      supabaseClient.from('reward_track_milestones')
        .select('id, track_id, points_required, name, reward_payload')
        .order('points_required'),
      supabaseClient.from('user_reward_grants')
        .select('id, track_id, reward_name, reward_payload, granted_at')
        .eq('user_id', authenticatedUser.id)
        .order('granted_at', { ascending: false }),
    ]);

    for (const result of [tracksResult, selectionResult, progressResult, milestonesResult, grantsResult]) {
      if (result.error) throw result.error;
    }
    if (requestId !== rewardRequestId || activeUser?.id !== authenticatedUser.id) return;

    rewardLoadFailures = 0;
    setRewardsAuthButtonVisible(false);
    equippedColorThemeGrantId = window.questLineRewardTheme?.setOwnedGrants(authenticatedUser, grantsResult.data || []) || null;
    updateProfile(authenticatedUser);
    defaultThemeButton.hidden = !equippedColorThemeGrantId;
    renderRewardTracks(
      tracksResult.data || [],
      selectionResult.data,
      progressResult.data || [],
      milestonesResult.data || [],
      grantsResult.data || [],
    );
  } catch (error) {
    if (requestId !== rewardRequestId) return;
    equippedColorThemeGrantId = null;
    window.questLineRewardTheme?.setOwnedGrants(null, []);
    defaultThemeButton.hidden = true;
    const message = error instanceof Error ? error.message : 'Unknown error';
    setRewardStatus(`Could not load your reward tracks: ${message}`, true);
    rewardLoadFailures += 1;
    if (requiresAuthentication && (!activeUser || rewardLoadFailures >= 2 || /auth|sign in|session|token/i.test(message))) {
      setRewardsAuthButtonVisible(true);
      promptForSignIn('Sign in again to load your rewards.');
    }
  }
}

// Saves the user's chosen reward track through the Supabase RPC.
async function selectRewardTrack(trackId, button) {
  if (!activeUser || !supabaseClient) return;

  button.disabled = true;
  button.textContent = 'Selecting…';
  setRewardStatus('Saving your reward track selection…');
  try {
    const { error } = await supabaseClient.rpc('select_reward_track', { p_track_id: trackId });
    if (error) throw error;
    button.textContent = 'Selected';
    await loadRewardData(activeUser);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    setRewardStatus(`Could not select this reward track: ${message}`, true);
    button.disabled = false;
    button.textContent = 'Choose this track';
  }
}

// These helpers keep the account dialog's messages in one consistent style.
function setAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle('is-error', isError);
}

function setAccountMessage(message, isError = false) {
  accountMessage.textContent = message;
  accountMessage.classList.toggle('is-error', isError);
}

function updateProfile(user) {
  activeUser = user;

  if (!user) {
    profileAvatar.textContent = '?';
    profileName.textContent = 'Profile';
    profileButton.setAttribute('aria-label', 'Open your profile');
    return;
  }

  const email = user.email || 'QuestLine player';
  const initials = email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  profileAvatar.textContent = initials || '?';
  profileName.textContent = 'Profile';
  profileButton.setAttribute('aria-label', 'Open your profile');
}

function setAuthMode(signUp) {
  isSigningUp = signUp;
  authTitle.textContent = signUp ? 'Create your account' : 'Welcome back';
  authSubmit.textContent = signUp ? 'Create account' : 'Sign in';
  authPassword.autocomplete = signUp ? 'new-password' : 'current-password';
  signInTab.classList.toggle('active', !signUp);
  signUpTab.classList.toggle('active', signUp);
  signInTab.setAttribute('aria-pressed', String(!signUp));
  signUpTab.setAttribute('aria-pressed', String(signUp));
  setAuthMessage('');
}

function showAccount(user) {
  authFormView.hidden = Boolean(user);
  accountView.hidden = !user;
  authTitle.textContent = user ? 'Your account' : isSigningUp ? 'Create your account' : 'Welcome back';
  accountEmail.textContent = user?.email || '';
  renderDefaultSongSelect();
  setAccountMessage('');
}

profileButton?.addEventListener('click', () => window.location.assign('profile.html'));

window.addEventListener('questline:music-ready', (event) => {
  renderDefaultSongSelect(event.detail?.songs || []);
});

defaultSongSelect?.addEventListener('change', async () => {
  try {
    await window.questLineMusic?.setDefaultSong(defaultSongSelect.value);
  } catch (error) {
    setAccountMessage(error instanceof Error ? error.message : 'Could not save your music preference.', true);
  }
});

document.querySelector('#profile-settings-link')?.addEventListener('click', () => {
  window.location.assign('profile.html');
});

defaultThemeButton?.addEventListener('click', useDefaultTheme);
rewardsAuthButton?.addEventListener('click', () => {
  setAuthMode(false);
  setAuthMessage('');
  authDialog.showModal();
  authEmail.focus();
});
document.querySelector('#dialog-close').addEventListener('click', () => authDialog.close());
signInTab.addEventListener('click', () => setAuthMode(false));
signUpTab.addEventListener('click', () => setAuthMode(true));

// Submitting the auth form either signs a user in or creates a new account.
authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabaseClient) {
    setAuthMessage('The account service could not load. Check your connection and try again.', true);
    return;
  }

  authSubmit.disabled = true;
  signInTab.disabled = true;
  signUpTab.disabled = true;
  setAuthMessage('');
  const signingUp = isSigningUp;

  const credentials = {
    email: authEmail.value.trim(),
    password: authPassword.value,
  };

  try {
    const { data, error } = signingUp
      ? await supabaseClient.auth.signUp({
        ...credentials,
        options: { emailRedirectTo: window.location.href.split(/[?#]/)[0] },
      })
      : await supabaseClient.auth.signInWithPassword(credentials);

    if (error) {
      setAuthMessage(error.message, true);
      return;
    }

    if (signingUp && !data.session) {
      authPassword.value = '';
      setAuthMode(false);
      setAuthMessage('Account created. Sign in to continue.');
      return;
    }

    authForm.reset();
    authDialog.close();
    continueToRequestedPage();
  } catch (error) {
    setAuthMessage(error instanceof Error ? error.message : 'The account request could not be completed.', true);
  } finally {
    authSubmit.disabled = false;
    signInTab.disabled = false;
    signUpTab.disabled = false;
  }
});

// Signs the current user out and closes the dialog when the action is successful.
signOutButton.addEventListener('click', async () => {
  if (!supabaseClient) return;

  signOutButton.disabled = true;
  setAccountMessage('');
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      setAccountMessage(error.message, true);
      return;
    }

    authDialog.close();
  } catch (error) {
    setAccountMessage(error instanceof Error ? error.message : 'Could not sign out.', true);
  } finally {
    signOutButton.disabled = false;
  }
});

// Initialize the auth listener and session restore once the page loads.
if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateProfile(session?.user || null);
    if (rewardStatus) loadRewardData(session?.user || null);
    if (authDialog.open) showAccount(session?.user || null);
    if (session) continueToRequestedPage();
  });

  supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) {
      setAuthMessage(error.message, true);
      return;
    }
    updateProfile(data.session?.user || null);
    if (rewardStatus) loadRewardData(data.session?.user || null);
    if (data.session) continueToRequestedPage();
  }).catch((error) => {
    setAuthMessage(error instanceof Error ? error.message : 'Could not restore your account session.', true);
  });

  if (queryParams.get('auth') === 'required') {
    setAuthMode(signUpRequested);
    authDialog.showModal();
    authEmail.focus();
  }
} else {
  authFormView.hidden = false;
  authSubmit.disabled = true;
  setAuthMessage('The account service could not load. Check your connection and try again.', true);
  setRewardStatus('The rewards service could not load. Check your connection and try again.', true);
}
