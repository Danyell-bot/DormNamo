/* ==========================================================
   talk.js - Namo's conversation brain (small talk + meaning match)
   All local, no API. Used by chat.js.

   How "meaning" is matched:
   1. every word is mapped to a canonical meaning with CANON
      ("hi", "hello", "hey" -> hello; "thx", "ty" -> thank)
   2. a sentence becomes a weighted bag of meanings + word pairs
      + character trigrams (so typos still overlap)
   3. TF-IDF cosine similarity against every example in INTENTS;
      the best intent above THRESH wins, a near miss becomes
      "Did you mean …?"
   To teach Namo: add synonyms to CANON, or add example
   sentences / replies to INTENTS. No code changes needed.

   Speed: an inverted index (feature -> examples that have it) means
   a message is only scored against examples that share a feature
   with it, and typo repairs are memoized.
   ========================================================== */
var Talk = (function () {
  // first word of each line = the meaning; the rest are words that mean the same
  var CANON = [
    "hello hi hey heya hiya hellow helo hai yo howdy greetings hola sup wassup",
    "thank thanks thx ty tnx tq thankyou appreciate appreciated grateful",
    "bye goodbye byee ciao cya later adios goodnight",
    "buddy bro breh bruh brah bros dude dawg fam bestie mate pal homie",
    "good nice great awesome cool amazing helpful smart brilliant wow perfect excellent lit",
    "bad stupid dumb useless annoying trash wrong broken worst idiot",
    "sad stressed stress tired lonely homesick depressed anxious worried upset hopeless frustrated overwhelmed",
    "happy glad excited yay",
    "you u your yours ur",
    "who whom",
    "what wat whats",
    "how hows",
    "yes yeah yep yup ya sure ok okay okey okie k yea correct right exactly",
    "no nope nah",
    "joke jokes funny pun bored boring",
    "haha hahaha hahahaha lol lmao hehe xd rofl",
    "name",
    "make made create created built build develop developed program programmed",
    "room rooms dorm dormitory boarding bh house apartment place unit bedspace pad",
    "price rent cost fee",
    "owner landlord landlady caretaker",
    "contact call text message reach phone number inquire inquiry",
    "safe safety scam legit legitimate trust trustworthy fake scammer",
    "match matching score percent percentage ranking rank algorithm",
    "morning",
    "afternoon",
    "evening night tonight",
    "show display list see view give",
    "find search look looking",
    "recommend suggest suggestion recommendation advice",
    "more another other others next else",
    "like liked love loved favorite favourite saved bookmark bookmarked",
    "preference preferences setting settings filter filters",
    "time clock",
    "day date today",
    "hungry eat food",
    "weather wheather weater rain raining sunny",
    "bot robot ai chatgpt machine program",
    "human person real",
    "visit visiting tour inspect check",
    "help commands",
  ];
  var CMAP = {};
  CANON.forEach(function (line) {
    var w = line.split(" ");
    w.forEach(function (x) {
      CMAP[x] = w[0];
    });
  });

  var IGNORE =
    /^(namo|the|a|an|is|are|am|im|i|me|my|to|of|for|be|do|does|did|can|could|would|will|please|so|very|much|really|just)$/;

  var INTENTS = [
    {
      id: "greet",
      ex: [
        "hi",
        "hello",
        "hey there",
        "good morning",
        "good afternoon",
        "good evening",
        "whats up",
        "sup",
        "yo",
        "hello namo",
      ],
      say: [
        "{greet}, {name}! 👋 What are you looking for in a room today?",
        "Hey {name}! 😊 Want something cheaper, closer to campus, or with Wi-Fi?",
        "Hi {name}! I'm here. Tell me what matters most to you in a room.",
      ],
    },
    {
      id: "howru",
      ex: [
        "how are you",
        "how are you doing",
        "hows it going",
        "are you okay",
        "how is your day",
        "how have you been",
      ],
      say: [
        "I'm doing great, thanks for asking! 😊 How's the room hunt going?",
        "All good here, just sorting rooms. 🏠 How about you, {name}?",
      ],
    },
    {
      id: "fine",
      ex: ["im fine", "im good", "doing well", "not bad", "great thanks", "doing great", "all good"],
      say: ["Glad to hear it! Want me to show your top matches?"],
      pend: { act: "show" },
    },
    {
      id: "thanks",
      ex: ["thank you", "thanks", "thank you so much", "thanks a lot", "ty", "appreciate it"],
      say: ["You're welcome! 😊", "Anytime, {name}!", "No problem at all! Anything else you want in a room?"],
    },
    {
      id: "bye",
      ex: ["bye", "goodbye", "see you", "see you later", "good night", "gotta go", "talk later"],
      say: [
        "Bye {name}! Good luck with the room hunt. 🏠",
        "See you! Your preferences are saved, so I'll remember them.",
      ],
    },
    {
      id: "who",
      ex: [
        "who are you",
        "what are you",
        "are you a bot",
        "are you human",
        "are you real",
        "whats your name",
        "are you ai",
        "are you chatgpt",
        "introduce yourself",
      ],
      say: [
        "I'm Namo, DormNamo's room helper. 🤖 I run right in your browser, so I'm not a person and not an online AI, but I can chat, explain why a room fits you, and compare places.",
      ],
    },
    {
      id: "maker",
      ex: ["who made you", "who created you", "who built you", "who is your creator"],
      say: ["I was made by Team Gwapo for CCC100 as part of DormNamo. 🛠️"],
    },
    {
      id: "help",
      ex: [
        "help",
        "what can you do",
        "how do i use you",
        "what should i say",
        "commands",
        "what do you do",
        "how does this work",
      ],
      act: "help",
    },
    {
      id: "how_match",
      ex: [
        "how does matching work",
        "what does match mean",
        "why is the score low",
        "how do you rank rooms",
        "what is the percent",
        "how are matches computed",
        "why this recommendation",
        "explain the match score",
      ],
      say: [
        "Each room gets a match % from your preferences. Details that are confirmed true add points, a “must have” that is false hides the room, and unknown details are labeled unverified instead of guessed. As you like and pass rooms in Discover, a small learning model adjusts the ranking to your taste.",
      ],
    },
    {
      id: "unverified",
      ex: [
        "why no price",
        "why rate on request",
        "what does unverified mean",
        "why is rent missing",
        "why no amenities",
        "is the info accurate",
        "where is the data from",
      ],
      say: [
        "The listings are real places from Google Maps. Most owners don't publish rent or amenities online, so I show “Rate on request” or “unverified” instead of guessing. Call or visit the owner to confirm.",
      ],
    },
    {
      id: "contact",
      ex: [
        "how do i contact the owner",
        "how to reserve",
        "how to book a room",
        "can i call the landlord",
        "owner number",
        "how do i inquire",
        "how to rent a room",
        "how do i get the room",
      ],
      say: [
        "Open a listing (tap any match card) to see the owner's phone number and a Google Maps link. Since many owners don't post rent, call or visit to confirm price and availability. In Discover, tap 💬 to save a room as an inquiry.",
      ],
    },
    {
      id: "visit_tips",
      ex: [
        "what should i ask the landlord",
        "tips for visiting",
        "what to check when visiting a boarding house",
        "checklist",
        "advice for renting",
        "what to look for in a room",
        "first time renting",
      ],
      say: [
        "Good things to check on a visit:<ul><li>Exact monthly rent, deposit and advance</li><li>Are water and electricity included or sub-metered?</li><li>Curfew and visitor rules</li><li>Water pressure, Wi-Fi signal, locks and the CR</li><li>How many per room, and who the other tenants are</li></ul>",
      ],
    },
    {
      id: "safety",
      ex: [
        "is it safe",
        "how do i avoid scams",
        "is this legit",
        "can i trust the listing",
        "fake listing",
        "scam",
        "is dormnamo legit",
      ],
      say: [
        "Never send a deposit before visiting and meeting the owner in person. Check that the place matches its Google Maps photos, ask current tenants, and get a receipt for any payment. On DormNamo, a Verified badge only appears after the details are confirmed with the owner.",
      ],
    },
    {
      id: "sad",
      ex: [
        "im stressed",
        "im tired",
        "i feel sad",
        "im homesick",
        "im lonely",
        "so hard to find a room",
        "im stressed finding a room",
        "tired of looking for a room",
        "im worried",
        "im anxious",
        "i give up",
        "im overwhelmed",
        "this is frustrating",
      ],
      say: [
        "That sounds rough, {name}. 💙 Room hunting is stressful, especially far from home. Let's make it smaller: tell me the one thing that matters most (price, distance or safety) and I'll start there.",
        "I hear you. Take a breath, we'll find something. 🫶 Want me to show your best matches so far?",
      ],
      pend: { act: "show" },
    },
    {
      id: "happy",
      ex: ["im happy", "yay", "i found a room", "im excited", "i got a place", "finally found one"],
      say: ["Yay! 🎉 That's great news, {name}!", "Love that energy! 😄 Anything else I can help with?"],
    },
    {
      id: "praise",
      ex: [
        "youre smart",
        "good job",
        "you are helpful",
        "great bot",
        "nice one",
        "awesome",
        "love you",
        "youre the best",
        "very helpful",
      ],
      say: [
        "Aww, thank you! 🥰",
        "That made my day. 😊 Anything else?",
        "Thanks, {name}! I'm still learning, so that means a lot.",
      ],
    },
    {
      id: "complaint",
      ex: [
        "the landlord was rude",
        "the owner was rude",
        "the guard was rude",
        "the man at the gate was rude",
        "the caretaker was mean",
        "i had a bad experience",
        "they were rude to me",
        "the staff was unfriendly",
        "they ignored me when i visited",
      ],
      say: [
        "Sorry that happened, {name}. 😕 If it was at one of the listings, leave a comment on it so other students know what to expect. Want me to show you other places?",
      ],
      pend: { act: "show" },
    },
    {
      id: "insult",
      ex: [
        "youre stupid",
        "you are useless",
        "dumb bot",
        "you dont understand",
        "this is not working",
        "you are wrong",
        "that is wrong",
        "bad bot",
      ],
      say: [
        "Sorry about that, {name}. 🙏 I'm still learning. Short phrases like “cheaper”, “must have wifi” or “near campus” work best, and you can always say <b>undo</b>.",
      ],
    },
    {
      id: "joke",
      ex: ["tell me a joke", "make me laugh", "say something funny", "joke", "im bored", "entertain me"],
      say: [
        "Why did the student bring a ladder to the boarding house? They heard the rent was going up. 🪜",
        "My favorite room type? A <i>bed</i>-space, because I'm always tired of searching. 😴",
        "Landlord: “The room comes with a view.” Me: “Of what?” Landlord: “The neighbor's wall.” 🧱",
        "I told my roommate to stop using my Wi-Fi. Now we have a strong connection. 📶",
      ],
    },
    {
      id: "laugh",
      ex: ["haha", "lol", "hehe", "lmao", "hahaha"],
      say: ["😄", "Glad that landed! Anything else?"],
    },
    {
      id: "yes",
      ex: ["yes", "yeah", "sure", "okay", "ok", "go ahead", "please do", "yes please", "of course"],
      act: "yes",
    },
    {
      id: "no",
      ex: ["no", "nope", "no thanks", "not now", "nah", "never mind", "dont"],
      act: "no",
    },
    {
      id: "time",
      ex: ["what time is it", "what day is it", "whats the date today", "what is today"],
      say: ["It's {time} on {day}."],
    },
    {
      id: "casual",
      ex: ["bro", "breh", "yo bro", "hey man", "yo dude", "whats good", "sup bro", "hey dude", "wassup bro"],
      say: [
        "Hey {name}! 😄 What's up? Room hunting, or just hanging out?",
        "Yo! 🙌 Need help finding a place near campus?",
        "Sup! 😎 Tell me your budget or what you need, and I'll find you something.",
      ],
    },
    {
      id: "intro",
      ex: [
        "im a student",
        "im a freshman",
        "first year student",
        "im new here",
        "im from iligan",
        "i study at msu iit",
        "im an iit student",
        "transferee",
      ],
      say: [
        "Nice to meet you, {name}! 🎓 Tell me your budget and how far you're okay walking, and I'll find a good fit.",
        "Welcome! 🏠 First things first: about how much can you pay a month, and do you have online classes?",
      ],
    },
    {
      id: "me",
      ex: ["what is my name", "who am i", "do you know me", "do you remember me", "say my name"],
      say: ["You're {name}! I also remember your room preferences on this device."],
    },
    {
      id: "prefs",
      ex: [
        "what are my preferences",
        "show my settings",
        "what did i set",
        "my filters",
        "what do you know about me",
        "summary of my preferences",
        "show my preferences",
      ],
      act: "prefs",
    },
    {
      id: "liked",
      ex: [
        "show my liked rooms",
        "my favorites",
        "what did i like",
        "my bookmarks",
        "saved rooms",
        "rooms i liked",
      ],
      act: "liked",
    },
    {
      id: "show",
      ex: [
        "show me rooms",
        "recommend a room",
        "find me a place",
        "what rooms are available",
        "any suggestions",
        "show matches",
        "best room for me",
        "where should i stay",
        "find a room",
        "give me options",
        "what do you recommend",
      ],
      act: "show",
    },
    {
      id: "more",
      ex: ["more", "show more", "other options", "next", "anything else", "more rooms", "show others"],
      act: "more",
    },
    {
      id: "discover",
      ex: [
        "how does discover work",
        "how do i swipe",
        "what is discover",
        "what is the for you page",
        "how to like a room",
      ],
      say: [
        "In Discover, swipe right (or press →) to like a room, left (←) to pass, ↑ for details and Z to undo. Every like and pass teaches your ranking what you prefer.",
      ],
    },
    {
      id: "owner",
      ex: [
        "how do i list my boarding house",
        "i am an owner",
        "add my property",
        "advertise my place",
        "i own a dorm",
        "list my place",
      ],
      say: [
        'Owners can list for free! Go to <a href="index.html#owners">List your place</a> on the Rooms page. Featured listings and subscriptions give more visibility.',
      ],
    },
    {
      id: "love",
      ex: [
        "do you love me",
        "are you single",
        "will you marry me",
        "date me",
        "do you have a crush",
        "i love you namo",
      ],
      say: [
        "Haha, my heart belongs to well-ventilated rooms with 24/7 water. 💘 But I'll help you find yours!",
      ],
    },
    {
      id: "food",
      ex: ["im hungry", "where to eat", "food near campus", "where can i buy food"],
      say: [
        "I only know rooms for now 🍚, but a room with a kitchen helps with food costs. Want me to prefer rooms with a kitchen?",
      ],
      pend: { text: "prefer kitchen" },
    },
    {
      id: "weather",
      ex: ["whats the weather", "is it raining", "will it rain", "is it hot today"],
      say: [
        "I can't check the weather, sorry! ☔ Iligan gets plenty of rain though, so a place close to campus saves you wet walks. Want closer rooms?",
      ],
      pend: { text: "closer" },
    },
  ];
  var THRESH = 0.55,
    NEAR = 0.34;

  // ---- features
  function tok(s) {
    return s
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9\- ]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }
  function canon(w) {
    return CMAP[w] || CMAP[w.replace(/s$/, "")] || CMAP[w.replace(/(ing|ed)$/, "")] || CMAP[fix(w)] || w;
  }

  // typo repair against Namo's known words ("mornin" -> morning, "thnks" -> thanks)
  var KNOWN = {},
    BY_LEN = {};
  function know(w) {
    if (!KNOWN[w]) {
      KNOWN[w] = 1;
      (BY_LEN[w.length] = BY_LEN[w.length] || []).push(w);
    }
  }
  Object.keys(CMAP).forEach(know);
  function lev(a, b, max) {
    var prev = [],
      cur,
      i,
      j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var low = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < low) low = cur[j];
      }
      if (low > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  var FIXED = {}; // memo: each unknown word is repaired once
  function fix(w) {
    if (KNOWN[w] || w.length < 4 || /\d/.test(w)) return w;
    if (FIXED[w]) return FIXED[w];
    return (FIXED[w] = fix_(w));
  }
  function fix_(w) {
    var max = w.length < 7 ? 1 : 2,
      best = w,
      bd = max + 1;
    for (var L = w.length - max; L <= w.length + max; L++)
      (BY_LEN[L] || []).forEach(function (c) {
        var d = lev(w, c, max);
        if (d < bd) {
          bd = d;
          best = c;
        }
      });
    return best;
  }
  /** Number of meaningful words (fillers like "the", "is", "please" don't count). */
  function words(text) {
    return tok(text)
      .filter(function (w) {
        return !IGNORE.test(w);
      })
      .map(canon);
  }
  // harmless extras that don't change what a short message means ("bye FOR NOW", "im fine AS WELL", "thanks MAN")
  var FILLER =
    /^(as|well|too|also|now|then|again|though|anyway|btw|man|bro|buddy|lot|lots|so|for|all|at|there|here|today)$/;
  function feats(text) {
    var f = {},
      ws = tok(text).map(canon),
      kept = ws.filter(function (w) {
        return !IGNORE.test(w);
      });
    if (!kept.length) kept = ws; // "you?" still needs something
    function add(k, v) {
      f[k] = (f[k] || 0) + v;
    }
    kept.forEach(function (w, i) {
      add("w:" + w, 1);
      if (i) add("b:" + kept[i - 1] + "_" + w, 0.7);
      var g = "#" + w + "#";
      if (w.length > 2) for (var j = 0; j < g.length - 2; j++) add("c:" + g.substr(j, 3), 0.25);
    });
    return f;
  }

  // ---- index: IDF over all examples
  INTENTS.forEach(function (it) {
    it.ex.forEach(function (e) {
      tok(e).forEach(know);
    });
  });
  var DOCS = [],
    DF = {},
    IDF = {};
  INTENTS.forEach(function (it) {
    it.ex.forEach(function (e) {
      var f = feats(e);
      DOCS.push({ it: it, ex: e, f: f, ws: words(e) });
      Object.keys(f).forEach(function (k) {
        DF[k] = (DF[k] || 0) + 1;
      });
    });
  });
  Object.keys(DF).forEach(function (k) {
    IDF[k] = Math.log(1 + DOCS.length / DF[k]);
  });
  function weigh(f) {
    var v = {},
      n = 0;
    Object.keys(f).forEach(function (k) {
      var x = f[k] * (IDF[k] || Math.log(1 + DOCS.length));
      v[k] = x;
      n += x * x;
    });
    v._n = Math.sqrt(n) || 1;
    return v;
  }
  // inverted index: feature -> [[doc, weight]], so a message only touches examples it shares a feature with
  var POST = {};
  DOCS.forEach(function (d, i) {
    d.v = weigh(d.f);
    Object.keys(d.v).forEach(function (k) {
      if (k !== "_n") (POST[k] = POST[k] || []).push([i, d.v[k]]);
    });
  });
  /** Best intent for a message: {it, score, ex} (it may be null). */
  function classify(text) {
    var q = weigh(feats(text)),
      dot = {},
      best = { it: null, score: 0, ex: "" };
    Object.keys(q).forEach(function (k) {
      var p = POST[k];
      if (k === "_n" || !p) return;
      for (var j = 0; j < p.length; j++) dot[p[j][0]] = (dot[p[j][0]] || 0) + q[k] * p[j][1];
    });
    var qw = words(text);
    Object.keys(dot).forEach(function (i) {
      var d = DOCS[i],
        s = dot[i] / (q._n * d.v._n);
      // containment: the message says everything the example says, plus at most two extra words
      // ("im fine AS WELL", "bye FOR NOW"). Cosine alone punishes those harmless extras; a long sentence
      // that only happens to share a word ("the fine print about rent") still gets plain cosine.
      // A one-word example ("lol", "bye", "no") only stretches over filler, so "my roommate snores lol"
      // is still about the room, not a laugh.
      var extra = qw.filter(function (w) {
        return d.ws.indexOf(w) < 0;
      });
      var ok =
        extra.length <= 2 &&
        (d.ws.length >= 2 ||
          extra.every(function (w) {
            return FILLER.test(w);
          }));
      if (ok && s >= 0.3) s = Math.max(s, 0.88 * Math.min(1, dot[i] / (d.v._n * d.v._n)));
      if (s > best.score) best = { it: d.it, score: s, ex: d.ex };
    });
    return best;
  }

  // ---- reply templates
  var turn = 0;
  function pick(arr) {
    return arr[turn++ % arr.length];
  }
  function fill(s, name) {
    var d = new Date(),
      h = d.getHours();
    return s
      .replace(/\{name\}/g, name)
      .replace(/\{greet\}/g, h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening")
      .replace(/\{time\}/g, d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }))
      .replace(/\{day\}/g, d.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" }));
  }

  /**
   * Understand a message as conversation.
   * Returns {id, score, html?, act?, pend?, guess?}:
   *   act  = something chat.js must do (show, more, prefs, liked, help, yes, no)
   *   pend = what "yes" should do next ({act} or {text} to re-read)
   *   guess = a near-miss example to offer as "Did you mean …?"
   */
  function understand(text, name) {
    var b = classify(text);
    if (!b.it || b.score < NEAR) return null;
    if (b.score < THRESH) return { id: null, score: b.score, guess: b.ex, pend: { intent: b.it.id } };
    return run(b.it.id, name, b.score);
  }
  function run(id, name, score) {
    var it = INTENTS.filter(function (x) {
      return x.id === id;
    })[0];
    if (!it) return null;
    return {
      id: it.id,
      score: score || 1,
      act: it.act,
      pend: it.pend,
      html: it.say ? fill(pick(it.say), name) : null,
    };
  }
  var GREET_RX = /^\s*(hi+|hello+|hey+|heya|yo|howdy|good (morning|afternoon|evening))\b[\s,!.]*/i;

  return {
    understand: understand,
    run: run,
    classify: classify,
    greeting: function (t) {
      return GREET_RX.test(t);
    },
    INTENTS: INTENTS,
    CANON: CANON,
  };
})();
