import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePlan } from "../tools/parse-plan.mjs";

const plan = parsePlan(readFileSync(new URL("../content/month-1-plan.md", import.meta.url), "utf8"));

test("28 days, 12 lessons, 12 prompts, 29 error rows, 2 checkpoints", () => {
  assert.equal(plan.days.length, 28);
  assert.equal(plan.days.filter((d) => d.lessonNo).length, 12);
  assert.equal(plan.prompts.length, 12);
  assert.equal(plan.errors.length, 29);
  assert.equal(plan.checkpoints.length, 2);
});
test("lesson days are Mon/Wed/Fri, Sundays are off", () => {
  for (const d of plan.days.filter((d) => d.lessonNo)) assert.ok(["Mon", "Wed", "Fri"].includes(d.dow), d.date);
  for (const d of plan.days.filter((d) => d.dow === "Sun")) assert.equal(d.type, "off");
});
test("every lesson has 4 or 5 agenda blocks; lessons 1-11 have 4 homework items", () => {
  for (const d of plan.days.filter((d) => d.lessonNo && d.lessonNo < 12)) { assert.ok(d.agenda.length >= 4, d.date); assert.equal(d.homework.length, 4, d.date); }
});
test("task keys are unique and stable-shaped", () => {
  const keys = plan.days.flatMap((d) => [...d.tasks, ...d.homework].map((t) => t.key));
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^2026-\d\d-\d\d\|[a-z]+\|\d+$/);
});
test("self-study days have the four blocks 50/70/45/15", () => {
  for (const d of plan.days.filter((d) => d.type === "self")) assert.deepEqual(d.tasks.map((t) => t.minutes), [50, 70, 45, 15]);
});
test("Lesson 1 baseline questions are parsed", () => {
  const l1 = plan.days[0];
  assert.ok(l1.questions.part1.includes("Work:") && l1.questions.part2.startsWith("Describe a skill") && l1.questions.part3.includes("practical skills"));
});
test("prompts P1..P12 are linked from days", () => {
  assert.deepEqual(plan.prompts.map((p) => p.id), Array.from({ length: 12 }, (_, i) => "P" + (i + 1)));
  const tue = plan.days.find((d) => d.date === "2026-10-13");
  assert.equal(tue.tasks.find((t) => t.block === "write").prompt, "P1");
});
