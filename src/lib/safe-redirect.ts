const PLACEHOLDER_ORIGIN = "http://splitwiser.invalid";

const ALLOWED_PATHS = [
  /^\/$/,
  /^\/g\/[^/]+(\/.*)?$/,
  /^\/join\/[^/]+$/,
  /^\/friends(\/[^/]+)?$/,
  /^\/profile$/,
  /^\/new$/,
  /^\/onboarding$/,
];

/**
 * Restrict post-login destinations to known local routes. Anything else,
 * including other origins and protocol-relative URLs, falls back to "/".
 */
export function safeCallbackPath(
  raw: string | null | undefined,
  origin: string = PLACEHOLDER_ORIGIN,
): string {
  if (!raw) return "/";
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return "/";
  }
  if (url.origin !== new URL(origin).origin) return "/";
  if (!ALLOWED_PATHS.some((re) => re.test(url.pathname))) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
