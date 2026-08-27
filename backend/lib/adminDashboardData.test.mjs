import test from 'node:test';
import assert from 'node:assert/strict';

import { requireDashboardData } from './adminDashboardData.js';

test('requireDashboardData returns the database rows from a successful query', () => {
  const rows = [{ id: 'vendor-1' }];
  assert.deepEqual(requireDashboardData({ data: rows, error: null }, 'vendors'), rows);
});

test('requireDashboardData fails instead of converting a query error into empty analytics', () => {
  const queryError = new Error('permission denied');
  assert.throws(
    () => requireDashboardData({ data: null, error: queryError }, 'reviews'),
    (error) => error.cause === queryError && error.message === 'Failed to load dashboard reviews',
  );
});
