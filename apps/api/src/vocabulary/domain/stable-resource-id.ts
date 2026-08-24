import { createHash } from 'crypto';

export function stableResourceId(namespace: string, ...identityParts: readonly string[]): string {
  const hex = createHash('sha256')
    .update([namespace, ...identityParts].join('\u0000'))
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
