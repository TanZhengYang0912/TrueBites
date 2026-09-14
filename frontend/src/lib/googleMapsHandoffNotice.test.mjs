import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const tripPanel = read("../components/TripPanel.jsx");
const mapPage = read("../pages/MapPage.jsx");

test("TripPanel explains the seven-stop Google Maps handoff without changing the button", () => {
  assert.match(tripPanel, /> Open in Google Maps/);
  assert.match(tripPanel, /Google Maps can open up to 7 stops at a time\./);
  assert.match(tripPanel, /Google Maps will open stops 1–7 only\. The remaining \{gmaps\.remainingCount\} stops will stay in your TrueBites trip\./);
  assert.doesNotMatch(tripPanel, /supports up to 9 stops after your start/);
});

test("only an over-limit handoff reports the exact omitted count through the existing toast", () => {
  assert.match(tripPanel, /onGoogleMapsOpen\?\.\(gmaps\.remainingCount\)/);
  assert.match(mapPage, /Opened the first 7 stops in Google Maps\. \$\{remainingCount\} stops were not included\./);
  assert.match(mapPage, /onGoogleMapsOpen=\{handleGoogleMapsOpen\}/);
  assert.match(mapPage, /<Toast toast=\{toast\} \/>/);
});
