// shared/js/namo/namo-guard.js: an AI-worded reply may only reword DormNamo's facts, never add to them.
import { test } from "node:test";
import assert from "node:assert/strict";
import Guard from "../shared/js/namo/namo-guard.js";

const FACTS =
  "Gonzales-Deanon Boarding House D is your best match right now (82%). It's a short 4-minute walk to class, " +
  "at ₱4,000 a month it leaves you about ₱2,000 under your budget, and it lists Wi-Fi. It edges out Flora's (78%). " +
  "Worth asking the owner: it doesn't mention the water supply.";
const NAMES = [
  ["Gonzales-Deanon Boarding House D", "Gonzales-Deanon"],
  ["Flora's Residence Hall", "Flora's"],
  ["JR Boys Boarding House", "JR"],
  ["Brylle's Dormitory", "Brylle's"],
];
const ok = (reply, mode = "explain") =>
  Guard.check(reply, mode === "chat" ? "" : FACTS, { mode, names: NAMES });

test("a faithful rewording passes", () => {
  assert.deepEqual(
    ok(
      "Your top pick is Gonzales-Deanon (82%): just a 4-minute walk, ₱4,000 a month with Wi-Fi, so you'd keep about ₱2,000 of your budget. It narrowly beats Flora's (78%). Do ask the owner about water.",
    ),
    { ok: true },
  );
});

test("numbers are normalized: 4000 = 4,000, 82% = 82", () => {
  assert.deepEqual(Guard.numbers("₱4,000 and 82% and 0.30 km"), ["4000", "82", "0.3"]);
  assert.equal(ok("It's ₱4000 a month and an 82 percent match.").ok, true);
});

test("an invented price, number or rating is rejected", () => {
  assert.match(ok("Gonzales-Deanon costs ₱3,500 a month.").why, /3500/);
  assert.match(ok("It's only a 2-minute walk.").why, /number not in the facts: 2/);
  assert.match(ok("Students rate it 4.9 stars.").why, /4\.9/);
});

test("a price can't appear when the facts have none ('Rate on request' stays that)", () => {
  const r = Guard.check(
    "The rent is about a thousand pesos.",
    "The rent isn't published, so ask the owner.",
    { mode: "explain" },
  );
  assert.equal(r.ok, false);
  assert.match(r.why, /price/);
});

test("promises nobody made are rejected", () => {
  for (const claim of [
    "It's verified and guaranteed safe.",
    "There are rooms available now!",
    "Ask for a discount.",
    "It has free wifi.",
  ])
    assert.equal(ok(claim).ok, false, claim);
});

test("a listing that isn't in the facts is rejected", () => {
  assert.match(ok("You could also try Brylle's Dormitory.").why, /Brylle/);
  assert.match(ok("JR Boys Boarding House is good too.").why, /JR Boys/);
});

test("chat mode: no numbers, prices or listings at all", () => {
  assert.equal(ok("Glad you're doing well! Want me to find you a quiet place near campus?", "chat").ok, true);
  assert.equal(ok("Rooms here cost around 3000.", "chat").ok, false);
  assert.equal(ok("Try Flora's Residence Hall!", "chat").ok, false);
});

test("markup, links and empty or huge replies are rejected", () => {
  assert.equal(ok("<script>alert(1)</script>").ok, false);
  assert.equal(ok("See https://example.com").ok, false);
  assert.equal(ok("[click](x)").ok, false);
  assert.equal(ok("").ok, false);
  assert.equal(ok("a".repeat(Guard.MAX_REPLY + 1)).ok, false);
});

test("plain() removes emoji Gemini adds, keeps the words and ₱", () => {
  assert.equal(Guard.plain("Hi there! 😊 It's ₱4,000 👍🏽 and close ❤️."), "Hi there! It's ₱4,000 and close.");
  assert.equal(Guard.plain("No emoji here."), "No emoji here.");
});
