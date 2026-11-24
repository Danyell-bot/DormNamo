/* ==========================================================
   testbot.js - a TEST landowner account that answers by itself
   For trying the message system alone (one browser, one person):
   "Try it with a test bot" on the Messages page creates
     - the account "Namo Test Landowner" (a bot: no password, labeled
       "Test bot" everywhere, cannot be logged into),
     - one listing, clearly marked as a test listing (not a real place),
     - a chat with it, as if you tapped Inquire now.
   The bot then answers like a landowner: rent, Wi-Fi, water, rules,
   visits and location (from its own test listing), sends a photo back
   (a drawn picture of a room) when you send or ask for photos, answers
   emojis with emojis, counters a low offer once and accepts a fair one,
   and welcomes you in the tenant group after a deal.
   "Remove test bot" deletes the account, its listing and its chats.
   Replies are chosen by reply() (pure, tested in tests/testbot.test.mjs).
   ========================================================== */
var TestBot = (function () {
  var ID = "bot-landowner",
    NAME = "Namo Test Landowner",
    LID = 990001, // listing id: far above the ids in data.js
    BIO =
      "🤖 A test bot account, not a real person. It answers like a landowner so you can try messages, photos, emojis, offers and the tenant group. Its listing is not a real place.",
    LISTING = {
      id: LID,
      ref: "7e57b07a-0000-4000-8000-00000000b07a",
      uid: ID,
      owner: NAME,
      n: "DormNamo Test House (test bot)",
      a: "Tibanga",
      brgy: "Tibanga",
      street: "Test listing, not a real address",
      s: "MSU-IIT",
      d: 0.5,
      t: "Boarding house",
      p: 3000,
      c: "",
      ds: "TEST LISTING made by the test bot, not a real place. Use it to try Inquire now, photos, emojis, offers and the tenant group chat.",
      am: ["Wi-Fi", "Water included"],
      facts: {
        cap: 2,
        gender: ["male", "female", "mixed"],
        water: "incl",
        water247: true,
        elec: "extra",
        curfew: true,
        vis: false,
      },
      plan: "basic",
      f: 0,
      demo: 1,
    },
    FAIR = 2800; // offers at or above this are accepted

  function exists() {
    return !!(window.Accounts && Accounts.person && Accounts.person(ID));
  }
  /** Create the bot, its test listing and a chat with it. Returns the chat id. */
  function start() {
    Accounts.addBot({ id: ID, name: NAME, roles: ["owner"], bio: BIO, email: "test-landowner@bot.dormnamo" });
    if (!Listings.get(LID)) Listings.save(JSON.parse(JSON.stringify(LISTING)));
    var r = Inbox.interest(LID, "Hi! I'd like to try the messages. Is a room free?");
    return r.thread ? r.thread.id : null;
  }
  function remove() {
    Inbox.forget(ID);
    Listings.remove(LID);
    Accounts.removeBot(ID);
  }

  /* ---------- what the bot says (pure) ---------- */
  var EMOJI_ONLY = /^[\s\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}]+$/u;
  function peso(n) {
    return "₱" + Number(n).toLocaleString("en-PH");
  }
  /**
   * reply(m, t, ctx) -> list of actions for the newest message m in chat t:
   *   {say: text, photo?: true}  |  {offer: {rent, note}}  |  {answer: msgId, yes}  |  {group: text}
   * ctx: {first: student's first name, offers: earlier offers from the bot in this chat}
   */
  function reply(m, t, ctx) {
    ctx = ctx || {};
    var hi = ctx.first ? ctx.first : "there",
      text = String(m.text || "").toLowerCase(),
      imgs = (m.data && m.data.imgs) || [];
    if (t.type === "group")
      return ctx.groupSeen
        ? []
        : [
            {
              group:
                "Welcome to the house group, " +
                hi +
                "! 🏠 Rent is due every 5th. Ask here if you need anything. (test bot)",
            },
          ];
    if (m.kind === "interest")
      return [
        {
          say:
            "Hi " +
            hi +
            "! 👋 Thanks for your interest in " +
            LISTING.n +
            ". I'm a test bot landowner, so you can try everything here: ask about rent, Wi-Fi, water, curfew or visits, send a photo or an emoji, or tap Make an offer.",
        },
      ];
    if (m.kind === "offer") {
      if (!m.data || m.data.state !== "open") return [];
      var rent = m.data.rent;
      if (rent >= FAIR)
        return [
          { answer: m.id, yes: true },
          {
            say:
              "Deal at " +
              peso(rent) +
              " a month! 🎉 I added you to our tenant group. You'll find it under Groups in Messages.",
          },
        ];
      if (!ctx.offers) {
        var meet = Math.max(FAIR, Math.round((rent + LISTING.p) / 2 / 50) * 50);
        return [
          {
            offer: {
              rent: meet,
              note: "Meet me halfway? Water and Wi-Fi are included. (test bot counter-offer)",
            },
          },
        ];
      }
      return [
        { answer: m.id, yes: false },
        {
          say:
            "Sorry, " +
            peso(rent) +
            " is too low for me. My lowest is " +
            peso(FAIR) +
            " a month. You can make a new offer any time.",
        },
      ];
    }
    if (imgs.length)
      return [
        {
          say:
            "Thanks for the " +
            (imgs.length > 1 ? imgs.length + " photos" : "photo") +
            "! 📸 Here's one of our rooms (a test picture):",
          photo: true,
        },
      ];
    var raw = String(m.text || "").trim();
    if (raw && EMOJI_ONLY.test(raw))
      return [
        {
          say: /❤|😍|🥰|💕/.test(raw)
            ? "🥰🏠"
            : /😢|😭|☹|🙁/.test(raw)
              ? "🤗 Don't worry, we'll find you a room!"
              : "😄👍",
        },
      ];
    var rules = [
      [
        /\b(photos?|pictures?|pics?|images?|look like)\b/,
        { say: "Sure! Here's one of our rooms (a test picture): 📷", photo: true },
      ],
      [
        /\b(rent|price|how much|cost|monthly|deposit|advance)\b/,
        {
          say:
            "Rent is " +
            peso(LISTING.p) +
            " a month for a bedspace, water included, electricity is separate. 1 month advance + 1 month deposit.",
        },
      ],
      [/\bwi-?fi\b|\binternet\b/, { say: "Yes, Wi-Fi is included in the rent. 📶" }],
      [/\bwater\b/, { say: "Water is included and runs 24/7. 💧" }],
      [
        /\b(electric|electricity|power|kuryente)\b/,
        { say: "Electricity is separate: each room has its own sub-meter." },
      ],
      [
        /\b(curfew|rules?|visitors?|guests?)\b/,
        { say: "Curfew is 10 pm, and no visitors inside the rooms. Common area is fine until 8 pm." },
      ],
      [
        /\b(free|vacan\w*|available|slot|room for)\b/,
        { say: "Yes! 2 rooms (2 per room) are free from June. ✅" },
      ],
      [
        /\b(visit|see it|view|tour|schedule)\b/,
        { say: "You can visit any day, 9 am to 5 pm. Just message me first. 🙂" },
      ],
      [
        /\b(where|address|location|located)\b/,
        {
          say: "We're in Brgy. Tibanga, a 6-minute walk to MSU-IIT. (This is a test listing, not a real address.)",
        },
      ],
      [/\b(thanks|thank you|salamat|ty)\b/, { say: "You're welcome! 😊" }],
      [
        /\b(hi|hello|hey|good (morning|afternoon|evening))\b/,
        { say: "Hello " + hi + "! 👋 How can I help?" },
      ],
    ];
    for (var i = 0; i < rules.length; i++) if (rules[i][0].test(text)) return [rules[i][1]];
    return [
      {
        say: "Got it! (test bot) Try asking about rent, Wi-Fi, curfew or visits, send a photo or an emoji, or make an offer.",
      },
    ];
  }

  /* ---------- a drawn "photo" of a room, so the bot can send pictures without any real photo ---------- */
  function roomPicture() {
    if (typeof document === "undefined" || !document.createElement) return null;
    var c = document.createElement("canvas");
    if (!c.getContext) return null;
    c.width = 640;
    c.height = 420;
    var g = c.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#e9eef7"; // wall
    g.fillRect(0, 0, 640, 300);
    g.fillStyle = "#c79a6b"; // floor
    g.fillRect(0, 300, 640, 120);
    g.fillStyle = "#9fd3f5"; // window
    g.fillRect(380, 60, 180, 130);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 8;
    g.strokeRect(380, 60, 180, 130);
    g.beginPath();
    g.moveTo(470, 60);
    g.lineTo(470, 190);
    g.stroke();
    g.fillStyle = "#0a47a9"; // bed
    g.fillRect(40, 230, 280, 90);
    g.fillStyle = "#ffffff";
    g.fillRect(50, 215, 90, 40);
    g.fillStyle = "#ffc83d"; // desk
    g.fillRect(400, 250, 170, 18);
    g.fillRect(410, 268, 12, 70);
    g.fillRect(548, 268, 12, 70);
    g.fillStyle = "rgba(10,47,115,0.85)";
    g.fillRect(0, 380, 640, 40);
    g.fillStyle = "#ffffff";
    g.font = "bold 20px sans-serif";
    g.fillText("TEST BOT PICTURE · not a real room", 16, 407);
    return c.toDataURL("image/jpeg", 0.8);
  }

  /* ---------- answering: when someone writes to the bot ---------- */
  var busy = {};
  function lock(msgId) {
    // only one tab answers a message
    try {
      var k = "dn:botDone:" + msgId;
      if (localStorage.getItem(k)) return false;
      localStorage.setItem(k, "1");
    } catch (e) {}
    return true;
  }
  function act(t, m) {
    var first = String(Inbox.nameOf(m.from || "") || "").split(" ")[0],
      offers = Inbox.messages(t.id).filter(function (x) {
        return x.kind === "offer" && x.from === ID;
      }).length,
      groupSeen =
        t.type === "group" &&
        Inbox.messages(t.id).some(function (x) {
          return x.from === ID;
        });
    reply(m, t, { first: first, offers: offers, groupSeen: groupSeen }).forEach(function (a) {
      if (a.answer) {
        var r = Inbox.answer(a.answer, a.yes, ID);
        if (r && r.group)
          Inbox.send(
            r.group.id,
            "Welcome to the house group, " + first + "! 🏠 Rent is due every 5th. (test bot)",
            { as: ID },
          );
      } else if (a.offer) Inbox.offer(t.id, a.offer, ID);
      else if (a.group) Inbox.send(t.id, a.group, { as: ID });
      else if (a.say) {
        var pic = a.photo ? roomPicture() : null;
        Inbox.send(t.id, a.say, { as: ID, imgs: pic ? [pic] : [] });
      }
    });
  }
  /** Look for messages to the bot that it hasn't answered yet, and answer after a short "typing" pause. */
  function check() {
    if (!window.Inbox || !window.USER || !exists()) return;
    Inbox.threads().forEach(function (x) {
      var t = x.t,
        m = x.last;
      if (t.members.indexOf(ID) < 0 || !m || !m.from || m.from === ID || busy[m.id]) return;
      busy[m.id] = 1;
      setTimeout(
        function () {
          var now = Inbox.messages(t.id),
            last = now[now.length - 1];
          if (!last || last.id !== m.id || !lock(m.id)) return; // someone wrote again, or another tab answered
          act(Inbox.get(t.id), m);
        },
        900 + Math.random() * 600,
      );
    });
  }
  if (window.Inbox) Inbox.on(check);
  if (window.addEventListener) window.addEventListener("load", check);

  return {
    ID: ID,
    NAME: NAME,
    LID: LID,
    exists: exists,
    start: start,
    remove: remove,
    reply: reply,
    check: check,
  };
})();
