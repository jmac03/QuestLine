/* Type Sprint keeps the latest completed run locally and syncs it when possible.
   Account sync requires the complete_typing_round database function; guest
   play and local persistence work without Supabase. */
const prompts = {
  sentences: [
    'A clear morning makes room for a bright idea.',
    'Small steps turn a long path into a steady rhythm.',
    'The best practice is patient, focused, and repeatable.',
    'Take a breath, find the beat, and let your hands move.',
    'Curiosity opens doors that confidence has not noticed yet.',
    'A warm cup, a good song, and a little time can reset the day.',
    'Bright notes travel farther when every letter has a place.'
  ],
  words: [
    'quiet', 'bright', 'steady', 'garden', 'planet', 'window', 'gentle', 'forest',
    'pencil', 'journey', 'coffee', 'sunrise', 'curious', 'balance', 'lantern',
    'puzzle', 'meadow', 'silver', 'thunder', 'violet', 'ripple', 'courage',
    'horizon', 'kindness', 'picture', 'harbor', 'shelter', 'wonder', 'compass',
    'morning'
  ]
};

const settings = { duration: 30, pack: 'sentences', mode: 'solo', ghostWpm: 45 };
const standardWordLength = 5;
// Temporary diagnostics: set to false to hide this entire readout later.
const rewardProgressDebugEnabled = true;
// Keep score records separate from the legacy WPM record so old WPM values
// cannot appear as a score after the scoring model changes.
const bestKey = 'questline-type-sprint-best-score';
const latestRunKey = 'questline-type-sprint-latest-run';
const supabaseClient = window.questLineSupabase;
const settingsPanel = document.querySelector('#settings-panel');
const gamePanel = document.querySelector('#game-panel');
const resultPanel = document.querySelector('#result-panel');
const typingInput = document.querySelector('#typing-input');
const ghostRace = document.querySelector('#ghost-race');
const playerProgress = document.querySelector('#player-progress');
const ghostProgress = document.querySelector('#ghost-progress');
const ghostSpeedSetting = document.querySelector('#ghost-speed-setting');
const ghostSpeedNote = document.querySelector('#ghost-speed-note');
const rewardProgressDebug = document.querySelector('#reward-progress-debug');
const rewardProgressDebugStatus = document.querySelector('#reward-progress-debug-status');
const rewardDebugTrack = document.querySelector('#reward-debug-track');
const rewardDebugPoints = document.querySelector('#reward-debug-points');
const rewardDebugScore = document.querySelector('#reward-debug-score');
const rewardDebugProgressBar = document.querySelector('#reward-debug-progress-bar');
const rewardDebugProgress = document.querySelector('.typing-debug-progress');
const rewardDebugProgressLabel = document.querySelector('#reward-debug-progress-label');

let prompt = '';
let startedAt = 0;
let timer = null;
let finished = false;
let activeUser = null;
let completedCharacters = 0;
let ghostLost = false;
let mistakeCount = 0;
let lastInputValue = '';

function readLatestRun() {
  try {
    const value = JSON.parse(localStorage.getItem(latestRunKey) || 'null');
    return value && value.version === 1 ? value : null;
  } catch {
    return null;
  }
}

function saveLatestRun(run) {
  localStorage.setItem(latestRunKey, JSON.stringify(run));
}

function resetRewardProgressDebug(message = 'Sign in and select a reward track to inspect the combined score from both games.') {
  if (!rewardProgressDebug) return;
  rewardProgressDebug.hidden = !rewardProgressDebugEnabled;
  if (!rewardProgressDebugEnabled) return;
  rewardProgressDebugStatus.textContent = message;
  rewardDebugTrack.textContent = '—';
  rewardDebugPoints.textContent = '0';
  rewardDebugScore.textContent = '0 / 0';
  rewardDebugProgressBar.style.width = '0%';
  rewardDebugProgress.setAttribute('aria-valuenow', '0');
  rewardDebugProgressLabel.textContent = '0%';
}

async function loadRewardProgressDebug(user = activeUser) {
  if (!rewardProgressDebugEnabled || !rewardProgressDebug || !user || !supabaseClient) {
    if (rewardProgressDebug) rewardProgressDebug.hidden = true;
    return;
  }

  rewardProgressDebug.hidden = false;
  rewardProgressDebugStatus.textContent = 'Loading reward-track progress…';

  try {
    const [selectionResult, tracksResult, progressResult] = await Promise.all([
      supabaseClient.from('user_reward_track_selections')
        .select('track_id')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabaseClient.from('reward_tracks')
        .select('id, name, score_step, points_per_score_milestone')
        .eq('is_active', true),
      supabaseClient.from('user_reward_track_progress')
        .select('track_id, points, score_remainder')
        .eq('user_id', user.id),
    ]);

    for (const result of [selectionResult, tracksResult, progressResult]) {
      if (result.error) throw result.error;
    }

    const selectedTrackId = selectionResult.data?.track_id;
    const track = (tracksResult.data || []).find((item) => item.id === selectedTrackId);
    if (!track) {
      resetRewardProgressDebug('No active reward track is selected for this account.');
      return;
    }

    const progress = (progressResult.data || []).find((item) => item.track_id === track.id) || {};
    const scoreStep = Math.max(0, Number(track.score_step) || 0);
    const scoreRemainder = Math.max(0, Number(progress.score_remainder) || 0);
    const percent = scoreStep ? Math.min(100, Math.round(scoreRemainder / scoreStep * 100)) : 0;

    rewardProgressDebugStatus.textContent = 'Combined Number Roll + Type Sprint score after completed rounds.';
    rewardDebugTrack.textContent = track.name || 'Selected track';
    rewardDebugPoints.textContent = (Number(progress.points) || 0).toLocaleString();
    rewardDebugScore.textContent = `${scoreRemainder.toLocaleString()} / ${scoreStep.toLocaleString()}`;
    rewardDebugProgressBar.style.width = `${percent}%`;
    rewardDebugProgress.setAttribute('aria-valuenow', String(percent));
    rewardDebugProgressLabel.textContent = `${percent}% toward the next reward-track point`;
  } catch (error) {
    resetRewardProgressDebug(`Could not load debug progress: ${error.message || 'unknown error'}`);
  }
}

async function syncLatestRun(user = activeUser) {
  const run = readLatestRun();
  if (!user || !supabaseClient || !run || run.submittedUserId === user.id) return;

  const recordedMistakes = Number.isFinite(Number(run.mistakes))
    ? Math.max(0, Number(run.mistakes))
    : 0;
  const { data, error } = await supabaseClient.rpc('complete_typing_round', {
    p_request_id: run.requestId,
    p_duration_seconds: run.durationSeconds,
    p_prompt_pack: run.promptPack,
    p_prompt: run.prompt,
    p_typed_text: run.typedText,
    p_elapsed_ms: run.elapsedMs,
    p_mistakes: recordedMistakes,
  });

  if (error) {
    console.warn('Could not sync the latest Type Sprint run.', error);
    return;
  }

  // Keep the run locally until the next run replaces it, but mark it as safely
  // assigned so a later account on the same browser cannot receive it too.
  const serverScore = Number.isFinite(Number(data?.score))
    ? Math.max(0, Number(data.score))
    : null;
  saveLatestRun({
    ...run,
    ...(serverScore == null ? {} : { score: serverScore }),
    submittedUserId: user.id,
    serverResult: data || null,
  });

  if (serverScore != null) {
    document.querySelector('#result-score').textContent = serverScore;
    document.querySelector('#result-summary').textContent = `You typed ${run.typedText.length} characters at ${data.wpm} WPM with ${data.accuracy}% accuracy, ${run.mistakes || 0} mistakes, and a record score of ${serverScore}.`;
  }

  void loadRewardProgressDebug(user);

  if (data?.score != null) {
    const best = Math.max(serverScore || 0, Number(localStorage.getItem(bestKey) || 0));
    localStorage.setItem(bestKey, String(best));
    document.querySelector('#best-score').textContent = best;
  }
}

function updatePackNote() {
  const isWordPack = settings.pack === 'words';
  document.querySelector('#pack-note-title').textContent = isWordPack ? 'Word burst pack' : 'Sentence pack';
  document.querySelector('#pack-note-copy').textContent = isWordPack
    ? 'Clean, quick words for a simple rhythm warm-up.'
    : 'Short, natural lines with punctuation and rhythm.';
}

function updateGhostDescription() {
  if (!ghostSpeedNote) return;
  ghostSpeedNote.textContent = `The ghost targets ${settings.ghostWpm} WPM. Win by finishing the prompt before the ghost reaches the finish; each mistake gives it extra ground.`;
}

function makePrompt() {
  if (settings.pack === 'words') {
    const wordCount = Math.max(8, Math.round(settings.duration / 2));
    const words = [];

    for (let index = 0; index < wordCount; index += 1) {
      const word = prompts.words[Math.floor(Math.random() * prompts.words.length)];
      words.push(word);
    }

    return words.join(' ');
  }

  const sentenceIndex = Math.floor(Math.random() * prompts.sentences.length);
  return prompts.sentences[sentenceIndex];
}

function renderPrompt() {
  const typedText = typingInput.value;
  const promptElement = document.querySelector('#typing-prompt');
  promptElement.replaceChildren();

  [...prompt].forEach((character, index) => {
    const characterElement = document.createElement('span');
    characterElement.textContent = character;

    if (index < typedText.length) {
      characterElement.className = typedText[index] === character ? 'correct' : 'incorrect';
    } else if (index === typedText.length) {
      characterElement.className = 'current';
    }

    promptElement.append(characterElement);
  });

  const progress = Math.min(100, Math.round((typedText.length / prompt.length) * 100));
  document.querySelector('#progress-value').textContent = progress;
}

function getAccuracy() {
  const typedText = typingInput.value;
  if (!typedText.length) return 100;

  let correctCharacters = 0;
  [...typedText].forEach((character, index) => {
    if (character === prompt[index]) correctCharacters += 1;
  });

  return Math.round((correctCharacters / typedText.length) * 100);
}

function getWpm() {
  const elapsedMinutes = Math.max(1 / 60, (Date.now() - startedAt) / 60000);
  const standardWords = typingInput.value.length / standardWordLength;
  return Math.round(standardWords / elapsedMinutes);
}

function updateStats() {
  document.querySelector('#accuracy-value').textContent = getAccuracy();
  document.querySelector('#wpm-value').textContent = getWpm();
  renderPrompt();
  updateGhostRace();
}

function updateGhostRace() {
  if (settings.mode !== 'ghost' || !startedAt) return;
  const playerPercent = Math.min(100, Math.round((typingInput.value.length / prompt.length) * 100));
  const secondsPassed = Math.max(0, (Date.now() - startedAt) / 1000);
  const ghostSeconds = (prompt.length / standardWordLength) / settings.ghostWpm * 60;
  const ghostPercent = Math.min(100, Math.round((secondsPassed / ghostSeconds) * 100) + mistakeCount * 2);
  playerProgress.style.width = `${playerPercent}%`;
  ghostProgress.style.width = `${ghostPercent}%`;
  if (ghostPercent >= 100 && playerPercent < 100) ghostLost = true;
}

function finishRound() {
  if (finished) return;
  finished = true;
  clearInterval(timer);
  timer = null;
  typingInput.disabled = true;

  const speed = getWpm();
  const accuracy = getAccuracy();
  const score = Math.max(0, Math.round(speed * accuracy / 100) - mistakeCount * 2);
  const previousBest = Number(localStorage.getItem(bestKey) || 0);
  const best = Math.max(score, previousBest);

  localStorage.setItem(bestKey, best);
  saveLatestRun({
    version: 1,
    requestId: crypto.randomUUID(),
    durationSeconds: settings.duration,
    promptPack: settings.pack,
    prompt,
    typedText: typingInput.value,
    elapsedMs: startedAt ? Math.max(1, Date.now() - startedAt) : 0,
    mistakes: mistakeCount,
    score,
    submittedUserId: null,
    createdAt: new Date().toISOString(),
  });
  void syncLatestRun();
  document.querySelector('#best-score').textContent = best;
  document.querySelector('#result-wpm').textContent = speed;
  document.querySelector('#result-accuracy').textContent = accuracy;
  document.querySelector('#result-score').textContent = score;
  document.querySelector('#result-mistakes').textContent = mistakeCount;
  document.querySelector('#result-characters').textContent = typingInput.value.length;
  document.querySelector('#result-summary').textContent = `You typed ${typingInput.value.length} characters at ${speed} WPM with ${accuracy}% accuracy, ${mistakeCount} mistakes, and a record score of ${score}.`;
  document.querySelector('#result-title').textContent = settings.mode === 'ghost' && ghostLost ? 'The ghost got there first.' : accuracy >= 95 ? 'Beautiful control.' : accuracy >= 85 ? 'Nice run.' : 'Good foundation.';

  gamePanel.hidden = true;
  resultPanel.hidden = false;
}

function updateTimer() {
  const secondsPassed = Math.floor((Date.now() - startedAt) / 1000);
  const secondsLeft = Math.max(0, settings.duration - secondsPassed);
  document.querySelector('#time-value').textContent = secondsLeft;
  updateGhostRace();

  if (!secondsLeft) finishRound();
}

function startRound() {
  clearInterval(timer);
  timer = null;
  startedAt = 0;
  completedCharacters = 0;
  ghostLost = false;
  mistakeCount = 0;
  lastInputValue = '';
  prompt = makePrompt();
  finished = false;
  typingInput.value = '';
  typingInput.disabled = false;
  document.querySelector('#time-value').textContent = settings.duration;
  document.querySelector('#wpm-value').textContent = 0;
  document.querySelector('#accuracy-value').textContent = 100;
  document.querySelector('#mistakes-value').textContent = 0;
  document.querySelector('#progress-value').textContent = 0;
  ghostRace.hidden = settings.mode !== 'ghost';
  ghostSpeedSetting.hidden = false;
  playerProgress.style.width = '0%';
  ghostProgress.style.width = '0%';
  document.querySelector('#round-status').textContent = settings.mode === 'ghost'
    ? `The ghost is targeting ${settings.ghostWpm} WPM. Finish before it reaches the line.`
    : 'The clock starts with your first key.';
  renderPrompt();
  settingsPanel.hidden = true;
  resultPanel.hidden = true;
  gamePanel.hidden = false;
  typingInput.focus();
}

function showBestScore() {
  document.querySelector('#best-score').textContent = localStorage.getItem(bestKey) || '0';
}

document.querySelectorAll('.choice-button').forEach((button) => {
  button.addEventListener('click', () => {
    const setting = button.dataset.setting;
    settings[setting] = ['duration', 'ghostWpm'].includes(setting) ? Number(button.dataset.value) : button.dataset.value;

    document.querySelectorAll(`[data-setting="${setting}"]`).forEach((choice) => {
      choice.classList.toggle('is-selected', choice === button);
    });

    updatePackNote();
    if (setting === 'mode') ghostSpeedSetting.setAttribute('aria-disabled', String(settings.mode !== 'ghost'));
    if (setting === 'ghostWpm') updateGhostDescription();
  });
});

document.querySelector('#start-button').addEventListener('click', startRound);
document.querySelector('#again-button').addEventListener('click', startRound);
document.querySelector('#change-settings-button').addEventListener('click', () => {
  resultPanel.hidden = true;
  settingsPanel.hidden = false;
});
document.querySelector('#quit-button').addEventListener('click', finishRound);
document.querySelector('#new-prompt-button').addEventListener('click', () => {
  prompt = makePrompt();
  typingInput.value = '';
  renderPrompt();
  typingInput.focus();
});

if (ghostRace) ghostRace.hidden = true;

typingInput.addEventListener('input', () => {
  if (!startedAt) {
    startedAt = Date.now();
    timer = setInterval(updateTimer, 250);
  }

  const nextValue = typingInput.value;
  if (nextValue.length > lastInputValue.length) {
    for (let index = lastInputValue.length; index < nextValue.length; index += 1) {
      if (nextValue[index] !== prompt[index]) mistakeCount += 1;
    }
  }
  lastInputValue = nextValue;
  document.querySelector('#mistakes-value').textContent = mistakeCount;
  updateStats();
  if (typingInput.value.length >= prompt.length) finishRound();
});

showBestScore();
updatePackNote();
updateGhostDescription();

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    activeUser = session?.user || null;
    if (!activeUser) resetRewardProgressDebug();
    void syncLatestRun(activeUser);
    void loadRewardProgressDebug(activeUser);
  });

  supabaseClient.auth.getSession()
    .then(({ data }) => {
      activeUser = data.session?.user || null;
      if (!activeUser) resetRewardProgressDebug();
      void syncLatestRun(activeUser);
      void loadRewardProgressDebug(activeUser);
    })
    .catch((error) => console.warn('Could not restore the Type Sprint session.', error));
}
