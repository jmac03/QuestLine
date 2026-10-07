# RNGDLE-style Game Planning

This document is the conceptual design notebook for the Number Roll mini-game. It explains the game fantasy, backend responsibilities, score model, and the implementation order before any front-end code is built. If you need to understand the intended play loop quickly, read this file from top to bottom and keep the sections in the order they are written.

## Concept

Create a lightweight QuestLine mini-game inspired by rngdle.com, but built around an energy-based roll loop instead of a daily single-number guess. The player spends QuestLine energy to roll a random number, then scores points based on the properties of that number and its rarity. The backend is responsible for energy, score tracking, and persistence; the frontend is simply a clean static interface for rolling and displaying results.

This version should feel like a resource-management game: each roll is a decision, and each cost carries risk and reward.

## Core fantasy

- The player has a current energy pool for the session or for a specific run.
- Every roll costs energy.
- Each roll produces a number in a fixed range.
- The backend evaluates that number for score and badge-style modifiers.
- The player aims to accumulate the highest score possible before energy runs out.
- QuestLine progression can later tie energy recovery to quests, rewards, or timers.

## Backend responsibilities

The backend owns all gameplay state and validation.

- Player energy current value and maximum value
- Energy regeneration or recharge schedule
- Roll cost per action
- Roll generation and validation
- Score calculation from number properties
- Badge logic and rarity weighting
- Persistent statistics such as total score, best roll, and streaks
- Any reward progression or quest-trigger logic

The frontend should never be trusted to decide energy or score. It should only request a roll and render the response.

## MVP gameplay loop

1. The player opens the game and loads their current energy state.
2. The frontend renders a static energy bar and a roll button.
3. The player clicks Roll.
4. The frontend sends a request to the backend with the current session ID and player state.
5. The backend checks whether the player has enough energy.
6. The backend spends energy, generates a number, computes the score, and returns the result.
7. The frontend displays the number, the score gained, and any badge or rarity labels.
8. If the player runs out of energy, the roll button is disabled until the energy regenerates or resets.

## Basic rules

- Range: 1 to 1000 for the first version
- Starting energy: 10
- Cost per roll: 1 energy
- Maximum energy: 10
- Energy regeneration: either timer-based or reward-based in later stages
- Result evaluation: number quality, pattern detection, and rarity tiers
- Win condition: no win condition required in the first version; success is based on score and progression
- Loss condition: the player runs out of energy and can no longer roll

## Score model

The first version should use a simpler scoring system than the full rngdle engine.

Each number can award points for a small set of pattern checks:

- Prime number: +100
- Palindrome: +80
- Even or odd bonus: +20
- Repeating digits: +60
- Pair / triple pattern: +40 to +120
- Lucky number modifier: +50
- High-value number or exact special numbers: +150+
- Total score tier based on rarity:
  - low: 0–29
  - common: 30–79
  - uncommon: 80–149
  - rare: 150–249
  - epic: 250+

This keeps the mechanic understandable while still preserving the “good roll vs bad roll” fantasy.

## Badge-style feedback

For the MVP, do not attempt the full rngdle badge database. Instead, use a small set of badge-like labels that are easy to compute and easy to explain.

Suggested early badge list:

- Prime
- Palindrome
- Double Pair
- Triple Match
- Lucky 7
- Even/Odd
- High Roller
- Low Ball
- Perfect Match
- Rare Number

Each badge can add a small score bonus and appear in the result panel as a label.

## Frontend design: basic roll setup

The frontend design should be simple and static with no animation.

### Layout

- Top bar: QuestLine header and simple nav
- Main game panel:
  - Title: Number Roll
  - Energy bar near the top, always visible
  - Current score block
  - Roll button
  - Number result box
  - Badge list or result summary
- Side or bottom panel:
  - Roll history
  - Best score
  - Energy status

### Energy bar

The energy bar should be a standing, non-animated resource display.

- horizontal bar with fixed height
- current energy value displayed as text
- filled portion reflects current energy as a percentage of max energy
- color changes depending on the state:
  - full: blue / green
  - medium: muted blue
  - low: warm amber
  - empty: gray or red
- no pulsing, no animated fill, no hover effects beyond standard button states

### Result panel

After a roll:

- the number is displayed in large text
- the score gain is shown below it
- badges earned are shown as pills or tags
- overall total score updates
- energy value updates immediately

This is intentionally minimal and clean, in order to prioritize clarity over flair.

## Suggested UI sections

### 1. Header

- QuestLine branding
- short description: "Spend energy to roll a lucky number"

### 2. Energy and score row

- Energy bar
- Current score display
- Best score display

### 3. Roll area

- Large number slot container
- Roll button
- result text such as “Prime”, “Palindrome”, “Rare number”

### 4. Roll history

- last 5 rolls
- each row includes number, score gain, badges

### 5. Reward or progression box

- later use for QuestLine reward points
- for the MVP, this can just hold “Next reward unlock” text

## No-animation design direction

The MVP should not include the reveal sequencing common in the real RNGdle page.

Instead:

- show the number immediately after roll
- update score immediately
- update energy immediately
- keep all transitions simple and static

This is better for a first prototype because it reduces complexity and keeps the focus on game logic and backend-driven progression.

## API design

The frontend should interact with backend endpoints like these:

### GET /api/roll-state

Returns:

```json
{
  "playerId": "user-123",
  "maxEnergy": 10,
  "currentEnergy": 7,
  "totalScore": 420,
  "bestScore": 680,
  "canRoll": true,
  "lastRoll": 42
}
```

### POST /api/roll

Request:

```json
{
  "playerId": "user-123"
}
```

Response:

```json
{
  "roll": 777,
  "scoreGain": 160,
  "badges": ["Lucky 7", "Palindrome", "Rare Number"],
  "totalScore": 580,
  "currentEnergy": 6,
  "maxEnergy": 10,
  "canRoll": true
}
```

If the user has insufficient energy:

```json
{
  "error": "Not enough energy",
  "currentEnergy": 0,
  "canRoll": false
}
```

## Persistence model

A simple backend persistence model for the MVP:

```json
{
  "playerId": "user-123",
  "currentEnergy": 7,
  "maxEnergy": 10,
  "totalScore": 580,
  "bestScore": 680,
  "lastRoll": 777,
  "history": [
    { "roll": 777, "scoreGain": 160, "badges": ["Lucky 7"] },
    { "roll": 42, "scoreGain": 50, "badges": ["Prime"] }
  ]
}
```

## MVP feature set

### Must-have

- frontend shell with energy bar and roll button
- backend energy cost validation
- number generation in a fixed range
- simple badge/pattern scoring
- history list
- total score and best score tracking
- disabled roll state when energy is zero
- responsive layout

### Nice-to-have

- energy regeneration timer
- reward-chest progression
- rarity tiers and more badge logic
- local persistence for convenience only
- future quest integrations

## Stretch goals

- energy recharge from timed recovery
- quest rewards that add energy or score multipliers
- multi-round challenge with target score
- seasonal rarity events
- leaderboard of top scores

## Suggested first implementation order

1. Build the backend player state model and energy rules
2. Create the static frontend panel with the energy bar and roll button
3. Implement the roll endpoint and score logic
4. Add badges and history rendering
5. Add empty-state handling and disabled roll flow

## Design summary

The most practical version of this game is a simple RNGDLE-inspired roll loop with an always-visible energy bar, no animation, and backend-owned scoring. It keeps the fantasy of randomness and rarity, while staying small enough to fit QuestLine and avoid the complexity of the full rngdle engine.

The MVP should focus on a clean, static experience:

- spend energy to roll
- score based on number properties
- show badge-like labels
- keep all progression controlled by the backend

That gives a believable version of the concept without importing the full live-game complexity.
