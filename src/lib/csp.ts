/**
 * Content Security Policy helpers shared by the request proxy.
 *
 * The policy is nonce-based: every HTML response gets a fresh nonce that is
 * announced in the `Content-Security-Policy` header and attached by Next.js to
 * the scripts it emits (framework, page bundles, inline bootstrap). With
 * `'strict-dynamic'` a nonced script may load further scripts, so no host
 * allowlist is needed and `'unsafe-inline'` is ignored by modern browsers.
 *
 * Pure functions, no Next imports: usable from the proxy and from tests.
 */

export interface CspOptions {
  /** Allow `eval` in `script-src`. Only React's development tooling needs it. */
  allowEval: boolean;
}

/** Fresh, unpredictable nonce for one request (UUID v4, base64-encoded). */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

/** Builds the CSP header value for a request with the given nonce. */
export function buildContentSecurityPolicy(nonce: string, { allowEval }: CspOptions): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", allowEval ? "'unsafe-eval'" : ""]
    .filter(Boolean)
    .join(" ");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Inline styles are emitted by Next.js streaming and by Tailwind's runtime helpers.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
