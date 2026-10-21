/* Type Sprint keeps all round state in the browser. */
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

const settings = { duration: 30, pack: 'sentences' };
const standardWordLength = 5;
const bestKey = 'questline-type-sprint-best';
const settingsPanel = document.querySelector('#settings-panel');
const gamePanel = document.querySelector('#game-panel');
const resultPanel = document.querySelector('#result-panel');
const typingInput = document.querySelector('#typing-input');

let prompt = '';
let startedAt = 0;
let timer = null;
let finished = false;

function updatePackNote() {
  const isWordPack = settings.pack === 'words';
  document.querySelector('#pack-note-title').textContent = isWordPack ? 'Word burst pack' : 'Sentence pack';
  document.querySelector('#pack-note-copy').textContent = isWordPack
    ? 'Clean, quick words for a simple rhythm warm-up.'
    : 'Short, natural lines with punctuation and rhythm.';
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
}

function finishRound() {
  if (finished) return;
  finished = true;
  clearInterval(timer);
  timer = null;
  typingInput.disabled = true;

  const speed = getWpm();
  const accuracy = getAccuracy();
  const previousBest = Number(localStorage.getItem(bestKey) || 0);
  const best = Math.max(speed, previousBest);

  localStorage.setItem(bestKey, best);
  document.querySelector('#best-wpm').textContent = best;
  document.querySelector('#result-wpm').textContent = speed;
  document.querySelector('#result-accuracy').textContent = accuracy;
  document.querySelector('#result-characters').textContent = typingInput.value.length;
  document.querySelector('#result-summary').textContent = `You typed ${typingInput.value.length} characters at ${speed} WPM with ${accuracy}% accuracy.`;
  document.querySelector('#result-title').textContent = accuracy >= 95 ? 'Beautiful control.' : accuracy >= 85 ? 'Nice run.' : 'Good foundation.';

  gamePanel.hidden = true;
  resultPanel.hidden = false;
}

function updateTimer() {
  const secondsPassed = Math.floor((Date.now() - startedAt) / 1000);
  const secondsLeft = Math.max(0, settings.duration - secondsPassed);
  document.querySelector('#time-value').textContent = secondsLeft;

  if (!secondsLeft) finishRound();
}

function startRound() {
  clearInterval(timer);
  timer = null;
  startedAt = 0;
  prompt = makePrompt();
  finished = false;
  typingInput.value = '';
  typingInput.disabled = false;
  document.querySelector('#time-value').textContent = settings.duration;
  document.querySelector('#wpm-value').textContent = 0;
  document.querySelector('#accuracy-value').textContent = 100;
  document.querySelector('#progress-value').textContent = 0;
  document.querySelector('#round-status').textContent = 'The clock starts with your first key.';
  renderPrompt();
  settingsPanel.hidden = true;
  resultPanel.hidden = true;
  gamePanel.hidden = false;
  typingInput.focus();
}

function showBestScore() {
  document.querySelector('#best-wpm').textContent = localStorage.getItem(bestKey) || '—';
}

document.querySelectorAll('.choice-button').forEach((button) => {
  button.addEventListener('click', () => {
    const setting = button.dataset.setting;
    settings[setting] = setting === 'duration' ? Number(button.dataset.value) : button.dataset.value;

    document.querySelectorAll(`[data-setting="${setting}"]`).forEach((choice) => {
      choice.classList.toggle('is-selected', choice === button);
    });

    updatePackNote();
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

typingInput.addEventListener('input', () => {
  if (!startedAt) {
    startedAt = Date.now();
    timer = setInterval(updateTimer, 250);
  }

  updateStats();
  if (typingInput.value.length >= prompt.length) finishRound();
});

showBestScore();
updatePackNote();
