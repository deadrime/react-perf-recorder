/**
 * A recording keeps the page it was made on, and that url is read by whoever opens the file — a teammate, an
 * agent, a chat. Plenty of dev setups carry the session in the url itself: a debug link with a JWT in the path, a
 * magic link, `?access_token=…`. None of that belongs in a file that gets passed around, and none of it is needed
 * to tell one recording from another, so it is masked on the way in — everywhere a url is stored.
 */

const JWT = /^eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}$/;
/** Longer than any id anyone reads: a session, a signature or a key, whatever it happens to be called. */
const OPAQUE = /^[A-Za-z0-9_-]{60,}$/;
const SECRET_NAME =
  /^(token|access[-_]?token|id[-_]?token|refresh[-_]?token|jwt|auth|authorization|key|api[-_]?key|secret|password|pwd|sig|signature|session|sid)$/i;
/** Asterisks survive every url setter untouched, so a masked url stays a url. */
const MASK = '***';
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

const maskValue = (value: string) => (JWT.test(value) || OPAQUE.test(value) ? MASK : value);

const maskQuery = (search: string) => {
  const params = new URLSearchParams(search);
  let touched = false;
  for (const [name, value] of [...params]) {
    const masked = SECRET_NAME.test(name) ? MASK : maskValue(value);
    if (masked === value) continue;
    params.set(name, masked);
    touched = true;
  }
  return touched ? params.toString() : search.replace(/^\?/, '');
};

/** The same masking for a fragment that carries `#access_token=…`, as an OAuth redirect does. */
const maskHash = (hash: string) => {
  const body = hash.replace(/^#/, '');
  if (!body) return '';
  return body.includes('=') ? maskQuery(body) : body.split('/').map(maskValue).join('/');
};

/** A url with its credentials taken out: the path, the query and the fragment stay readable, the secrets do not. */
export function safeUrl(raw: string): string {
  if (!raw) return raw;
  const relative = /^[/?#]/.test(raw);
  if (!relative && !ABSOLUTE.test(raw)) return maskLoose(raw);
  try {
    const url = new URL(raw, relative ? 'http://localhost' : undefined);
    const path = url.pathname.split('/').map(maskValue).join('/');
    const query = maskQuery(url.search);
    const hash = maskHash(url.hash);
    const tail = `${path}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
    // A relative url stays relative: `/debug/<token>?x=1` is what the recording asked to keep.
    return relative ? tail : `${url.protocol}//${url.host}${tail}`;
  } catch {
    return maskLoose(raw);
  }
}

/** Not a url, or not one this browser can parse: the shapes worth hiding are still worth hiding. */
const maskLoose = (raw: string) =>
  raw
    .replace(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, MASK)
    .replace(new RegExp(`(${SECRET_NAME.source.slice(1, -1)})=[^&\\s]+`, 'gi'), `$1=${MASK}`);
