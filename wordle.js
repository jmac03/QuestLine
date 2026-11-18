(() => {
  const supabase = window.questLineSupabase;
  const login = document.querySelector('#login-required');
  const game = document.querySelector('#wordle-game');
  if (!supabase || !game) return;
  const $ = (selector) => document.querySelector(selector);
  const lengthSelect = $('#word-length'); const guessesSelect = $('#max-guesses');
  const setup = $('#setup-panel'); const play = $('#play-panel'); const result = $('#result-panel');
  const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
  const debugPanel = $('#wordle-debug');
  let gameId = null; let wordLength = 5; let maxGuesses = 5; let currentGuesses = [];
  const modifier = (length) => 0.7 + ((Number(length) - 3) * .15);
  const guessModifier = (guesses) => ({ 3: 1.5, 4: 1.25, 5: 1, 6: 0.9, 7: 0.8, 8: 0.7, 9: 0.6, 10: 0.5 }[Number(guesses)] || 1).toFixed(2);
  if (!guessesSelect.querySelector('option[value="3"]')) guessesSelect.insertAdjacentHTML('afterbegin', '<option value="3">3 guesses · 1.50×</option>');
  [...guessesSelect.options].forEach((option) => { const value = Number(option.value); if (guessModifier(value) !== '1.00') option.textContent = `${value} guesses · ${guessModifier(value)}×`; else option.textContent = `${value} guesses · 1.00×`; });
  guessesSelect.value = '5';
  const setStatus = (message, error = false) => { $('#wordle-status').textContent = message; $('#wordle-status').classList.toggle('is-error', error); };
  const updateDebug = (data, status = 'playing', guessesUsed = currentGuesses.length) => { if (!debugMode) return; debugPanel.hidden = false; $('#debug-target').textContent = data.debugTarget || $('#debug-target').textContent || 'unavailable'; $('#debug-game-id').textContent = data.id || gameId || '—'; $('#debug-status').textContent = data.debugStatus || status; $('#debug-guesses-used').textContent = data.debugGuessesUsed ?? guessesUsed; };
  const updateModifier = () => { const combined = Number(modifier(lengthSelect.value)) * Number(guessModifier(guessesSelect.value)); $('#modifier-value').textContent = `${(Math.round((combined + Number.EPSILON) * 100) / 100).toFixed(2)}×`; };
  const renderBoard = (guesses = []) => {
    const board = $('#board'); board.style.setProperty('--word-length', wordLength); board.replaceChildren();
    for (let row = 0; row < maxGuesses; row += 1) {
      const item = guesses[row]; const rowEl = document.createElement('div'); rowEl.className = 'board-row';
      for (let i = 0; i < wordLength; i += 1) { const tile = document.createElement('div'); tile.className = 'tile'; tile.textContent = item?.word?.[i] || ''; if (item?.feedback?.[i]) tile.classList.add(item.feedback[i].status); rowEl.append(tile); }
      board.append(rowEl);
    }
    $('#guess-count').textContent = `${guesses.length} / ${maxGuesses}`;
  };
  const enterGame = (data) => { gameId = data.id; wordLength = data.wordLength; maxGuesses = data.maxGuesses; currentGuesses = data.guesses || []; lengthSelect.value = wordLength; guessesSelect.value = maxGuesses; setup.hidden = true; result.hidden = true; play.hidden = false; $('#guess-input').maxLength = wordLength; updateDebug(data); if (debugMode) console.debug('[Letter Hunt]', { gameId: data.id, target: data.debugTarget, guesses: currentGuesses }); renderBoard(currentGuesses); $('#guess-input').focus(); };
  const rpc = async (name, args) => { const response = await supabase.rpc(name, args); if (response.error) throw new Error(response.error.message); return response.data; };
  const start = async () => { $('#start-button').disabled = true; try { const started = await rpc('start_wordle_game', { p_word_length: Number(lengthSelect.value), p_max_guesses: Number(guessesSelect.value) }); if (debugMode) { const state = await rpc('get_wordle_state', { p_debug: true }); enterGame({ ...started, ...(state.activeGame || {}) }); } else { enterGame(started); } } catch (error) { setStatus(error.message, true); } finally { $('#start-button').disabled = false; } };
  $('#start-button').addEventListener('click', start); lengthSelect.addEventListener('change', updateModifier); guessesSelect.addEventListener('change', updateModifier); updateModifier();
  $('#guess-form').addEventListener('submit', async (event) => { event.preventDefault(); const input = $('#guess-input'); const guess = input.value.trim().toLowerCase(); if (!guess) return; input.disabled = true;
    try { const data = await rpc('submit_wordle_guess', { p_game_id: gameId, p_guess: guess }); currentGuesses.push({ word: data.guess, feedback: data.feedback }); renderBoard(currentGuesses); input.value = ''; updateDebug({ debugTarget: $('#debug-target').textContent, id: gameId }, data.won ? 'won' : (data.lost ? 'lost' : 'playing'), data.guessesUsed); if (data.won || data.lost) { play.hidden = true; result.hidden = false; $('#result-title').textContent = data.won ? 'Solved.' : 'Out of guesses.'; $('#result-summary').textContent = data.won ? 'A clean solve. Your score reflects the word and the guesses you saved.' : 'The word was still waiting for you.'; $('#result-score').textContent = data.score; $('#result-answer').textContent = data.answer; $('#result-attempts').textContent = `${data.guessesUsed} guesses`; } else { setStatus('Good guess. Keep going.'); } } catch (error) { setStatus(error.message, true); } finally { input.disabled = false; input.focus(); }
  });
  const reset = () => { result.hidden = true; play.hidden = true; setup.hidden = false; setStatus('Good luck.'); }; $('#again-button').addEventListener('click', start); $('#change-settings-button').addEventListener('click', reset);
  (async () => { const { data: sessionData } = await supabase.auth.getSession(); if (!sessionData.session) { login.hidden = false; return; } game.hidden = false; try { const state = await rpc('get_wordle_state', debugMode ? { p_debug: true } : {}); if (state.activeGame) enterGame(state.activeGame); if (debugMode) console.debug('[Letter Hunt] state', state); } catch (error) { setStatus(error.message, true); } })();
})();
