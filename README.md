# QuestLine

QuestLine is a front-end layout for a personal game library. It includes Number Roll, a Supabase-backed energy and score game, plus Type Sprint, a local speed-typing game with clean prompt packs.

## Quick reading guide

This project is easiest to understand by reading it in this order:

1. `index.html` defines the library page structure and the reward/account UI.
2. `style.css` governs the shared visual system and page layout.
3. `supabase-client.js` wires the browser to the Supabase project.
4. `site-ui.js` owns shared favicon and background-music behavior.
5. `app.js` loads reward data and handles sign-in / sign-out.
6. `reward-theme.js` validates and applies earned color themes.
7. `number-roll.html`, `number-roll.css`, and `number-roll.js` build the actual game screen.
8. `typing.html`, `typing.css`, and `typing.js` build the second game: settings, timed gameplay, sentence/word prompts, and local personal-best tracking.
9. `assets/` contains the trimmed background music tracks.
10. `song-rewards.js` contains the local song catalog and combines built-in songs with the signed-in user's reward grants.

## Run the app

Serve the project over HTTP using the **Live Server** extension in VS Code or another static web server. The app uses the Supabase JavaScript CDN and connects to project `obbxdederwlzeoudajhi`. The project URL and browser-safe publishable key are configured in `supabase-client.js`; never put a Supabase secret or service-role key in frontend code.

## Login and Supabase setup

1. In the Supabase dashboard for project `obbxdederwlzeoudajhi`, enable **Authentication Ã¢â€ â€™ Providers Ã¢â€ â€™ Email**.
2. Set **Authentication Ã¢â€ â€™ URL Configuration Ã¢â€ â€™ Site URL** to the deployed app's base URL.
3. Add the app URLs to **Redirect URLs**: at minimum the hosted `index.html` and `number-roll.html` URLs. For local testing, allow the matching Live Server origin and paths (for example `http://127.0.0.1:5500/**`).
4. Use the profile control on the library page to create an account or sign in. After account creation, the form switches back to Sign in so the new account can be used immediately.
5. Once signed in, select **Number Roll**. Its separate page restores the same-origin Supabase session and gates game access on a signed-in user.

The game invokes the existing `get_roll_state` and `roll_number` Postgres RPC functions as the authenticated user. Both functions must be available to the `authenticated` role; the roll function must validate energy and award score server-side. The page does not calculate or persist scores in the browser.

The dedicated Rewards page loads active reward tracks, the signed-in user's selection and point progress, track milestones, and granted rewards. Select a track with **Choose this track**; the page saves the choice through the `select_reward_track` RPC. These reward tables and the RPC must be available to the authenticated user in Supabase.

Song rewards are currently stored in the app's local catalog in `song-rewards.js`. Grant creation remains server-controlled: write a payload such as `{"type":"song","song_id":"fire-behind-the-weave"}` into the existing `user_reward_grants.reward_payload` column. The music picker combines the built-in songs with songs returned by `window.questLineSongs.listOwned()`, and filters every reward song against the shared catalog. Music preferences are stored only in browser `localStorage`, scoped per signed-in user (or the guest device), with a page override winning over the profile default, which wins over that page's built-in song.

The migration `supabase/migrations/20261019000001_song_reward_grants.sql` adds the server-only `grant_song_reward` helper for creating that payload without storing song metadata in Supabase. Apply `supabase/migrations/20261023000001_secure_account_rows.sql` to enable row-level security for account-owned reward, progress, and track-selection rows; client writes remain blocked while server-side RPCs and service-role jobs retain control.


The `supabase/functions/claim-reward/index.ts` edge function is deployed in Supabase as `claim-song-reward`. The Rewards UI displays **Claim song** for a reached song milestone on the selected track and calls `claim-song-reward` with only `{ "milestone_id": "..." }`. The function authenticates the caller, derives the user from the JWT, verifies the selected track and point threshold, reads the song ID from the milestone's server-side payload, prevents an already-granted song from being claimed again, and calls the restricted database function with the service role. It never trusts a client-provided user ID or song ID.

To add a local song, place its audio file under `assets/` and add a matching entry to `localSongCatalog` in `song-rewards.js`. Then create a reward milestone whose `reward_payload` is `{"type":"song","song_id":"your-song-id"}`. For example, the Veyrith reward uses `veyriths-transformation`. After the user reaches the milestone, selects that track, and clicks **Claim song**, the edge function creates the grant. The future song picker can call `window.questLineSongs.listOwned()` to receive only songs referenced by the user's grants.

An earned color-scheme grant can be equipped from its reward-history card. The equipped grant ID is saved in browser `localStorage`, scoped to the signed-in user's ID. On each page load, color values are read only from that authenticated user's `user_reward_grants` rows and validated before applying them as CSS custom-property overrides; a cached ID is used only if it matches a verified grant. The stylesheet's `:root` values remain the defaults. The grants table must only allow users to read their own rows; grant creation and modification should remain server-controlled. If the grant cannot be verified, the app reverts to the defaults. This browser-side preference is cosmetic and must not be used as proof of reward ownership by server-side features.

## Number Roll

Each roll costs one energy. The game page shows current/max energy, total and best score, the most recent number with backend-provided rarity and badges, and the five most recent rolls. When opened or brought back into view, it calls `get_roll_state` again and refreshes the displayed energy and scores from Supabase. If the user is out of energy, reopening the game checks the current server-side state and enables rolling again if energy is available. Roll generation, scoring, and energy are owned by the Supabase RPCs. If the user is signed out, the game offers a link to sign in or create an account and returns to the game after successful sign-in.

## What each file does

### `index.html`: the content and structure

HTML is the language used to describe what appears on a web page. Tags such as `<header>`, `<main>`, `<section>`, and `<footer>` divide the page into meaningful regions.

- The `<header>` contains the QuestLine wordmark, navigation links, and the account control.
- The library `<section>` is the main page. It links to Number Roll and has two reserved game slots.
- `rewards.html` displays available reward tracks, point progress, milestones, and granted rewards; the library page links there instead of duplicating the full dashboard.

### `style.css`: the visual design

CSS is the language that controls appearance and layout. Variables such as `--blue` and `--paper` store reusable colors.

- The header and navigation use flexbox, which places items in a row and makes spacing predictable.
- The game grid and rewards area use CSS grid, which divides space into columns.
- The QuestLine wordmark uses a `::after` pseudo-element to draw a line beneath `Line`, extending from the bottom of the `L` under `ine`.
- The `:hover` rule gives the empty cards a small response without making them look like finished games.
- The `@media` rule changes the three-column grid into a single column on smaller screens. This is called responsive design.

The `supabase-client.js` file creates the browser client for this Supabase project. The `site-ui.js` file provides shared favicon and background-music behavior. The `app.js` file handles account creation, sign-in, session restoration, sign out, and reward track data on the library page. The `number-roll.html` and `number-roll.js` files provide the separate, authenticated game page and call the database RPCs.

### Color choices

The original palette uses charcoal, cream, and lime for a warm, playful foundation. The previous orange accent has been replaced with a mellow blue so the logo, profile badge, and rewards number feel calmer without changing the rest of the design.

- `--ink` is a deep charcoal for readable primary text.
- `--muted` is a soft gray-green for secondary labels and descriptions.
- `--paper` is a warm off-white page background.
- `--cream` separates the empty game cards from the page without creating a harsh contrast.
- `--line` creates subtle borders.
- `--lime` is used for the hover shadow to add energy when a card is explored.
- `--blue` replaces the orange accent with a relaxed blue for the logo underline, profile circle, and reward number.
