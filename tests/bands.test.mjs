import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overall, writingBand, rawToBand, speakingBand, nextHalfBand, minAverageFor } from "../app/js/bands.js";

const cfg = JSON.parse(readFileSync(new URL("../app/data/config.json", import.meta.url), "utf8"));
const avgToOverall = (avg) => overall(avg * 4, 0, 0, 0); // four skills summing to avg*4

test("official rounding of the four-skill average", () => {
  assert.equal(avgToOverall(7.75), 8);
  assert.equal(avgToOverall(7.625), 7.5);
  assert.equal(avgToOverall(7.875), 8);
  assert.equal(avgToOverall(8.25), 8.5);
  assert.equal(avgToOverall(8.125), 8);
});
test("real skill sets", () => {
  assert.equal(overall(8.5, 8, 7, 7.5), 8);     // route A
  assert.equal(overall(8.5, 8.5, 7, 7), 8);     // route B
  assert.equal(overall(8.5, 9, 7.5, 8), 8.5);   // route D
  assert.equal(overall(8.5, 7.5, 6.5, 6.5), 7.5); // the mock with speaking assumed 6.5
});
test("Task 2 counts double in the writing estimate", () => {
  assert.equal(writingBand(6, 6.5), 6.5);   // (6 + 13) / 3 = 6.33 -> 6.5
  assert.equal(writingBand(7, 7), 7);
  assert.equal(writingBand(null, 7), 7);
});
test("raw score to band uses config", () => {
  assert.equal(rawToBand(cfg.rawToBand.listening, 37), 8.5);
  assert.equal(rawToBand(cfg.rawToBand.reading, 33), 7.5);
  assert.equal(rawToBand(cfg.rawToBand.reading, 35), 8);
  assert.equal(rawToBand(cfg.rawToBand.reading, 40), 9);
  assert.equal(rawToBand(cfg.rawToBand.listening, 32), 7.5);
});
test("speaking band is the mean of the criteria", () => {
  assert.equal(speakingBand([7, 7, 6, 7]), 7);
  assert.equal(speakingBand([null, null, null, null]), null);
});
test("next half band", () => {
  const r = nextHalfBand({ listening: 8.5, reading: 7.5, writing: 7, speaking: 7 });
  assert.equal(r.base, 7.5);
  assert.equal(minAverageFor(8), 7.75);
});
