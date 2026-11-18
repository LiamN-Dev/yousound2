import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGoogleSitesPublishedUrl } from '../src/services/googleSitesEmbed.ts';

test('accepts published Google Sites view URLs', () => {
  assert.equal(
    normalizeGoogleSitesPublishedUrl('https://sites.google.com/view/yousound-arcade/home'),
    'https://sites.google.com/view/yousound-arcade/home'
  );
});

test('accepts legacy published Google Sites URLs', () => {
  assert.equal(
    normalizeGoogleSitesPublishedUrl('https://sites.google.com/site/yousoundgames/'),
    'https://sites.google.com/site/yousoundgames/'
  );
});

test('rejects non-Google hosts, insecure URLs, and editor URLs', () => {
  assert.equal(normalizeGoogleSitesPublishedUrl('http://sites.google.com/view/yousound'), null);
  assert.equal(normalizeGoogleSitesPublishedUrl('https://example.com/view/yousound'), null);
  assert.equal(normalizeGoogleSitesPublishedUrl('https://sites.google.com/view/yousound/edit'), null);
  assert.equal(normalizeGoogleSitesPublishedUrl('https://sites.google.com/viewer/yousound'), null);
});

test('rejects malformed and credential-bearing URLs', () => {
  assert.equal(normalizeGoogleSitesPublishedUrl('not a url'), null);
  assert.equal(normalizeGoogleSitesPublishedUrl('https://user:pass@sites.google.com/view/yousound'), null);
  assert.equal(normalizeGoogleSitesPublishedUrl(''), null);
});
