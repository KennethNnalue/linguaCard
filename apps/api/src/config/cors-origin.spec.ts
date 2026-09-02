import {isAllowedOrigin, shouldAllowDevelopmentOrigins} from './cors-origin';

describe('shouldAllowDevelopmentOrigins', () => {
  it('allows them for a hosted development service running a production build', () => {
    expect(shouldAllowDevelopmentOrigins('production', 'development')).toBe(true);
  });

  it('allows them for a local development process', () => {
    expect(shouldAllowDevelopmentOrigins('development', undefined)).toBe(true);
  });

  it('does not allow them for production', () => {
    expect(shouldAllowDevelopmentOrigins('production', undefined)).toBe(false);
    expect(shouldAllowDevelopmentOrigins('production', 'production')).toBe(false);
  });
});

describe('isAllowedOrigin', () => {
  it.each([
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
    'https://localhost',
  ])('allows the native application origin %s in production', origin => {
    expect(isAllowedOrigin(origin, [], false)).toBe(true);
  });

  it('allows explicitly configured web origins', () => {
    expect(isAllowedOrigin('https://linguacard.example', ['https://linguacard.example'], false))
      .toBe(true);
  });

  it('allows local web development origins only during development', () => {
    expect(isAllowedOrigin('http://localhost:4200', [], true)).toBe(true);
    expect(isAllowedOrigin('http://localhost:4200', [], false)).toBe(false);
  });

  it('allows a physical device live-reload origin on the private network', () => {
    const allowDevelopmentOrigins = shouldAllowDevelopmentOrigins('production', 'development');

    expect(isAllowedOrigin('http://192.168.0.84:4200', [], allowDevelopmentOrigins)).toBe(true);
  });

  it.each([
    'capacitor://attacker.example',
    'https://localhost.attacker.example',
    'https://unconfigured.example',
  ])('rejects untrusted origin %s', origin => {
    expect(isAllowedOrigin(origin, [], false)).toBe(false);
  });
});
