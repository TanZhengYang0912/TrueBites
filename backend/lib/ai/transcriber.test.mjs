import { test } from "node:test";
import assert from "node:assert/strict";
import { isUnreliableTranscript } from "./transcriber.js";

test("isUnreliableTranscript: empty segment list is unreliable", () => {
  assert.equal(isUnreliableTranscript([]), true);
  assert.equal(isUnreliableTranscript([{ text: "   " }]), true);
});

test("isUnreliableTranscript: a repeated phrase across most segments is unreliable", () => {
  const segments = Array.from({ length: 5 }, () => ({ text: "thank you for watching" }));
  assert.equal(isUnreliableTranscript(segments), true);
});

test("isUnreliableTranscript: repeated but short (<3 words) text is NOT flagged", () => {
  const segments = Array.from({ length: 5 }, () => ({ text: "okay okay" }));
  assert.equal(isUnreliableTranscript(segments), false);
});

test("isUnreliableTranscript: mostly non-Latin script is unreliable", () => {
  const segments = [{ text: "สวัสดีครับ" }, { text: "ขอบคุณมาก" }, { text: "อร่อยมาก" }];
  assert.equal(isUnreliableTranscript(segments), true);
});

test("isUnreliableTranscript: a normal varied Malay/English transcript is reliable", () => {
  const segments = [
    { text: "Korang tahu tak yang kek tapak kuda ni" },
    { text: "Diorang mencari sebab menu ni sesuai tau" },
    { text: "Untuk makan pagi, makan petang" },
    { text: "Kalau korang mencari tapak kuda yang berkualiti" },
  ];
  assert.equal(isUnreliableTranscript(segments), false);
});
