import test from "node:test";
import assert from "node:assert/strict";
import {
  createLatestSelectionGate,
  customStopFromPlace,
  fetchGooglePlaceDetails,
  formatGooglePriceRange,
  isFreshGooglePlaceCache,
} from "./customPlaces.js";

const money = (units, currencyCode = "MYR", nanos = 0) => ({ units, currencyCode, nanos });

test("only the latest overlapping Google place selection may complete", () => {
  const gate = createLatestSelectionGate();
  const first = gate.next();
  const second = gate.next();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
});

test("formats only real Google food price ranges", () => {
  assert.equal(formatGooglePriceRange("restaurant", {
    startPrice: money(15), endPrice: money(30),
  }), "RM15 – RM30");
  assert.equal(formatGooglePriceRange("cafe", { startPrice: money(12) }), "RM12");
  assert.equal(formatGooglePriceRange("bakery", {
    startPrice: money(12, "MYR", 500_000_000),
    endPrice: money(12, "MYR", 500_000_000),
  }), "RM12.50");
  assert.equal(formatGooglePriceRange("car_repair", {
    startPrice: money(15), endPrice: money(30),
  }), null);
  assert.equal(formatGooglePriceRange("restaurant", null), null);
});

test("builds a current-model custom stop without vendor-only fields", () => {
  assert.deepEqual(customStopFromPlace("custom-1", {
    label: " J ONE PERFORMANCE AUTOWORKS ",
    lat: 2.201,
    lng: 102.251,
    placeId: " google-place-1 ",
    address: " Melaka, Malaysia ",
    primaryType: " car_repair ",
    attributions: [
      { provider: " Google contributor ", providerURI: "https://example.com/contributor" },
      { provider: "Unsafe", providerURI: "javascript:alert(1)" },
    ],
    vendor: { id: "must-not-copy" },
  }, 1_800_000_000_000), {
    id: "custom-1",
    type: "custom",
    name: "J ONE PERFORMANCE AUTOWORKS",
    lat: 2.201,
    lng: 102.251,
    placeId: "google-place-1",
    address: "Melaka, Malaysia",
    primaryType: "car_repair",
    attributions: [
      { provider: "Google contributor", providerURI: "https://example.com/contributor" },
      { provider: "Unsafe" },
    ],
    cachedAt: 1_800_000_000_000,
  });
});

test("Google place coordinate cache expires after exactly thirty days", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 1_800_000_000_000;
  assert.equal(isFreshGooglePlaceCache({ type: "custom", placeId: "p", cachedAt: now - (30 * day) }, now), true);
  assert.equal(isFreshGooglePlaceCache({ type: "custom", placeId: "p", cachedAt: now - (30 * day) - 1 }, now), false);
  assert.equal(isFreshGooglePlaceCache({ type: "custom", placeId: "p" }, now), true);
  assert.equal(isFreshGooglePlaceCache({ type: "custom", cachedAt: now - (31 * day) }, now), false);
});

test("fetches Google display fields and requests price only for food", async () => {
  const requestedFields = [];
  class FakePlace {
    constructor({ id }) { assert.equal(id, "google-place-1"); }
    async fetchFields({ fields }) {
      requestedFields.push(fields);
      this.displayName = "Cafe Example";
      this.formattedAddress = "1 Jalan Example, Melaka";
      this.location = { lat: () => 2.201, lng: () => 102.251 };
      this.primaryType = "cafe";
      this.priceRange = { startPrice: money(15), endPrice: money(30) };
    }
  }
  const details = await fetchGooglePlaceDetails({ Place: FakePlace }, "google-place-1");
  assert.deepEqual(requestedFields, [
    ["displayName", "formattedAddress", "location", "primaryType"],
    ["priceRange"],
  ]);
  assert.equal(details.label, "Cafe Example");
  assert.equal(details.priceLabel, "RM15 – RM30");
});

test("does not invent an RM price for non-food Google places", async () => {
  const requestedFields = [];
  class FakePlace {
    async fetchFields({ fields }) {
      requestedFields.push(fields);
      this.displayName = "Melaka Museum";
      this.location = { lat: () => 2.201, lng: () => 102.251 };
      this.primaryType = "museum";
    }
  }
  const details = await fetchGooglePlaceDetails({ Place: FakePlace }, "museum-place");
  assert.deepEqual(requestedFields, [["displayName", "formattedAddress", "location", "primaryType"]]);
  assert.equal(details.priceLabel, undefined);
});

test("keeps basic food details when Google's optional price field is unavailable", async () => {
  class FakePlace {
    async fetchFields({ fields }) {
      if (fields.includes("priceRange")) throw new Error("price field unavailable");
      this.displayName = "Cafe Example";
      this.formattedAddress = "Melaka";
      this.location = { lat: () => 2.201, lng: () => 102.251 };
      this.primaryType = "cafe";
    }
  }
  const details = await fetchGooglePlaceDetails({ Place: FakePlace }, "cafe-place");
  assert.equal(details.label, "Cafe Example");
  assert.equal(details.priceLabel, undefined);
});
