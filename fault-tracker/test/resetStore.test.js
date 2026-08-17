const test = require('node:test');
const assert = require('node:assert/strict');

const resetStore = require('../src/resetStore');

test('consumeToken returns the userId for a freshly created token', () => {
  const token = resetStore.createToken(42);
  assert.equal(resetStore.consumeToken(token), 42);
});

test('consumeToken is single-use: a second consume fails', () => {
  const token = resetStore.createToken(1);
  resetStore.consumeToken(token);
  assert.equal(resetStore.consumeToken(token), null);
});

test('consumeToken rejects unknown tokens', () => {
  assert.equal(resetStore.consumeToken('not-a-real-token'), null);
});

test('consumeToken rejects an expired token', () => {
  const token = resetStore.createToken(1, -1); // already expired
  assert.equal(resetStore.consumeToken(token), null);
});
