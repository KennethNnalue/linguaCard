import {isBootstrapAdminEmail} from './bootstrap-admin.policy';

describe('isBootstrapAdminEmail', () => {
  it('matches the configured administrator case-insensitively', () => {
    expect(isBootstrapAdminEmail('  KennethNnalue.Dev@Gmail.com ')).toBe(true);
  });

  it('does not grant administration to another user', () => {
    expect(isBootstrapAdminEmail('another.user@gmail.com')).toBe(false);
  });
});
