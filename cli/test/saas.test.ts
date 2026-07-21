import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyServerKind, defaultSaasBaseUrl, isSaasBaseUrl } from '../src/core/saas.ts';

test('default SaaS url', () => {
  assert.equal(defaultSaasBaseUrl({}), 'https://api.loremem.com');
  assert.equal(defaultSaasBaseUrl({ LORE_SAAS_BASE_URL: 'https://saas.example/' }), 'https://saas.example');
});

test('isSaasBaseUrl', () => {
  assert.equal(isSaasBaseUrl('https://api.loremem.com'), true);
  assert.equal(isSaasBaseUrl('https://api.loremem.com/'), true);
  assert.equal(isSaasBaseUrl('http://127.0.0.1:18901'), false);
});

test('classifyServerKind', () => {
  assert.equal(classifyServerKind({ dockerManaged: true, baseUrl: 'http://127.0.0.1:18901' }), 'docker');
  assert.equal(classifyServerKind({ baseUrl: 'https://api.loremem.com' }), 'saas');
  assert.equal(classifyServerKind({ baseUrl: 'https://core.example' }), 'external');
  assert.equal(classifyServerKind({}), 'unknown');
});
