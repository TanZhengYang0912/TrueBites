import test from "node:test";
import assert from "node:assert/strict";
import { formatPhotonAddress, photonSearchUrl } from "./addressSearch.js";

test("formats a Photon result as a complete readable address", () => {
  const label = formatPhotonAddress({
    properties: {
      name: "Jonker 88",
      housenumber: "88",
      street: "Jalan Hang Jebat",
      neighbourhood: "Bandar Hilir",
      city: "Melaka",
      state: "Melaka",
      postcode: "75200",
      country: "Malaysia",
    },
  });

  assert.equal(label, "Jonker 88, 88 Jalan Hang Jebat, Bandar Hilir, Melaka, 75200, Malaysia");
});

test("builds a Melaka-bounded Photon search URL", () => {
  const url = new URL(photonSearchUrl("Jonker Street"));
  assert.equal(url.hostname, "photon.komoot.io");
  assert.equal(url.searchParams.get("q"), "Jonker Street");
  assert.equal(url.searchParams.get("limit"), "6");
  assert.equal(url.searchParams.get("bbox"), "101.8,1.8,102.8,2.6");
});
