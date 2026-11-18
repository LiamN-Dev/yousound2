/**
 * Accept only published Google Sites URLs. Editors' /edit URLs and arbitrary
 * third-party hosts are rejected so the Arcade can only frame a published site.
 */
export function normalizeGoogleSitesPublishedUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'sites.google.com' ||
      (url.port && url.port !== '443') ||
      url.username ||
      url.password
    ) return null;

    const segments = url.pathname.split('/').filter(Boolean);
    if (!['view', 'site'].includes((segments[0] || '').toLowerCase())) return null;
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(segments[1] || '')) return null;
    if (segments.some(segment => ['edit', 'preview', 'new'].includes(segment.toLowerCase()))) return null;
    if (segments.some(segment => !/^[a-z0-9][a-z0-9._~-]*$/i.test(segment))) return null;

    // A fragment is never needed to identify a published Sites page.
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}
