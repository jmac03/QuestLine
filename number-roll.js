const supabaseClient = window.questLineSupabase;
const loginRequired = document.querySelector('#login-required');
const rollGame = document.querySelector('#roll-game');
const playerAvatar = document.querySelector('#player-avatar');
const playerEmail = document.querySelector('#player-email');
const energyCard = document.querySelector('.energy-card');
const energyLabel = document.querySelector('#energy-label');
const energyTrack = document.querySelector('#energy-track');
const energyFill = document.querySelector('#energy-fill');
const energyHint = document.querySelector('#energy-hint');
const totalScore = document.querySelector('#total-score');
const bestScore = document.querySelector('#best-score');
const resultNumber = document.querySelector('#result-number');
const resultRarity = document.querySelector('#result-rarity');
const resultScore = document.querySelector('#result-score');
const badgeList = document.querySelector('#badge-list');
const rollButton = document.querySelector('#roll-button');
const rollStatus = document.querySelector('#roll-status');
const historyList = document.querySelector('#history-list');
const gameError = document.querySelector('#game-error');
const themeStatus = document.querySelector('#theme-status');

let currentUser = null;
let currentState = null;
let requestInProgress = false;
let stateRequestInProgress = false;
let themeRequestId = 0;

function setRollStatus(message, isError = false) {
  rollStatus.textContent = message;
  rollStatus.classList.toggle('is-error', isError);
}

function showGameError(message) {
  gameError.textContent = message;
  gameError.hidden = !message;
}

async function loadRewardTheme(user) {
  const requestId = ++themeRequestId;
  window.questLineRewardTheme?.reset();
  if (!user) {
    window.questLineRewardTheme?.setOwnedGrants(null, []);
    themeStatus.hidden = true;
    themeStatus.textContent = '';
    return;
  }

  if (!supabaseClient || !window.questLineRewardTheme) {
    window.questLineRewardTheme?.setOwnedGrants(null, []);
    themeStatus.textContent = 'Could not verify your earned color scheme. The default colors are being used.';
    themeStatus.hidden = false;
    return;
  }

  try {
    const { data: { user: authenticatedUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError) throw authError;
    if (!authenticatedUser) throw new Error('Sign in to verify earned rewards.');
    if (authenticatedUser.id !== user.id) return;

    const { data, error } = await supabaseClient.from('user_reward_grants')
      .select('id, reward_payload')
      .eq('user_id', authenticatedUser.id);
    if (error) throw error;
    if (requestId !== themeRequestId) return;

    window.questLineRewardTheme.setOwnedGrants(authenticatedUser, data || []);
    themeStatus.hidden = true;
    themeStatus.textContent = '';
  } catch (error) {
    if (requestId !== themeRequestId) return;
    window.questLineRewardTheme.setOwnedGrants(null, []);
    const message = error instanceof Error ? error.message : 'Unknown error';
    themeStatus.textContent = `Could not verify your earned color scheme: ${message}. The default colors are being used.`;
    themeStatus.hidden = false;
  }
}

function formatBadge(badge) {
  return badge.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderBadges(badges = []) {
  badgeList.replaceChildren();
  for (const badge of badges) {
    const pill = document.createElement('span');
    pill.className = 'badge-pill';
    pill.textContent = formatBadge(badge);
    badgeList.append(pill);
  }
}

function renderLatestRoll(roll) {
  if (!roll) {
    resultNumber.textContent = '—';
    resultRarity.textContent = 'Ready when you are';
    resultRarity.removeAttribute('data-rarity');
    resultScore.textContent = '';
    renderBadges();
    return;
  }

  resultNumber.textContent = String(roll.roll_value ?? roll.roll ?? '—');
  resultRarity.textContent = roll.rarity || 'Number rolled';
  resultRarity.dataset.rarity = roll.rarity || '';
  const points = roll.score_gain ?? roll.scoreGain;
  resultScore.textContent = Number.isFinite(points) ? `+${points.toLocaleString()} points` : '';
  renderBadges(roll.badges || []);
}

function renderHistory(rolls = []) {
  historyList.replaceChildren();

  if (!rolls.length) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = 'Your rolls will appear here.';
    historyList.append(empty);
    return;
  }

  for (const roll of rolls.slice(0, 5)) {
    const item = document.createElement('li');
    item.className = 'history-item';

    const number = document.createElement('span');
    number.className = 'history-number';
    number.textContent = String(roll.roll_value);

    const points = document.createElement('span');
    points.className = 'history-points';
    points.textContent = `+${Number(roll.score_gain).toLocaleString()} pts`;

    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = [roll.rarity, ...(roll.badges || []).map(formatBadge)].filter(Boolean).join(' · ') || 'Number rolled';

    item.append(number, points, meta);
    historyList.append(item);
  }
}

function renderState(state) {
  currentState = state;
  const currentEnergy = Number(state.currentEnergy) || 0;
  const maxEnergy = Number(state.maxEnergy) || 0;
  const energyPercent = maxEnergy > 0 ? Math.min(100, (currentEnergy / maxEnergy) * 100) : 0;

  energyLabel.textContent = `${currentEnergy} / ${maxEnergy}`;
  energyFill.style.width = `${energyPercent}%`;
  energyTrack.setAttribute('aria-valuemax', String(maxEnergy));
  energyTrack.setAttribute('aria-valuenow', String(currentEnergy));
  energyCard.dataset.level = currentEnergy === 0 ? 'empty' : currentEnergy <= Math.ceil(maxEnergy / 3) ? 'low' : 'normal';
  energyHint.textContent = state.canRoll
    ? 'Each roll costs 1 energy.'
    : currentEnergy > 0
      ? 'A roll is not available right now.'
      : 'No energy available. Reopen the game later to check again.';
  totalScore.textContent = Number(state.totalScore || 0).toLocaleString();
  bestScore.textContent = Number(state.bestScore || 0).toLocaleString();
  rollButton.disabled = requestInProgress || !state.canRoll;
  rollButton.textContent = state.canRoll ? 'Roll for a number' : 'Out of energy';
  renderHistory(state.recentRolls || []);

  if (state.recentRolls?.length) {
    renderLatestRoll(state.recentRolls[0]);
  } else if (state.lastRoll != null) {
    renderLatestRoll({ roll: state.lastRoll });
  } else {
    renderLatestRoll(null);
  }

  if (!requestInProgress && state.canRoll) setRollStatus('One roll costs one energy.');
  if (!state.canRoll) {
    setRollStatus(currentEnergy > 0 ? 'A roll is not available right now.' : 'You are out of energy.');
  }
}

async function loadRollState() {
  if (!currentUser || !supabaseClient || requestInProgress || stateRequestInProgress) return;

  stateRequestInProgress = true;
  rollButton.disabled = true;
  rollButton.textContent = 'Loading game…';
  setRollStatus('Loading your game state…');
  try {
    const { data, error } = await supabaseClient.rpc('get_roll_state');
    if (error) throw error;
    if (!data) throw new Error('The game returned an empty state.');

    showGameError('');
    renderState(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    showGameError(`Could not load your game state: ${message}`);
    setRollStatus('Your game state could not be loaded.', true);
    rollButton.textContent = 'Try again';
    rollButton.disabled = false;
  } finally {
    stateRequestInProgress = false;
  }
}

function showLogin() {
  currentUser = null;
  loginRequired.hidden = false;
  rollGame.hidden = true;
  showGameError('');
}

async function showPlayer(user) {
  if (!user) {
    showLogin();
    await loadRewardTheme(null);
    return;
  }

  loginRequired.hidden = true;
  rollGame.hidden = false;
  playerEmail.textContent = user.email || 'QuestLine player';
  playerAvatar.textContent = (user.email || 'Q').slice(0, 1).toUpperCase();

  const isNewUser = currentUser?.id !== user.id;
  if (isNewUser) {
    currentUser = user;
    currentState = null;
  }
  await Promise.all([
    loadRewardTheme(user),
    isNewUser ? loadRollState() : Promise.resolve(),
  ]);
}

rollButton.addEventListener('click', async () => {
  if (!currentUser || requestInProgress) return;
  if (!currentState) {
    await loadRollState();
    return;
  }
  if (!currentState.canRoll) return;

  requestInProgress = true;
  rollButton.disabled = true;
  rollButton.textContent = 'Rolling…';
  setRollStatus('Requesting a roll…');
  showGameError('');
  let rollSaved = false;

  try {
    const { data, error } = await supabaseClient.rpc('roll_number', {
      p_request_id: crypto.randomUUID(),
    });
    if (error) throw error;
    if (!data) throw new Error('The game returned an empty roll.');
    rollSaved = true;

    renderLatestRoll(data);
    currentState = {
      ...currentState,
      canRoll: data.canRoll,
      currentEnergy: data.currentEnergy,
      maxEnergy: data.maxEnergy,
      totalScore: data.totalScore,
      bestScore: data.bestScore,
      lastRoll: data.roll,
      recentRolls: [{
        roll_value: data.roll,
        score_gain: data.scoreGain,
        rarity: data.rarity,
        badges: data.badges || [],
      }, ...(currentState.recentRolls || [])].slice(0, 5),
    };
    renderState(currentState);
    setRollStatus(`You rolled ${data.roll} and earned ${Number(data.scoreGain).toLocaleString()} points.`);

    const { data: updatedState, error: stateError } = await supabaseClient.rpc('get_roll_state');
    if (stateError) {
      setRollStatus(`Roll saved, but history could not be refreshed: ${stateError.message}`, true);
      return;
    }
    if (!updatedState) {
      setRollStatus('Roll saved, but history returned an empty state.', true);
      return;
    }

    renderState(updatedState);
    renderLatestRoll(data);
    setRollStatus(`You rolled ${data.roll} and earned ${Number(data.scoreGain).toLocaleString()} points.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The roll request could not be completed.';
    setRollStatus(rollSaved ? `Roll saved, but the game could not refresh: ${message}` : message, true);
    rollButton.disabled = !currentState.canRoll;
    rollButton.textContent = currentState.canRoll ? 'Roll for a number' : 'Out of energy';
  } finally {
    requestInProgress = false;
    if (currentState) {
      rollButton.disabled = !currentState.canRoll;
      rollButton.textContent = currentState.canRoll ? 'Roll for a number' : 'Out of energy';
    }
  }
});

if (!supabaseClient) {
  showLogin();
  showGameError('The account service could not load. Check your connection and reload the page.');
} else {
  let activeUserId = null;
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    const user = session?.user || null;
    const nextUserId = user?.id || null;
    if (user && currentUser?.id === user.id) void loadRewardTheme(user);
    if (activeUserId === nextUserId && (nextUserId || !currentUser)) return;
    activeUserId = nextUserId;
    void showPlayer(user);
  });

  supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) {
      showLogin();
      showGameError(`Could not check your sign-in: ${error.message}`);
      return;
    }
    const user = data.session?.user || null;
    activeUserId = user?.id || null;
    void showPlayer(user);
  }).catch((error) => {
    showLogin();
    showGameError(`Could not check your sign-in: ${error instanceof Error ? error.message : 'Unknown error'}`);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser) void loadRollState();
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted && currentUser) void loadRollState();
  });
}
