// js/account/testbot.js (the test landowner) and photos / emojis in inbox.js messages.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { jsPath } from "../tools/js-files.mjs";

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQg="; // a tiny stand-in

function browser({ quota = Infinity } = {}) {
  const store = new Map();
  const size = () => [...store.values()].reduce((n, v) => n + v.length, 0);
  const ctx = {
    console,
    Math,
    JSON,
    Date,
    Promise,
    setTimeout,
    crypto: webcrypto,
    Uint8Array,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        const before = store.get(k);
        store.set(k, String(v));
        if (size() > quota) {
          if (before == null) store.delete(k);
          else store.set(k, before);
          const e = new Error("quota");
          e.name = "QuotaExceededError";
          throw e;
        }
      },
      removeItem: (k) => store.delete(k),
      key: (i) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
    document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  store.set(
    "dormnamo:accounts",
    JSON.stringify({
      "ana@x.ph": { id: "uAna", name: "Ana Cruz", email: "ana@x.ph", hash: "-", roles: ["student"] },
    }),
  );
  store.set("dormnamo:session", JSON.stringify({ id: "uAna", name: "Ana Cruz", email: "ana@x.ph" }));
  for (const f of ["data", "utils", "photos", "listings", "accounts", "inbox", "testbot"])
    vm.runInContext(fs.readFileSync(jsPath(f), "utf8"), ctx, { filename: f + ".js" });
  const run = (c) => vm.runInContext(c, ctx);
  run('USER = { id: "uAna", name: "Ana Cruz" };');
  return { run, store };
}
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
/** Let the bot answer (it waits about a second, like typing). */
async function botTurn(b) {
  b.run("TestBot.check()");
  await wait(1700);
}

test("the bot's replies: interest, questions, emojis, photos, offers", () => {
  const { run } = browser();
  const say = (m, ctx = {}) =>
    JSON.parse(
      run(`JSON.stringify(TestBot.reply(${JSON.stringify(m)}, { type: "dm" }, ${JSON.stringify(ctx)}))`),
    );
  assert.match(say({ kind: "interest", text: "" }, { first: "Ana" })[0].say, /^Hi Ana! .*test bot landowner/);
  assert.match(say({ kind: "text", text: "how much is the rent?" })[0].say, /₱3,000 a month/);
  assert.match(say({ kind: "text", text: "do you have wifi" })[0].say, /Wi-Fi is included/);
  assert.match(say({ kind: "text", text: "what's the curfew" })[0].say, /Curfew is 10 pm/);
  assert.equal(say({ kind: "text", text: "can I see photos?" })[0].photo, true);
  assert.equal(
    say({ kind: "text", text: "😍😍" })[0].say,
    "Glad you like it! Let me know if you have any questions about the room.",
  );
  assert.equal(say({ kind: "text", text: "👍" })[0].say, "Noted! Anything else you'd like to know?");
  const pic = say({ kind: "text", text: "", data: { imgs: [PHOTO, PHOTO] } })[0];
  assert.match(pic.say, /Thanks for the 2 photos!/);
  assert.equal(pic.photo, true);
  // offers: a fair one is accepted, a low one gets one counter-offer, then a polite no
  assert.equal(say({ kind: "offer", id: "o1", data: { rent: 2900, state: "open" } })[0].yes, true);
  assert.equal(
    say({ kind: "offer", id: "o2", data: { rent: 2000, state: "open" } }, { offers: 0 })[0].offer.rent,
    2800,
  );
  assert.equal(
    say({ kind: "offer", id: "o3", data: { rent: 2000, state: "open" } }, { offers: 1 })[0].yes,
    false,
  );
});

test("start a test chat, talk, send photos and emojis, negotiate, join the tenant group, then remove it all", async () => {
  const b = browser();
  const tid = b.run("TestBot.start()");
  assert.ok(tid);
  assert.equal(b.run('Accounts.person("bot-landowner").bot'), true);
  assert.match(
    b.run('Accounts.describe(Accounts.person("bot-landowner"))'),
    /^Test bot · Landowner · 1 place/,
  );
  assert.match(b.run("HOUSES.filter(function (h) { return h.id === TestBot.LID; })[0].n"), /test bot/i);
  await b
    .run(
      `Accounts.logIn("test-landowner@bot.dormnamo", "").then(function () { return "in"; }, function () { return "no"; })`,
    )
    .then((r) => assert.equal(r, "no", "nobody can log in as the bot"));

  await botTurn(b); // answers the interest card
  const last = () => JSON.parse(b.run(`JSON.stringify(Inbox.messages("${tid}").slice(-1)[0])`));
  assert.equal(last().from, "bot-landowner");
  assert.match(last().text, /test bot landowner/);

  // a photo and some words
  const sent = b.run(`Inbox.send("${tid}", "here's my ID pic", { imgs: ["${PHOTO}"] })`);
  assert.deepEqual([...sent.data.imgs], [PHOTO]);
  await botTurn(b);
  assert.match(last().text, /Thanks for the photo!/);

  // emojis only
  b.run(`Inbox.send("${tid}", "🎉")`);
  await botTurn(b);
  assert.equal(last().text, "Noted! Anything else you'd like to know?");

  // a low offer: the bot counters; accepting the counter makes Ana a tenant in the group chat
  b.run(`Inbox.offer("${tid}", { rent: 2000 })`);
  await botTurn(b);
  const counter = last();
  assert.equal(counter.kind, "offer");
  assert.equal(counter.from, "bot-landowner");
  assert.equal(counter.data.rent, 2800);
  const deal = JSON.parse(b.run(`JSON.stringify(Inbox.answer("${counter.id}", true))`));
  assert.equal(deal.thread.status, "agreed");
  assert.deepEqual(deal.group.members, ["bot-landowner", "uAna"]);

  // in the group, the bot welcomes the new tenant once
  b.run(`Inbox.send("${deal.group.id}", "hi everyone!")`);
  await botTurn(b);
  const g = JSON.parse(b.run(`JSON.stringify(Inbox.messages("${deal.group.id}"))`));
  assert.equal(g.filter((m) => m.from === "bot-landowner").length, 1);
  assert.match(g[g.length - 1].text, /Welcome to the house group, Ana!/);

  // remove: account, listing and chats are gone
  b.run("TestBot.remove()");
  assert.equal(b.run('Accounts.person("bot-landowner")'), null);
  assert.equal(b.run("Listings.get(TestBot.LID)"), null);
  assert.equal(b.run("Inbox.threads().length"), 0);
});

test("photos: at most 4 per message, only real image data, and a full browser storage is reported", () => {
  const b = browser({ quota: 4000 });
  b.run("TestBot.start()");
  const tid = b.run("Inbox.threads()[0].t.id");
  const five = Array(5).fill(PHOTO);
  assert.equal(b.run(`Inbox.send("${tid}", "", { imgs: ${JSON.stringify(five)} }).data.imgs.length`), 4);
  assert.equal(
    b.run(`Inbox.send("${tid}", "", { imgs: ["javascript:alert(1)"] })`),
    null,
    "not an image: nothing sent",
  );
  const big = "data:image/jpeg;base64," + "A".repeat(5000);
  assert.equal(b.run(`Inbox.send("${tid}", "big one", { imgs: ["${big}"] }).error`), "full");
  // a real account can't post as the bot, and the bot can't post as a real account
  assert.equal(b.run(`Inbox.send("${tid}", "fake", { as: "uSomeoneElse" }).from`), "uAna");
});
