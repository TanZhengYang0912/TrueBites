import test from "node:test";
import assert from "node:assert/strict";
import {
  normaliseOperatingHours,
  normaliseVendorHoursFields,
  validateVendorPatch,
  vendorActivationIssues,
} from "./vendorValidation.js";

test("normaliseOperatingHours rejects promotional date ranges", () => {
  assert.equal(normaliseOperatingHours("18 - 27"), null);
  assert.equal(normaliseOperatingHours("Promo April 18 - 27"), null);
});

test("normaliseOperatingHours accepts every supported public-card format", () => {
  assert.equal(normaliseOperatingHours("Mon–Sun 9am – 10pm"), "Mon–Sun 9am – 10pm");
  assert.equal(normaliseOperatingHours("09:00 AM - 10:00 PM"), "09:00 AM - 10:00 PM");
  assert.equal(normaliseOperatingHours("24 hours"), "24 hours");
});

test("normaliseVendorHoursFields prevents persistence bypasses and keeps legacy hours in sync", () => {
  assert.deepEqual(
    normaliseVendorHoursFields({ vendor_name: "Promo stall", operating_hours_raw: "18 - 27" }),
    { vendor_name: "Promo stall", operating_hours_raw: null, operating_hours: null },
  );
  assert.deepEqual(
    normaliseVendorHoursFields({ operating_hours_raw: "10am - 10pm", operating_hours: "stale" }),
    { operating_hours_raw: "10am - 10pm", operating_hours: "10am - 10pm" },
  );
  assert.deepEqual(
    normaliseVendorHoursFields(
      { vendor_name: "Existing stall", operating_hours_raw: "18 - 27", operating_hours: null },
      { omitInvalid: true },
    ),
    { vendor_name: "Existing stall" },
  );
});

test("vendor patches reject hours that the public card cannot display", () => {
  const { errors, clean } = validateVendorPatch({ operating_hours_raw: "18 - 27" });
  assert.match(errors.operating_hours_raw, /recognisable time/i);
  assert.equal(clean.operating_hours_raw, undefined);
});

test("activation treats malformed non-empty hours as invalid", () => {
  const issues = vendorActivationIssues({
    vendor_name: "Nice Girl Yogurt",
    address: "B-005, Dataran Pahlawan, Melaka",
    latitude: 2.1908714,
    longitude: 102.2493743,
    cuisine_types: "Cafe / Dessert",
    operating_hours_raw: "18 - 27",
    operating_hours: "18 - 27",
    price_range: "RM 6 - RM 16 per person",
    signature_dishes: "Frozen Yogurt",
    storefront_image_url: "https://example.com/cover.jpg",
  });
  assert.ok(issues.includes("operating hours"));
});
