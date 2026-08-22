import {ThemeService} from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.classList.remove('ion-palette-dark');
  });

  it('uses the dark theme by default', () => {
    const service = new ThemeService();

    service.initialize();

    expect(service.isDark()).toBe(true);
    expect(document.body.classList.contains('ion-palette-dark')).toBe(true);
  });

  it('keeps a saved light theme preference', () => {
    localStorage.setItem('lc-theme', 'light');
    const service = new ThemeService();

    service.initialize();

    expect(service.isDark()).toBe(false);
    expect(document.body.classList.contains('ion-palette-dark')).toBe(false);
  });
});
