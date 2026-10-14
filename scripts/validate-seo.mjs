import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const config = JSON.parse(read('vercel.json'));
const sitemap = read('www/sitemap.xml');
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => new URL(match[1]));
assert.equal(urls.length, 8);
assert.equal(new Set(urls.map(url => url.href)).size, urls.length);
for (const url of urls) {
  const path = url.pathname;
  const rewrite = config.rewrites.find(rule => rule.source === path);
  assert.ok(rewrite, `Missing public rewrite for ${path}`);
  const html = read(`www${rewrite.destination}`);
  assert.match(html, /<h1>[^<]+<\/h1>/);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.ok(html.includes(`<link rel="canonical" href="${url.href}">`));
  assert.ok(!html.includes('noindex'), `${path} must be indexable`);
  assert.ok(!html.includes('<lc-root>'), `${path} must not depend on Angular rendering`);
  assert.match(html, /href="\/auth\/register"/);
  for (const alternate of html.matchAll(/rel="alternate" hreflang="(?:en|de)" href="([^"]+)"/g)) {
    const other = new URL(alternate[1]);
    const target = config.rewrites.find(rule => rule.source === other.pathname);
    assert.ok(target);
    assert.ok(read(`www${target.destination}`).includes(`href="${url.href}"`), 'Language references must be reciprocal');
  }
  for (const link of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
    const local = link[1];
    if (local.startsWith('/auth/') || local === '/review') continue;
    const target = config.rewrites.find(rule => rule.source === local);
    assert.ok(existsSync(`www${target ? target.destination : local}`), `Broken local link: ${local}`);
  }
}
assert.match(read('www/robots.txt'), /Sitemap: https:\/\/lingua-card.app\/sitemap.xml/);
assert.ok(!read('www/robots.txt').includes('<html'));
assert.match(read('www/index.html'), /name="robots" content="noindex"/);
assert.ok(!config.rewrites.some(rule => rule.source === '/(.*)'), 'Unknown URLs must not rewrite to the app');
assert.ok(existsSync('www/404.html'));
const worker = JSON.parse(read('www/ngsw.json'));
const handles = path => worker.navigationUrls.some(rule => rule.positive && new RegExp(rule.regex).test(path)) && !worker.navigationUrls.some(rule => !rule.positive && new RegExp(rule.regex).test(path));
for (const path of ['/', '/de/', '/learn/german-vocabulary/', '/does-not-exist']) assert.equal(handles(path), false, `${path} must bypass the app worker`);
for (const path of ['/review', '/auth/login', '/vault/123', '/podcasts/episodes/123/player']) assert.equal(handles(path), true, `${path} must retain app navigation`);
assert.equal(JSON.parse(read('www/manifest.webmanifest')).start_url, '/review');
console.log('SEO checks passed: 8 static pages, metadata, reciprocal languages, links, crawler files, app entry and service-worker routing.');
