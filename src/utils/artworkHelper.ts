// Generative fallback covers so no song ever has a broken or missing image

export function getFallbackCoverDataUrl(title: string, genre: string = 'Music'): string {
  const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue1 = (hash * 37) % 360;
  const hue2 = (hue1 + 55) % 360;
  
  const cleanTitle = (title || 'Track').substring(0, 18).replace(/[<>&"']/g, '');
  const cleanGenre = (genre || 'Audio').substring(0, 14).toUpperCase().replace(/[<>&"']/g, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${hue1}, 75%, 45%)" />
        <stop offset="100%" stop-color="hsl(${hue2}, 85%, 20%)" />
      </linearGradient>
      <radialGradient id="r" cx="80%" cy="20%" r="60%">
        <stop offset="0%" stop-color="white" stop-opacity="0.3" />
        <stop offset="100%" stop-color="white" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="400" height="400" rx="32" fill="url(#g)" />
    <rect width="400" height="400" rx="32" fill="url(#r)" />
    <circle cx="200" cy="170" r="64" fill="rgba(255,255,255,0.12)" />
    <path d="M190 145v45a18 18 0 1 1-12-17v-38l38-10v35a18 18 0 1 1-12-17v-20l-14 4z" fill="white" fill-opacity="0.9" />
    <rect x="50" y="270" width="100" height="20" rx="6" fill="rgba(255,255,255,0.2)" />
    <text x="56" y="284" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="white" letter-spacing="1">${cleanGenre}</text>
    <text x="50" y="325" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="800" fill="white">${cleanTitle}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function handleImageFallback(e: React.SyntheticEvent<HTMLImageElement>, title: string, genre: string = 'Music') {
  const target = e.currentTarget;
  if (!target.dataset.hasFallback) {
    target.dataset.hasFallback = 'true';
    target.src = getFallbackCoverDataUrl(title, genre);
  }
}
