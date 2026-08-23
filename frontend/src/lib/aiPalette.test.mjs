import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentPaths = [
  'src/components/ai/URLSubmissionStep.jsx',
  'src/components/ai/VideoSelectionList.jsx',
  'src/components/ai/SummaryStep.jsx',
  'src/components/ai/BatchResultsStep.jsx',
  'src/components/ai/ExtractionStep.jsx',
];

test('AI workflow uses the shared admin palette instead of purple accents', async () => {
  const sources = await Promise.all(componentPaths.map((path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')));
  const source = sources.join('\n');

  assert.doesNotMatch(source, /#a78bfa|#7c3aed|#06b6d4|#60a5fa|rgba\(124,58,237/);
  assert.match(source, /var\(--admin-navy\)|var\(--admin-panel-soft\)|var\(--color-forest\)/);
  assert.match(source, /var\(--admin-warning-bg\)|var\(--color-terracotta\)|var\(--admin-border\)/);
});
