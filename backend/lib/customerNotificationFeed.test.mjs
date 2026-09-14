import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCustomerNotificationFeed,
  selectFeedVendors,
} from "./customerNotificationFeed.js";

const vendors = [
  {
    id: "00000000-0000-4000-8000-000000000003",
    vendor_name: "Newest but Draft",
    cuisine_types: ["Cafe / Dessert"],
    status: "draft",
    latitude: 2.2,
    longitude: 102.2,
    published_at: "2026-09-15T00:00:00Z",
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    vendor_name: "Recently Reactivated",
    cuisine_types: ["Malaysian / Local"],
    status: "active",
    latitude: 2.21,
    longitude: 102.21,
    published_at: "2026-09-14T02:00:00Z",
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000001",
    vendor_name: "Current renamed vendor",
    cuisine_types: ["Western"],
    status: "active",
    latitude: 2.22,
    longitude: 102.22,
    published_at: "2026-09-13T02:00:00Z",
    created_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    vendor_name: "Legacy active vendor",
    cuisine_types: null,
    status: "active",
    latitude: 2.23,
    longitude: 102.23,
    published_at: null,
    created_at: "2026-09-12T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    vendor_name: "No coordinates",
    cuisine_types: ["Cafe / Dessert"],
    status: "active",
    latitude: null,
    longitude: null,
    published_at: "2026-09-16T00:00:00Z",
    created_at: "2026-09-01T00:00:00Z",
  },
];

const events = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    type: "new_vendor",
    vendor_id: "00000000-0000-4000-8000-000000000002",
    created_at: "2026-09-01T00:00:00Z",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    type: "vendor_reactivated",
    vendor_id: "00000000-0000-4000-8000-000000000002",
    created_at: "2026-09-14T02:00:01Z",
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    type: "new_vendor",
    vendor_id: "00000000-0000-4000-8000-000000000001",
    created_at: "2026-09-13T02:00:01Z",
  },
];

test("feed vendors are current, located, unique, and ordered by latest activation", () => {
  assert.deepEqual(
    selectFeedVendors(vendors).map((vendor) => vendor.vendor_name),
    ["Recently Reactivated", "Current renamed vendor", "Legacy active vendor"],
  );
});

test("the feed uses one latest event per vendor and current vendor fields", () => {
  assert.deepEqual(buildCustomerNotificationFeed(selectFeedVendors(vendors), events), [
    {
      id: "10000000-0000-4000-8000-000000000002",
      type: "vendor_reactivated",
      vendor_id: "00000000-0000-4000-8000-000000000002",
      name: "Recently Reactivated",
      cuisine_types: ["Malaysian / Local"],
      published_at: "2026-09-14T02:00:00Z",
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      type: "new_vendor",
      vendor_id: "00000000-0000-4000-8000-000000000001",
      name: "Current renamed vendor",
      cuisine_types: ["Western"],
      published_at: "2026-09-13T02:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000004",
      type: "new_vendor",
      vendor_id: "00000000-0000-4000-8000-000000000004",
      name: "Legacy active vendor",
      cuisine_types: null,
      published_at: "2026-09-12T00:00:00Z",
    },
  ]);
});

test("the limit is applied after invalid vendors are removed", () => {
  assert.equal(selectFeedVendors(vendors, 2).length, 2);
  assert.deepEqual(
    selectFeedVendors(vendors, 2).map((vendor) => vendor.vendor_name),
    ["Recently Reactivated", "Current renamed vendor"],
  );
});

test("the customer notifications route derives entries from current vendors", () => {
  const route = readFileSync(new URL("../routes/engagement.js", import.meta.url), "utf8");
  assert.match(route, /selectFeedVendors/);
  assert.match(route, /buildCustomerNotificationFeed/);
  assert.match(route, /vendor_name, cuisine_types, status, latitude, longitude, published_at, created_at/);
  assert.match(route, /\.eq\("status", "active"\)/);
  assert.match(route, /\.in\("vendor_id", feedVendors\.map\(\(vendor\) => vendor\.id\)\)/);
  assert.doesNotMatch(route, /\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(NOTIFICATION_LIMIT\)/);
});
