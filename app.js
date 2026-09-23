// Read the theme colors from CSS so the browser tab follows future customization.
const theme = getComputedStyle(document.documentElement);
const pageBackground = theme.getPropertyValue('--paper').trim();
const mainText = theme.getPropertyValue('--ink').trim();
const logoAccent = theme.getPropertyValue('--blue').trim();
const favicon = document.querySelector('#favicon');

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${pageBackground}"/>
  <text x="7" y="47" fill="${mainText}" font-family="Arial, sans-serif" font-size="39" font-weight="700">Q</text>
  <text x="34" y="38" fill="${logoAccent}" font-family="Arial, sans-serif" font-size="39" font-weight="700">L</text>
</svg>`;

favicon.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;