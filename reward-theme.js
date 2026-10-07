// This module handles the "earned reward" color themes for the app.
// It validates a reward payload, stores which themes a user owns,
// remembers which one is currently equipped, and applies those CSS variables
// to the page so the game can look different depending on the reward set.

// These are the CSS custom properties we are allowed to override.
// The names line up with the app's theme tokens, so the rest of the site can
// keep using the same variables without knowing about the reward system.
const rewardThemeStoragePrefix = 'questline.equipped-color-theme.';
const rewardThemeProperties = {
  ink: '--ink',
  muted: '--muted',
  paper: '--paper',
  cream: '--cream',
  line: '--line',
  lime: '--lime',
  blue: '--blue',
  serif: '--serif',
};

// This is a safe whitelist of font names that can be applied from a claimed reward.
// We do not want to let arbitrary CSS strings be injected into the page.
const safeRewardThemeFonts = new Map([
  ['georgia', 'Georgia'],
  ['times new roman', '"Times New Roman"'],
  ['serif', 'serif'],
  ['sans-serif', 'sans-serif'],
  ['monospace', 'monospace'],
  ['system-ui', 'system-ui'],
  ['arial', 'Arial'],
]);

// In-memory cache for reward themes the current active user owns.
// This is populated from the user's granted rewards and lets us quickly look up
// the theme data without re-parsing every item every time.
let ownedColorThemes = new Map();
let activeUserId = null;

// Builds the localStorage key for a specific user so each account keeps its own
// equipped theme independent of everyone else.
function storageKey(userId) {
  return `${rewardThemeStoragePrefix}${userId}`;
}

// Parses and validates a reward payload. We only accept a strict shape:
// reward_payload.type must be "color_scheme", and every theme field must be a valid
// color or an allowed font string. If anything looks malformed, we reject it.
function readColorScheme(grant) {
  const payload = grant?.reward_payload;
  const scheme = payload?.scheme;
  if (payload?.type !== 'color_scheme' || !scheme || typeof scheme !== 'object' || Array.isArray(scheme)) {
    return null;
  }

  const properties = {};
  for (const [key, property] of Object.entries(rewardThemeProperties)) {
    const value = scheme[key];
    if (typeof value !== 'string') return null;

    if (key === 'serif') {
      const safeFont = safeRewardThemeFonts.get(value.toLowerCase());
      if (!safeFont) return null;
      properties[property] = safeFont;
    } else {
      if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return null;
      properties[property] = value;
    }
  }
  return properties;
}

// Takes a validated theme object and pushes it into the actual document's CSS variables.
// This is the point where the player's reward becomes visible across the app.
function applyColorScheme(properties) {
  const root = document.documentElement;

  // First clear any previously applied reward variables so the theme does not stack.
  for (const property of Object.values(rewardThemeProperties)) {
    root.style.removeProperty(property);
  }

  // If a real theme is provided, apply each custom property to the root element.
  if (properties) {
    for (const [property, value] of Object.entries(properties)) {
      root.style.setProperty(property, value);
    }
  }

  window.questLineUI?.updateFavicon();
}

// This is the public API that the rest of the app uses.
// It knows how to identify valid reward themes, reset everything, and persist
// the currently equipped choice for the signed-in user.
window.questLineRewardTheme = {
  // Returns true only for a genuine earned theme reward and not a random object.
  isColorSchemeReward(grant) {
    return Boolean(grant?.id && readColorScheme(grant));
  },

  // Clears the current user context and resets the page to the default theme.
  reset() {
    activeUserId = null;
    ownedColorThemes = new Map();
    applyColorScheme(null);
  },

  // Loads the user's valid reward themes and restores the selected theme from storage.
  // If a saved equip value points to something invalid or no longer owned, it gets cleaned up.
  setOwnedGrants(user, grants) {
    ownedColorThemes = new Map();
    if (!user) {
      activeUserId = null;
      applyColorScheme(null);
      return null;
    }

    activeUserId = user.id;
    for (const grant of grants) {
      const properties = readColorScheme(grant);
      if (properties) ownedColorThemes.set(grant.id, properties);
    }

    const key = storageKey(user.id);
    const equippedGrantId = window.localStorage.getItem(key);
    const properties = ownedColorThemes.get(equippedGrantId);
    if (equippedGrantId && !properties) window.localStorage.removeItem(key);
    applyColorScheme(properties || null);
    return properties ? equippedGrantId : null;
  },

  // Saves the selected theme for this user and applies it immediately.
  equip(user, grantId) {
    const properties = ownedColorThemes.get(grantId);
    if (!user || !properties) {
      throw new Error('That color scheme is not among your verified earned rewards.');
    }

    window.localStorage.setItem(storageKey(user.id), grantId);
    applyColorScheme(properties);
    return grantId;
  },

  // Removes the user's saved theme preference and falls back to the base game theme.
  useDefault(user) {
    if (!user) throw new Error('Sign in to update your color scheme preference.');
    window.localStorage.removeItem(storageKey(user.id));
    applyColorScheme(null);
  },
};

// If the equipped theme changes in another browser tab or window for the same user,
// update this page immediately without needing a full reload.
window.addEventListener('storage', (event) => {
  if (!activeUserId || event.key !== storageKey(activeUserId)) return;
  const properties = ownedColorThemes.get(event.newValue);
  applyColorScheme(properties || null);
});
