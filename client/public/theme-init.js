// Apply the saved theme before the page paints (see src/context/ThemeProvider.tsx).
// Loaded as a normal (blocking) script from index.html, so there's no flash of the wrong theme.
try {
  var t = localStorage.getItem('theme')
  var dark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
} catch (e) {}
