const BOOTSTRAP_ADMIN_EMAILS = new Set([
  'kennethnnalue.dev@gmail.com',
]);

export function isBootstrapAdminEmail(email: string): boolean {
  return BOOTSTRAP_ADMIN_EMAILS.has(email.trim().toLowerCase());
}
