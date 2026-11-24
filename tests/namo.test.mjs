// Namo (js/namo/chat.js + js/namo/talk.js + js/matching/insights.js) loaded into a vm with the DOM and storage stubbed out.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { jsPath } from "../tools/js-files.mjs";

function namo() {
  const store = {};
  const el = () => ({
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    remove() {},
  });
  const ctx = {
    console,
    Date,
    Math,
    JSON,
    String,
    Array,
    Object,
    Number,
    RegExp,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => (store[k] = String(v)),
      key: (i) => Object.keys(store)[i],
      get length() {
        return Object.keys(store).length;
      },
    },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: el,
      addEventListener() {},
      body: { dataset: { page: "home" } },
    },
    matchMedia: () => ({ matches: false }),
    fetch: (...a) => ctx._fetch(...a),
    _fetch: async () => {
      throw new Error("no network in tests");
    },
    AbortController,
    Response,
    Promise,
    addEventListener() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of [
    "data",
    "utils",
    "photos",
    "listings",
    "comments",
    "hearts",
    "matching",
    "twotower",
    "state",
    "explain",
    "namo-guard",
    "namo-ai",
    "knowledge",
    "websearch",
    "talk",
    "chat",
    "insights",
  ])
    vm.runInContext(fs.readFileSync(jsPath(f), "utf8"), ctx, {
      filename: f + ".js",
    });
  vm.runInContext(
    `USER = { id: "u1", name: "Ana" };
    S = { P: JSON.parse(JSON.stringify(DEF)), likes: [], passes: [], marks: [], inq: [], log: [], hist: [], views: {}, done: 1 };
    initModel(); save = function () {};`,
    ctx,
  );
  const run = (code) => vm.runInContext(code, ctx);
  return {
    ctx,
    run,
    say: (m) =>
      String(run("Chat.reply(" + JSON.stringify(m) + ")"))
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " "),
    gender: () => run("S.P.gender"),
  };
}

test("'man' in everyday talk is not a gender", () => {
  for (const m of [
    "hey man",
    "the man at the gate was rude",
    "man, this is hard",
    "where is a cheap one man?",
  ]) {
    const n = namo();
    n.say(m);
    assert.equal(n.gender(), "any", m);
  }
});

test("gender is set when the sentence is about the room", () => {
  for (const [m, g] of [
    ["dorm for men", "male"],
    ["I'm a guy", "male"],
    ["girls only", "female"],
    ["looking for a place for ladies", "female"],
  ]) {
    const n = namo();
    n.say(m);
    assert.equal(n.gender(), g, m);
  }
});

test("slang and greetings get a friendly reply, not the fallback", () => {
  const n = namo();
  for (const m of ["breh", "bro", "sup bro", "hey man", "yo dude"])
    assert.doesNotMatch(n.say(m), /not sure I got that|beyond me/, m);
});

test("questions about the area are answered from the data", () => {
  const n = namo();
  assert.match(n.say("what's the rent around here?"), /publish/);
  assert.match(n.say("where is a cheap one?"), /Here you go/);
});

test("changes are explained back and can be answered with a quick yes", () => {
  const n = namo();
  assert.match(n.say("I'm broke and I have online classes"), /tight budget/);
  n.run("S.P.bhMax = 3000; S.P.maxKm = 0.8;"); // budget + walk known, so the next follow-up is a yes/no one
  const r = n.say("need a kitchen");
  assert.match(r, /must-have/);
  assert.match(n.say("Yes"), /must have/);
});

test("learning from activity needs consent and can be switched off", () => {
  const n = namo();
  assert.match(n.say("what do I like?"), /Can I learn/);
  n.run(`Insights.setConsent(true);
    var byD = HOUSES.slice().sort(function (a, b) { return a.d - b.d; });
    byD.slice(0, 3).forEach(function (h) { S.likes.push(h.id); });
    S.act = { v: {}, q: [{ p: 3000, types: [], am: [] }, { p: 3000, types: [], am: [] }] };`);
  assert.match(n.say("what do I like?"), /picked up/);
  n.say("Yes, update them");
  assert.equal(n.run("S.P.bhMax"), 3000);
  n.say("stop learning");
  assert.equal(n.run("S.learn"), false);
  assert.equal(n.run("!!S.act"), false);
});

test("'best' is never typo-corrected into a listing name (West Bend St)", () => {
  const n = namo();
  assert.equal(n.run('Chat.parse("what is best for me").house'), null);
});

test("what's best / why / why not / compare are explained from the match data", () => {
  const n = namo();
  const top = n.run("queue()[0].h.n"),
    second = n.run("queue()[1].h.n");
  const best = n.say("what is best for me");
  assert.match(best, new RegExp(top.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(best, /(because|Mostly)/);
  assert.match(best, /edges out/);
  assert.match(n.say("why is it best for me"), /(because|Mostly)/);
  const why2 = n.say("why not the second one?");
  assert.match(why2, /#2 of/);
  assert.match(why2, /ranks higher/);
  const cmp = n.say("which is better?");
  assert.match(cmp, / vs /);
  assert.match(cmp, /I'd (pick|lean)/);
  assert.ok(cmp.includes(second.split(" ")[0]) || cmp.includes(top.split(" ")[0]));
});

test("a must-have that rules a room out is explained, with an offer to relax it", () => {
  const n = namo();
  const id = n.run("queue()[0].h.id");
  n.run(
    "S.P.m.vis = 2; HOUSES.filter(function (h) { return h.id === " + id + "; })[0].facts = { vis: false };",
  );
  const name = n.run("byId(" + id + ").n");
  const w = n.run("Explain.whyNot(byId(" + id + ")).html");
  assert.match(w, /hidden from your matches/);
  assert.match(w, /must-have/);
  assert.ok(w.includes(name.split(" ")[0]));
});

test("small extra words don't break small talk ('im fine as well', 'bye for now')", () => {
  const n = namo();
  for (const m of ["im fine as well", "i am doing good too", "bye for now", "thanks a lot man"])
    assert.doesNotMatch(n.say(m), /not 100% sure|not sure I got that/, m);
  assert.match(n.say("im fine as well"), /Glad to hear/);
});

test("a one-word example doesn't swallow a real sentence ('my roommate snores lol')", () => {
  const n = namo();
  assert.match(n.say("my roommate snores lol"), /quiet/);
});

test("Gemini wording: asked first, label on success, Namo's own words when a reply adds a listing", async () => {
  const n = namo();
  n.run('DN_CONFIG = { nearbyApiUrl: "https://w.example" };');
  let sent = 0,
    reply = "";
  n.ctx._fetch = async (url, init) => {
    sent++;
    assert.equal(url, "https://w.example/namo");
    return Response.json({ reply });
  };
  const job = () =>
    n.run('({ mode: "explain", q: "what is best for me", facts: NamoAI.plain(Explain.best().html) })');

  assert.equal(n.run("NamoAI.available() && !NamoAI.asked()"), true);
  assert.equal(await n.run("NamoAI.phrase")(job()), null, "nothing is sent before the student says yes");
  assert.equal(sent, 0);

  n.run("NamoAI.setConsent(true)");
  const facts = job().facts,
    top = n.run("queue()[0].h"),
    pct = n.run("queue()[0].pct");
  assert.ok(facts.includes(String(pct)), "facts carry the real numbers");
  reply = "Your best bet is " + top.n + " at " + pct + "%.";
  const html = await n.run("NamoAI.phrase")(job());
  assert.match(html, /Worded by Google Gemini/);
  assert.match(html, /<b>/);
  assert.equal(sent, 1);

  const other = n.run(
    "HOUSES.filter(function (h) { return h.id !== " +
      top.id +
      " && " +
      JSON.stringify(facts) +
      ".indexOf(h.n) < 0; })[0].n",
  );
  reply = "Honestly, " + other + " is the one to pick.";
  assert.equal(await n.run("NamoAI.phrase")({ mode: "explain", q: "anything else?", facts }), null);

  n.ctx._fetch = async () => new Response("{}", { status: 429 });
  assert.equal(
    await n.run("NamoAI.phrase")({ mode: "chat", q: "hmm", facts: "" }),
    null,
    "quota used up -> Namo's own words",
  );
});

test("every dorm is recognized by its name, short form or a close typo", () => {
  const n = namo();
  for (const [msg, name] of [
    ["uy pad", "Uy Pad Residences"],
    ["uy pad residences", "Uy Pad Residences"],
    ["T&D", "T&D Dormitory"],
    ["jr boys", "JR Boys Boarding House"],
    ["mb ladies", "MB Ladies Dormitory"],
    ["tell me about flora", "Flora's Residence Hall"],
    ["gonzalez deanon", "Gonzales-Deanon Boarding House D"],
    ["valerra", "Valera Residence Hall"],
  ])
    assert.equal(n.run("(Know.find(" + JSON.stringify(msg) + ")[0] || {}).n"), name, msg);
  for (const msg of ["what is best for me", "i need a residence hall", "hey man", "west bend"])
    assert.equal(n.run("Know.find(" + JSON.stringify(msg) + ").length"), 0, msg);
});

test("Namo answers any detail about a named dorm, and remembers which one for follow-ups", () => {
  const n = namo();
  const card = n.say("uy pad");
  assert.match(card, /Uy Pad Residences/);
  assert.match(card, /Walk: 0\.6 km/);
  assert.match(card, /For you: \d+% match/);
  assert.match(n.say("does uy pad have aircon?"), /Aircon isn't listed \(unverified\)/);
  assert.match(n.say("how far is it?"), /0\.6 km from MSU-IIT/);
  assert.match(n.say("does gonzales deanon have wifi?"), /Yes, it has Wi-Fi/);
});

test("a search across listings doesn't change preferences, and Namo offers to save it", () => {
  const n = namo();
  const before = n.run("JSON.stringify(S.P)");
  const r = n.say("show me places under 4k");
  assert.match(r, /I found 1 match for “places under ₱4,000”/);
  assert.match(r, /Gonzales-Deanon/);
  assert.equal(n.run("JSON.stringify(S.P)"), before, "a question is not a preference");
  assert.match(r, /remember this in your preferences/);
  n.say("Yes, remember it");
  assert.equal(n.run("S.P.bhMax"), 4000);
  assert.match(n.say("how many dorms are for girls?"), /2 matches for “dormitories for girls”/);
});

test("asking about a dorm counts as interest and adapts the ranking signal", () => {
  const n = namo();
  const id = n.run('Know.find("uy pad")[0].id');
  n.say("uy pad");
  assert.equal(n.run("S.views[" + id + "]"), 1);
  assert.equal(
    n.run("S.log.filter(function (x) { return x.id === " + id + "; }).length"),
    1,
    "once per visit",
  );
  n.say("uy pad");
  assert.match(n.say("does uy pad have wifi?"), /save it to your hearts/);
});

test("Namo can tell what it knows about the student", () => {
  const n = namo();
  n.run("S.P.m.wifi = 2;");
  const me = n.say("what do you know about me?");
  assert.match(me, /What you want now/);
  assert.match(me, /Wi-Fi \/ internet/);
  assert.match(me, /Learning from your activity/);
});

test("a listing's reference number finds it, and its profile shows it", () => {
  const n = namo();
  const h = n.run('JSON.stringify(HOUSES.filter(function (x) { return x.n === "Uy Pad Residences"; })[0])');
  const { ref } = JSON.parse(h);
  const short = "DN-" + ref.slice(0, 8).toUpperCase();
  assert.equal(
    n.run("Know.find(" + JSON.stringify("what is " + short + "?") + ")[0].n"),
    "Uy Pad Residences",
  );
  assert.equal(n.run("Know.find(" + JSON.stringify(ref) + ")[0].n"), "Uy Pad Residences");
  assert.match(n.say("uy pad"), new RegExp("Reference no\.: " + short));
});

test("no strong match: Namo offers a web search once, and searches when asked", () => {
  const n = namo();
  n.run("S.P.maxKm = 0.2;"); // only a couple of places are that close, and none is a strong fit
  const best = n.say("what's best for me?");
  assert.match(best, /Your best match here is \d+%, not a strong fit yet/);
  assert.match(best, /search the web for more places within 1 km of MSU-IIT/i);
  assert.match(best, /I'll list the links I find\. Search the web for more places\s*$/); // the button
  assert.doesNotMatch(n.say("what's best for me?"), /search the web for more places within/i, "offered once");
  const go = n.say("search online for dorms in Tibanga please");
  assert.match(go, /Searching the web \(OpenStreetMap\) for dormitories within 1 km of Tibanga/);
  assert.match(go, /nothing about your account/i);
  // any Iligan barangay is understood as the area, even without "in"
  assert.match(n.say("look online for a pala-o boarding house"), /boarding houses within 1 km of Pala-o/);
  // ordinary room talk never starts a web search
  for (const msg of ["i want a room near campus", "find me something cheaper", "is uy pad online?"])
    assert.doesNotMatch(n.say(msg), /Searching the web/, msg);
});
