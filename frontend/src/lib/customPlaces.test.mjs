import test from "node:test";
import assert from "node:assert/strict";
import {
  createLatestSelectionGate,
  customStopsForMap,
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
    startPrice: money(15),
    endPrice: money(30),
  }), "RM15 – RM30");
  assert.equal(formatGooglePriceRange("cafe", { startPrice: money(12) }), "RM12");
  assert.equal(formatGooglePriceRange("bakery", {
    startPrice: money(12, "MYR", 500_000_000),
    endPrice: money(12, "MYR", 500_000_000),
  }), "RM12.50");
  assert.equal(formatGooglePriceRange("car_repair", {
    startPrice: money(15),
    endPrice: money(30),
  }), null);
  assert.equal(formatGooglePriceRange("restaurant", null), null);
  assert.equal(formatGooglePriceRange("restaurant", { startPrice: null }), null);
});

test("formats non-MYR Google money without pretending it is ringgit", () => {
  assert.equal(formatGooglePriceRange("restaurant", {
    startPrice: money(10, "USD"),
    endPrice: money(20, "USD"),
  }), "US$10 – US$20");
});

test("builds an in-memory custom stop without vendor-only fields", () => {
  assert.deepEqual(customStopFromPlace("custom-1", {
    label: " J ONE PERFORMANCE AUTOWORKS ",
    lat: 2.201,
    lng: 102.251,
    placeId: " google-place-1 ",
    address: " Melaka, Malaysia ",
    primaryType: " car_repair ",
    priceLabel: null,
    vendor: { id: "must-not-copy" },
  }, 1_800_000_000_000), {
    id: "custom-1",
    name: "J ONE PERFORMANCE AUTOWORKS",
    lat: 2.201,
    lng: 102.251,
    isMe: false,
    source: "custom",
    placeId: "google-place-1",
    address: "Melaka, Malaysia",
    primaryType: "car_repair",
    cachedAt: 1_800_000_000_000,
  });
});

test("rejects malformed custom coordinates", () => {
  assert.throws(
    () => customStopFromPlace("custom-1", { label: "Bad", lat: NaN, lng: 102 }, 1),
    /valid coordinates/,
  );
  assert.throws(
    () => customStopFromPlace("custom-1", { label: "Bad", lat: 91, lng: 102 }, 1),
    /valid coordinates/,
  );
});

test("Google place coordinate cache expires after exactly thirty days", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 1_800_000_000_000;
  assert.equal(isFreshGooglePlaceCache({ source: "custom", placeId: "p", cachedAt: now - (30 * day) }, now), true);
  assert.equal(isFreshGooglePlaceCache({ source: "custom", placeId: "p", cachedAt: now - (30 * day) - 1 }, now), false);
  assert.equal(isFreshGooglePlaceCache({ source: "custom", placeId: "p" }, now), true, "legacy custom stops receive one migration window");
  assert.equal(isFreshGooglePlaceCache({ source: "custom", cachedAt: now - (31 * day) }, now), false, "legacy custom stops without Place IDs are removed");
});

test("fetches the exact Google display fields and normalizes them for a trip stop", async () => {
  const requestedFields = [];
  class FakePlace {
    constructor({ id }) {
      assert.equal(id, "google-place-1");
      this.id = id;
    }

    async fetchFields({ fields }) {
      requestedFields.push(fields);
      this.displayName = "Cafe Example";
      this.formattedAddress = "1 Jalan Example, Melaka";
      this.location = { lat: () => 2.201, lng: () => 102.251 };
      this.primaryType = "cafe";
      this.priceRange = { startPrice: money(15), endPrice: money(30) };
      this.attributions = [{ provider: "Example Provider", providerURI: "https://example.com" }];
    }
  }

  const details = await fetchGooglePlaceDetails({ Place: FakePlace }, "google-place-1");

  assert.deepEqual(requestedFields, [
    ["displayName", "formattedAddress", "location", "primaryType"],
    ["priceRange"],
  ]);
  assert.deepEqual(details, {
    placeId: "google-place-1",
    label: "Cafe Example",
    address: "1 Jalan Example, Melaka",
    lat: 2.201,
    lng: 102.251,
    primaryType: "cafe",
    priceLabel: "RM15 – RM30",
    attributions: [{ provider: "Example Provider", providerURI: "https://example.com" }],
  });
});

test("does not request Google's higher-tier price field for non-food places", async () => {
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

test("falls back to legacy Google Place Details when the new Place API is unavailable", async () => {
  let legacyRequest;
  class BrokenPlace {
    async fetchFields() { throw new Error("Places API (New) disabled"); }
  }
  class FakePlacesService {
    getDetails(request, callback) {
      legacyRequest = request;
      callback({
        name: "J ONE AUTO ELECTRIC",
        formatted_address: "Melaka, Malaysia",
        geometry: { location: { lat: () => 2.217, lng: () => 102.232 } },
        types: ["car_repair", "point_of_interest"],
        html_attributions: ['<a href="https://data-provider.example/place">Data Provider</a>'],
      }, "OK");
    }
  }

  const details = await fetchGooglePlaceDetails({
    Place: BrokenPlace,
    PlacesService: FakePlacesService,
    PlacesServiceStatus: { OK: "OK" },
  }, "legacy-place");

  assert.deepEqual(legacyRequest, {
    placeId: "legacy-place",
    fields: ["name", "formatted_address", "geometry", "types"],
  });
  assert.deepEqual(details, {
    placeId: "legacy-place",
    label: "J ONE AUTO ELECTRIC",
    address: "Melaka, Malaysia",
    lat: 2.217,
    lng: 102.232,
    primaryType: "car_repair",
    attributions: [{ provider: "Data Provider", providerURI: "https://data-provider.example/place" }],
  });
});

test("derives custom map markers from their exact positions in the shared trip", () => {
  const trip = [
    { id: "me", isMe: true, lat: 2.2, lng: 102.2 },
    { id: "vendor", name: "Vendor", lat: 2.21, lng: 102.21 },
    { id: "custom-a", name: "Museum", source: "custom", lat: 2.22, lng: 102.22 },
    { id: "custom-b", name: "Cafe", source: "custom", lat: 2.23, lng: 102.23 },
  ];

  assert.deepEqual(customStopsForMap(trip), [
    { ...trip[2], stopNum: 3 },
    { ...trip[3], stopNum: 4 },
  ]);
});
