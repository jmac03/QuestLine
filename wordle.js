(() => {
  const supabase = window.questLineSupabase;
  const login = document.querySelector('#login-required');
  const game = document.querySelector('#wordle-game');
  if (!supabase || !game) return;
  const $ = (selector) => document.querySelector(selector);
  const lengthSelect = $('#word-length'); const guessesSelect = $('#max-guesses');
  const setup = $('#setup-panel'); const play = $('#play-panel'); const result = $('#result-panel');
  let gameId = null; let wordLength = 5; let maxGuesses = 6; let currentGuesses = [];
  const modifier = (length) => (0.7 + ((Number(length) - 3) * .15)).toFixed(2);
  const setStatus = (message, error = false) => { $('#wordle-status').textContent = message; $('#wordle-status').classList.toggle('is-error', error); };
  const updateModifier = () => { $('#modifier-value').textContent = `${modifier(lengthSelect.value)}×`; };
  const renderBoard = (guesses = []) => {
    const board = $('#board'); board.style.setProperty('--word-length', wordLength); board.replaceChildren();
    for (let row = 0; row < maxGuesses; row += 1) {
      const item = guesses[row]; const rowEl = document.createElement('div'); rowEl.className = 'board-row';
      for (let i = 0; i < wordLength; i += 1) { const tile = document.createElement('div'); tile.className = 'tile'; tile.textContent = item?.word?.[i] || ''; if (item?.feedback?.[i]) tile.classList.add(item.feedback[i].status); rowEl.append(tile); }
      board.append(rowEl);
    }
    $('#guess-count').textContent = `${guesses.length} / ${maxGuesses}`;
  };
  const enterGame = (data) => { gameId = data.id; wordLength = data.wordLength; maxGuesses = data.maxGuesses; currentGuesses = data.guesses || []; lengthSelect.value = wordLength; guessesSelect.value = maxGuesses; setup.hidden = true; result.hidden = true; play.hidden = false; $('#guess-input').maxLength = wordLength; renderBoard(currentGuesses); $('#guess-input').focus(); };
  const rpc = async (name, args) => { const response = await supabase.rpc(name, args); if (response.error) throw new Error(response.error.message); return response.data; };
  const start = async () => { $('#start-button').disabled = true; try { enterGame(await rpc('start_wordle_game', { p_word_length: Number(lengthSelect.value), p_max_guesses: Number(guessesSelect.value) })); } catch (error) { setStatus(error.message, true); } finally { $('#start-button').disabled = false; } };
  $('#start-button').addEventListener('click', start); lengthSelect.addEventListener('change', updateModifier); updateModifier();
  $('#guess-form').addEventListener('submit', async (event) => { event.preventDefault(); const input = $('#guess-input'); const guess = input.value.trim().toLowerCase(); if (!guess) return; input.disabled = true;
    try { const data = await rpc('submit_wordle_guess', { p_game_id: gameId, p_guess: guess }); currentGuesses.push({ word: data.guess, feedback: data.feedback }); renderBoard(currentGuesses); input.value = ''; if (data.won || data.lost) { play.hidden = true; result.hidden = false; $('#result-title').textContent = data.won ? 'Solved.' : 'Out of guesses.'; $('#result-summary').textContent = data.won ? 'A clean solve. Your score reflects the word and the guesses you saved.' : 'The word was still waiting for you.'; $('#result-score').textContent = data.score; $('#result-answer').textContent = data.answer; $('#result-attempts').textContent = `${data.guessesUsed} guesses`; } else { setStatus('Good guess. Keep going.'); } } catch (error) { setStatus(error.message, true); } finally { input.disabled = false; input.focus(); }
  });
  const reset = () => { result.hidden = true; play.hidden = true; setup.hidden = false; setStatus('Good luck.'); }; $('#again-button').addEventListener('click', start); $('#change-settings-button').addEventListener('click', reset);
  (async () => { const { data: sessionData } = await supabase.auth.getSession(); if (!sessionData.session) { login.hidden = false; return; } game.hidden = false; try { const state = await rpc('get_wordle_state', {}); if (state.activeGame) enterGame(state.activeGame); } catch (error) { setStatus(error.message, true); } })();
})();
