# QuestLine

QuestLine is a standalone front-end layout for a personal library of games. It currently contains three reserved game slots that can be filled later.

## Open it in VS Code

Open `index.html` in a browser, or use the **Live Server** extension in VS Code if you want automatic refreshes while editing. No build step, JavaScript, database, account, or API is required.

## What each file does

### `index.html`: the content and structure

HTML is the language used to describe what appears on a web page. Tags such as `<header>`, `<main>`, `<section>`, and `<footer>` divide the page into meaningful regions.

- The `<header>` contains the QuestLine wordmark, navigation links, and the example profile control.
- The library `<section>` is the main page. It contains three empty cards, each labeled as a future game slot.
- The rewards `<section>` remains separate from the grid so progress can be added without changing the library layout.

### `style.css`: the visual design

CSS is the language that controls appearance and layout. Variables such as `--blue` and `--paper` store reusable colors.

- The header and navigation use flexbox, which places items in a row and makes spacing predictable.
- The game grid and rewards area use CSS grid, which divides space into columns.
- The QuestLine wordmark uses a `::after` pseudo-element to draw a line beneath `Line`, extending from the bottom of the `L` under `ine`.
- The `:hover` rule gives the empty cards a small response without making them look like finished games.
- The `@media` rule changes the three-column grid into a single column on smaller screens. This is called responsive design.

The small `app.js` file reads the CSS color variables and uses them to create the browser-tab `QL` logo. This keeps the favicon synchronized when a future customization feature changes the theme.

### Color choices

The original palette uses charcoal, cream, and lime for a warm, playful foundation. The previous orange accent has been replaced with a mellow blue so the logo, profile badge, and rewards number feel calmer without changing the rest of the design.

- `--ink` is a deep charcoal for readable primary text.
- `--muted` is a soft gray-green for secondary labels and descriptions.
- `--paper` is a warm off-white page background.
- `--cream` separates the empty game cards from the page without creating a harsh contrast.
- `--line` creates subtle borders.
- `--lime` is used for the hover shadow to add energy when a card is explored.
- `--blue` replaces the orange accent with a relaxed blue for the logo underline, profile circle, and reward number.
