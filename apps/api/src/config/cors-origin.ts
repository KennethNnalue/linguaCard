const NATIVE_APP_ORIGINS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost',
]);

const DEVELOPMENT_WEB_ORIGIN_PATTERN =
  /^http:\/\/(?:localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}):(4200|8100)$/;

export function shouldAllowDevelopmentOrigins(
  nodeEnvironment: string | undefined,
  appEnvironment: string | undefined,
): boolean {
  return nodeEnvironment !== 'production' || appEnvironment === 'development';
}

export function isAllowedOrigin(
  origin: string,
  configuredOrigins: readonly string[],
  allowDevelopmentOrigins: boolean,
): boolean {
  return NATIVE_APP_ORIGINS.has(origin)
    || configuredOrigins.includes(origin)
    || (allowDevelopmentOrigins && DEVELOPMENT_WEB_ORIGIN_PATTERN.test(origin));
}
