import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("the shared shell owns the Discover-sized page frame", () => {
  const shell = read("components/discovery/DiscoveryPageShell.jsx");
  assert.match(shell, /DiscoveryHeader/);
  assert.match(shell, /Footer/);
  assert.match(shell, /max-w-\[1360px\]/);
  assert.match(shell, /md:pb-18/);
  assert.match(shell, /xl:px-10/);
});

test("secondary discovery pages compose the shared shell and intro", () => {
  for (const path of [
    "pages/EngagementPage.jsx",
    "pages/SuggestionsPage.jsx",
    "pages/SuggestionFormPage.jsx",
  ]) {
    const source = read(path);
    assert.match(source, /DiscoveryPageShell/);
    assert.match(source, /DiscoveryPageIntro/);
  }
});
