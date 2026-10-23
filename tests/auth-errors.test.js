import { expect, test } from 'bun:test';
import { isAuthConnectionError } from '../src/lib/auth-errors';

test('login connection failures remain distinct from wrong credentials', () => {
  expect(isAuthConnectionError(new TypeError('Failed to fetch'))).toBe(true);
  expect(isAuthConnectionError({ name: 'AuthRetryableFetchError', message: '' })).toBe(true);
  expect(isAuthConnectionError(new Error('Network request failed'))).toBe(true);
  expect(isAuthConnectionError(new Error('Load failed'))).toBe(true);
  expect(isAuthConnectionError(new Error('Invalid login credentials'))).toBe(false);
  expect(isAuthConnectionError(null)).toBe(false);
});