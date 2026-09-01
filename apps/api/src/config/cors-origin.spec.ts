import {isAllowedOrigin} from './cors-origin';

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

  it.each([
    'capacitor://attacker.example',
    'https://localhost.attacker.example',
    'https://unconfigured.example',
  ])('rejects untrusted origin %s', origin => {
    expect(isAllowedOrigin(origin, [], false)).toBe(false);
  });
});
