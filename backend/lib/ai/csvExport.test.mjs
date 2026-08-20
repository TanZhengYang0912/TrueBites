import { test } from "node:test";
import assert from "node:assert/strict";
import { buildJobCsv } from "./csvExport.js";

const baseJob = {
  url: "https://www.tiktok.com/@diarimelaka/video/123",
  summary: "This video features a food spot in Melaka.",
  extracted: {
    vendor_name: "Chacos Berlauk",
    address: "Jalan Hang Jebat",
    city: "Melaka",
    state: "Melaka",
    country: "Malaysia",
    cuisine_types: ["Nyonya", "Dessert"],
    signature_dishes: ["Cendol", "Ais Kacang"],
    price_range: "RM5-10 per person",
    sentiment_score: 4.5,
    operating_hours_raw: "10am - 6pm",
  },
};

test("buildJobCsv: 18 headers in the documented order", () => {
  const { buffer } = buildJobCsv(baseJob);
  const text = buffer.toString("utf8").replace(/^﻿/, "");
  const headerLine = text.split("\n")[0];
  assert.equal(
    headerLine,
    "vendor_name,address,city,state,country,latitude,longitude,cuisine_types,signature_dishes,price_range,sentiment_score,average_rating,review_count,ai_review_summary,operating_hours_raw,source_video_url,source_platform,last_updated"
  );
});

test("buildJobCsv: has a UTF-8 BOM so Excel opens it correctly", () => {
  const { buffer } = buildJobCsv(baseJob);
  assert.deepEqual([...buffer.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test("buildJobCsv: joins array fields with commas and quotes every value", () => {
  const { buffer } = buildJobCsv(baseJob);
  const text = buffer.toString("utf8");
  assert.ok(text.includes('"Nyonya, Dessert"'));
  assert.ok(text.includes('"Cendol, Ais Kacang"'));
});

test("buildJobCsv: doubles embedded quotes", () => {
  const job = { ...baseJob, extracted: { ...baseJob.extracted, vendor_name: 'The "Best" Stall' } };
  const { buffer } = buildJobCsv(job);
  assert.ok(buffer.toString("utf8").includes('"The ""Best"" Stall"'));
});

test("buildJobCsv: sniffs platform from the job URL", () => {
  const tiktok = buildJobCsv(baseJob).buffer.toString("utf8");
  assert.ok(tiktok.includes(',"TikTok",'));
  const youtube = buildJobCsv({ ...baseJob, url: "https://www.youtube.com/watch?v=abc" }).buffer.toString("utf8");
  assert.ok(youtube.includes(',"YouTube",'));
});

test("buildJobCsv: sanitizes the vendor name into a safe filename", () => {
  const job = { ...baseJob, extracted: { ...baseJob.extracted, vendor_name: "Chacos & Berlauk!" } };
  const { filename } = buildJobCsv(job);
  assert.equal(filename, "Chacos___Berlauk_.csv");
});
