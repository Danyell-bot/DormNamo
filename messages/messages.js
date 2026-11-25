/* ==========================================================
   messages.js - Messages page (messages/), data from inbox.js
   Left: conversations (Direct with landowners/students, and tenant
   Groups). Right: the open chat.
   Direct chat about a place: the place card, the deal steps
   (Interested -> Negotiating -> Agreed), offers with Accept / Decline.
   An accepted offer adds the student to the place's tenant group chat.
   #t=<id> opens a conversation.
   ========================================================== */
var Messages = (function () {
  var cur = null, // open conversation id
    filter = "all",
    offerOpen = false,
    membersOpen = false,
    pending = [], // photos picked for the next message (small JPEG data URLs)
    emojiOpen = false,
    EMOJIS =
      "😀 😄 😂 🥰 😍 😊 😉 🙂 😅 🤔 😮 😢 😭 😡 🙏 👍 👎 👋 👏 🙌 💪 🎉 ❤️ 💙 💛 🔥 ✨ ✅ ❌ ⭐ 🏠 🛏️ 🚿 🍳 📶 💧 ⚡ 🔑 📍 🚶 📅 💸 📸 📞 🎓 📚".split(
        " ",
      );

  function $(id) {
    return document.getElementById(id);
  }
  function hm(t) {
    return new Date(t).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  }
  function when(t) {
    var d = new Date(t),
      now = new Date();
    if (d.toDateString() === now.toDateString()) return hm(t);
    var y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  }
  function day(t) {
    var d = new Date(t),
      now = new Date();
    if (d.toDateString() === now.toDateString()) return "Today";
    return d.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
  }
  function php(n) {
    return "₱" + Number(n).toLocaleString("en-PH");
  }
  function me() {
    return window.USER && USER.id !== "guest" ? USER.id : null;
  }

  /* ---------- conversation list ---------- */
  function preview(x) {
    var m = x.last;
    if (!m) return "No messages yet";
    var who =
      m.from === me()
        ? "You: "
        : x.t.type === "group" && m.from
          ? Inbox.nameOf(m.from).split(" ")[0] + ": "
          : "";
    if (m.kind === "interest") return who + "Interested in " + (m.data.name || "a place");
    if (m.kind === "offer") return who + "Offer: " + php(m.data.rent) + " a month";
    var n = m.data && m.data.imgs ? m.data.imgs.length : 0;
    return who + (m.text || (n > 1 ? n + " photos" : n ? "Photo" : ""));
  }
  function listHTML() {
    var all = Inbox.threads(),
      shown = all.filter(function (x) {
        return filter === "all" || (filter === "dm" ? x.t.type === "dm" : x.t.type === "group");
      }),
      count = function (k) {
        return all.filter(function (x) {
          return k === "all" || x.t.type === k;
        }).length;
      };
    var tabs = [
      ["all", "All"],
      ["dm", "Direct"],
      ["group", "Groups"],
    ]
      .map(function (t) {
        return (
          '<button type="button" role="tab" data-f="' +
          t[0] +
          '" aria-selected="' +
          (filter === t[0]) +
          '">' +
          t[1] +
          " <span>" +
          count(t[0]) +
          "</span></button>"
        );
      })
      .join("");
    var rows = shown
      .map(function (x) {
        var t = x.t,
          h = Inbox.house(t.listing),
          o = Inbox.other(t),
          sub =
            t.type === "group"
              ? t.members.length + " members · tenant group"
              : h
                ? (Inbox.roleIn(t, me()) === "owner" ? "Interested in your " : "About ") + h.n
                : "Direct message";
        return (
          '<button type="button" class="mx-item' +
          (t.id === cur ? " on" : "") +
          (x.unread ? " new" : "") +
          '" data-t="' +
          t.id +
          '"' +
          (t.id === cur ? ' aria-current="true"' : "") +
          ">" +
          (t.type === "group"
            ? '<span class="av mx-gav" aria-hidden="true">' + ico("users") + "</span>"
            : avatarHTML(o, Inbox.nameOf(o))) +
          '<span class="mx-it"><span class="mx-it-h"><b>' +
          esc(Inbox.title(t)) +
          "</b><small>" +
          (x.last ? when(x.last.at) : "") +
          '</small></span><small class="mx-sub">' +
          esc(sub) +
          (t.status ? ' · <i class="mx-st ' + t.status + '">' + Inbox.STATUS[t.status] + "</i>" : "") +
          '</small><span class="mx-prev">' +
          esc(preview(x)) +
          "</span></span>" +
          (x.unread
            ? '<span class="mx-dot" aria-label="' + x.unread + ' unread">' + x.unread + "</span>"
            : "") +
          "</button>"
        );
      })
      .join("");
    return (
      '<div class="mx-side-h"><h1>Messages</h1><div class="mx-tabs" role="tablist" aria-label="Show">' +
      tabs +
      "</div></div>" +
      '<div class="mx-list">' +
      (rows ||
        '<div class="mx-none">' +
          ico("chat") +
          "<p>" +
          (filter === "group"
            ? "No tenant groups yet. When a landowner and a student agree a deal, the student joins that place's group chat."
            : "No conversations yet. Open a place listed by its landowner and tap <b>I'm interested · Message</b>.") +
          '</p><a class="btn sm" href="' +
          pageUrl("home", "finder") +
          '">Browse rooms</a></div>') +
      "</div>" +
      (me() && window.TestBot
        ? '<div class="mx-bot">' +
          (TestBot.exists()
            ? "<span>" +
              ico("bot") +
              "The test bot is on.</span>" +
              '<button type="button" class="linkbtn" id="mxBotOff">Remove test bot</button>'
            : '<button type="button" class="btn alt sm" id="mxBotOn">' +
              ico("bot") +
              'Try it with a test bot</button><small class="meta">A pretend landowner that answers by itself, so you can test chats, photos, emojis and offers.</small>') +
          "</div>"
        : "")
    );
  }

  /* ---------- one conversation ---------- */
  function placeCard(t) {
    var h = Inbox.house(t.listing);
    if (!h) return "";
    var ph = Photos.forHouse(h).list[0],
      steps = ["inquiry", "negotiating", "agreed"],
      at = t.status === "declined" ? -1 : steps.indexOf(t.status);
    return (
      '<div class="mx-place"><button type="button" class="mx-place-b" data-open="' +
      h.id +
      '"><img src="' +
      esc(ph.thumb || ph.src) +
      '" alt=""><span><b>' +
      esc(h.n) +
      "</b><small>" +
      (h.p == null ? "Rate on request" : php(h.p) + " / mo listed") +
      " · " +
      esc(refShort(h)) +
      "</small></span></button>" +
      (t.type === "dm"
        ? '<ol class="mx-steps' +
          (t.status === "declined" ? " closed" : "") +
          '" aria-label="Deal progress">' +
          ["Interested", "Negotiating", "Agreed · tenant group"]
            .map(function (s, i) {
              return '<li class="' + (i < at ? "done" : i === at ? "on" : "") + '">' + s + "</li>";
            })
            .join("") +
          "</ol>" +
          (t.status === "declined" ? '<small class="meta">The landowner closed this inquiry.</small>' : "")
        : "") +
      "</div>"
    );
  }
  function msgHTML(t, m) {
    var mine = m.from === me(),
      group = t.type === "group";
    if (m.kind === "system") return '<div class="mx-sys">' + esc(m.text) + "</div>";
    var head =
      group && !mine && m.from
        ? '<span class="mx-from">' +
          esc(Inbox.nameOf(m.from)) +
          (Inbox.roleIn(t, m.from) === "owner" ? ' <i class="role-b role-owner">Landowner</i>' : "") +
          "</span>"
        : "";
    var body;
    if (m.kind === "interest") {
      body =
        '<div class="mx-card mx-int"><span class="mx-card-k">' +
        ico("heart") +
        "Interested in this place</span><b>" +
        esc(m.data.name || "") +
        "</b>" +
        (m.data.ref
          ? "<small>Ref. no. DN-" + esc(String(m.data.ref).slice(0, 8).toUpperCase()) + "</small>"
          : "") +
        (m.text ? "<p>" + esc(m.text) + "</p>" : "") +
        "</div>";
    } else if (m.kind === "offer") {
      var st = m.data.state,
        canAnswer = st === "open" && !mine;
      body =
        '<div class="mx-card mx-offer ' +
        st +
        '"><span class="mx-card-k">' +
        ico("wallet") +
        (mine ? "Your offer" : "Offer") +
        '</span><b class="mx-rent">' +
        php(m.data.rent) +
        "<small> / month</small></b>" +
        (m.data.move
          ? "<small>Move in: " +
            esc(
              new Date(m.data.move + "T00:00").toLocaleDateString("en-PH", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
            ) +
            "</small>"
          : "") +
        (m.text ? "<p>" + esc(m.text) + "</p>" : "") +
        (canAnswer
          ? '<div class="mx-ans"><button type="button" class="btn sm" data-yes="' +
            m.id +
            '">Accept</button><button type="button" class="btn alt sm" data-no="' +
            m.id +
            '">Decline</button><button type="button" class="linkbtn" data-counter="1">Counter-offer</button></div>'
          : '<span class="mx-state">' +
            {
              open: "Waiting for an answer",
              accepted: "Accepted ✓",
              declined: "Declined",
              replaced: "Replaced by a newer offer",
            }[st] +
            "</span>") +
        "</div>";
    } else {
      var imgs = (m.data && m.data.imgs) || [],
        big =
          !imgs.length &&
          /^[\s\p{Extended_Pictographic}\u200d\ufe0f\u{1F3FB}-\u{1F3FF}]{1,12}$/u.test(m.text || "");
      body =
        (imgs.length
          ? '<div class="mx-imgs n' +
            imgs.length +
            '">' +
            imgs
              .map(function (src, i) {
                return (
                  '<button type="button" class="mx-img" data-view="' +
                  m.id +
                  '" data-i="' +
                  i +
                  '" aria-label="Open photo ' +
                  (i + 1) +
                  '"><img src="' +
                  esc(src) +
                  '" alt="Photo ' +
                  (i + 1) +
                  '"></button>'
                );
              })
              .join("") +
            "</div>"
          : "") +
        (m.text
          ? '<div class="mx-bub' +
            (big ? " mx-big" : "") +
            '">' +
            esc(m.text).replace(/\n/g, "<br>") +
            "</div>"
          : "");
    }
    return (
      '<div class="mx-msg' +
      (mine ? " me" : "") +
      '">' +
      (!mine && group ? avatarHTML(m.from, Inbox.nameOf(m.from), "sm") : "") +
      '<div class="mx-col">' +
      head +
      body +
      '<small class="mx-at">' +
      hm(m.at) +
      "</small></div></div>"
    );
  }
  function membersHTML(t) {
    var owner = Inbox.roleIn(t, me()) === "owner";
    return (
      '<div class="mx-members"><b>Members (' +
      t.members.length +
      ")</b>" +
      t.members
        .map(function (uid) {
          var r = Inbox.roleIn(t, uid);
          return (
            '<div class="mx-mem">' +
            avatarHTML(uid, Inbox.nameOf(uid), "sm") +
            "<span>" +
            esc(Inbox.nameOf(uid)) +
            (uid === me() ? " (you)" : "") +
            "</span>" +
            '<i class="role-b ' +
            (r === "owner" ? "role-owner" : "role-tenant") +
            '">' +
            (r === "owner" ? "Landowner" : "Tenant") +
            "</i>" +
            (owner && r !== "owner"
              ? '<button type="button" class="linkbtn" data-kick="' + esc(uid) + '">Remove</button>'
              : "") +
            "</div>"
          );
        })
        .join("") +
      (owner ? "" : '<button type="button" class="linkbtn mx-leave" data-leave="1">Leave group</button>') +
      "</div>"
    );
  }
  function offerFormHTML(t) {
    var h = Inbox.house(t.listing),
      last = Inbox.messages(t.id)
        .filter(function (m) {
          return m.kind === "offer";
        })
        .pop(),
      rent = last ? last.data.rent : h && h.p ? h.p : "";
    return (
      '<form class="mx-offer-f" id="mxOfferF"><b>' +
      (last ? "Counter-offer" : "Make an offer") +
      '</b><div class="mx-of-row"><label>Rent a month (₱)<input id="mxRent" type="number" step="any" inputmode="decimal" required value="' +
      esc(rent) +
      '"></label><label>Move-in date<input id="mxMove" type="date"></label></div>' +
      '<label>Note <small class="meta">(optional)</small><input id="mxNote" maxlength="300" placeholder="e.g. Includes water and Wi-Fi, 1 month advance + 1 month deposit"></label>' +
      '<div class="mx-of-acts"><button class="btn sm" type="submit">Send offer</button><button class="btn alt sm" type="button" id="mxOfferX">Cancel</button></div></form>'
    );
  }
  function chatHTML() {
    var t = cur && Inbox.get(cur);
    if (!t || t.members.indexOf(me()) < 0)
      return (
        '<div class="mx-empty">' +
        ico("chat") +
        "<h2>" +
        (me() ? "Pick a conversation" : "Messages need an account") +
        "</h2><p>" +
        (me()
          ? "Talk face to face with landowners about a place, negotiate the rent, and chat with your fellow tenants once you agree."
          : "Guests can't receive replies. Create a free account to message landowners and join tenant groups.") +
        "</p></div>"
      );
    var ms = Inbox.messages(t.id),
      o = Inbox.other(t),
      p = o ? Accounts.person(o) : null,
      isOwner = Inbox.roleIn(t, me()) === "owner",
      canOffer = t.type === "dm" && t.listing != null && t.status !== "agreed" && t.status !== "declined",
      lastDay = "",
      body = ms
        .map(function (m) {
          var d = day(m.at),
            sep = d !== lastDay ? '<div class="mx-day"><span>' + d + "</span></div>" : "";
          lastDay = d;
          return sep + msgHTML(t, m);
        })
        .join("");
    var sub =
      t.type === "group"
        ? t.members.length + " members · landowner and tenants"
        : p
          ? Accounts.describe(p)
          : "Account not on this device";
    return (
      '<header class="mx-h"><button type="button" class="mx-back" id="mxBack" aria-label="Back to conversations">' +
      ico("back") +
      "</button>" +
      (t.type === "group"
        ? '<span class="av mx-gav" aria-hidden="true">' + ico("users") + "</span>"
        : avatarHTML(o, Inbox.nameOf(o))) +
      '<div class="mx-h-t"><b>' +
      esc(Inbox.title(t)) +
      "</b><small>" +
      esc(sub) +
      "</small></div>" +
      '<div class="mx-h-acts">' +
      (canOffer
        ? '<button type="button" class="btn sm" id="mxOffer">' + ico("wallet") + "Make an offer</button>"
        : "") +
      (t.type === "dm" && isOwner && canOffer
        ? '<button type="button" class="btn alt sm" id="mxClose">Close inquiry</button>'
        : "") +
      (t.type === "group"
        ? '<button type="button" class="btn alt sm" id="mxMembers" aria-expanded="' +
          membersOpen +
          '">' +
          ico("users") +
          "Members</button>"
        : "") +
      (o ? '<a class="btn alt sm" href="' + pageUrl("people", "u=" + esc(o)) + '">Profile</a>' : "") +
      "</div></header>" +
      (t.type === "group" && membersOpen ? membersHTML(t) : "") +
      '<div class="mx-log" id="mxLog" aria-live="polite">' +
      placeCard(t) +
      (body || '<div class="mx-sys">Say hello</div>') +
      "</div>" +
      (offerOpen && canOffer ? offerFormHTML(t) : "") +
      (pending.length
        ? '<div class="mx-pend" aria-label="Photos to send">' +
          pending
            .map(function (src, i) {
              return (
                '<span class="mx-pimg"><img src="' +
                esc(src) +
                '" alt=""><button type="button" data-unpick="' +
                i +
                '" aria-label="Remove photo ' +
                (i + 1) +
                '">' +
                ico("x") +
                "</button></span>"
              );
            })
            .join("") +
          '<small class="meta">' +
          pending.length +
          " / " +
          Inbox.MAX_IMGS +
          " photos</small></div>"
        : "") +
      (emojiOpen
        ? '<div class="mx-emojis" aria-label="Emoji">' +
          EMOJIS.map(function (e) {
            return '<button type="button" data-emoji="' + e + '" aria-label="' + e + '">' + e + "</button>";
          }).join("") +
          "</div>"
        : "") +
      '<form class="mx-comp" id="mxComp">' +
      '<button type="button" class="mx-tool" id="mxEmoji" aria-label="Emoji" aria-expanded="' +
      emojiOpen +
      '">' +
      ico("smile") +
      "</button>" +
      '<button type="button" class="mx-tool" id="mxPhoto" aria-label="Add photos">' +
      ico("image") +
      "</button>" +
      '<input type="file" id="mxFile" accept="image/*" multiple hidden>' +
      '<textarea id="mxIn" rows="1" maxlength="2000" placeholder="Write a message…" aria-label="Message"></textarea><button class="btn c-send" type="submit" aria-label="Send">' +
      ico("send") +
      "</button></form>"
    );
  }

  /* ---------- render ---------- */
  function render(keepScroll) {
    var log = $("mxLog"),
      atBottom = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 80,
      draft = $("mxIn") ? $("mxIn").value : "",
      focused = document.activeElement && document.activeElement.id === "mxIn",
      offerVals = ["mxRent", "mxMove", "mxNote"].map(function (id) {
        return $(id) ? $(id).value : null;
      });
    if (cur) Inbox.markReadQuiet(cur);
    $("mxSide").innerHTML = listHTML();
    $("mxChat").innerHTML = chatHTML();
    document.querySelector(".mx-grid").classList.toggle("open", !!(cur && Inbox.get(cur)));
    var nl = $("mxLog"),
      stick = !keepScroll || atBottom;
    if (nl) {
      nl.scrollTop = stick ? nl.scrollHeight : log.scrollTop;
      // photos get their height only once loaded: stay at the newest message while they do
      nl.querySelectorAll("img").forEach(function (img) {
        if (!img.complete)
          img.addEventListener("load", function () {
            if (stick) nl.scrollTop = nl.scrollHeight;
          });
      });
    }
    var inp = $("mxIn");
    if (inp) {
      inp.value = draft;
      grow(inp);
      if (focused) inp.focus();
    }
    ["mxRent", "mxMove", "mxNote"].forEach(function (id, i) {
      if ($(id) && offerVals[i] != null) $(id).value = offerVals[i];
    });
    if (window.Nav) Nav.unread();
  }
  function grow(t) {
    t.style.height = "auto";
    t.style.height = Math.min(140, t.scrollHeight) + "px";
  }
  function select(id) {
    cur = id;
    offerOpen = false;
    membersOpen = false;
    pending = [];
    emojiOpen = false;
    if (id && location.hash !== "#t=" + id) history.replaceState(null, "", "#t=" + id);
    if (!id) history.replaceState(null, "", location.pathname);
    render();
    var inp = $("mxIn");
    if (inp && window.innerWidth > 760) inp.focus();
  }
  function route() {
    var m = location.hash.match(/^#t=(.+)$/);
    select(m ? decodeURIComponent(m[1]) : null);
  }

  /* ---------- photos ---------- */
  function pick(files) {
    var list = Array.prototype.filter.call(files || [], function (f) {
      return /^image\//.test(f.type);
    });
    var room = Inbox.MAX_IMGS - pending.length;
    if (!list.length) return;
    if (list.length > room) toast("Up to " + Inbox.MAX_IMGS + " photos in one message.");
    list.slice(0, room).forEach(function (file) {
      // shrunk in the browser (about 100 KB each), because chats live in this browser's storage
      Listings.shrink(file, 900, 0.72, function (err, url) {
        if (err)
          return toast(
            err === "big" ? "That photo is over 25 MB." : "Couldn't read that photo. Try a JPG or PNG.",
          );
        if (pending.length < Inbox.MAX_IMGS) pending.push(url);
        render(true);
      });
    });
  }
  /** Full-size photo viewer: its own small dialog. */
  function view(msgId, i) {
    var m = Inbox.messages(cur).filter(function (x) {
        return x.id === msgId;
      })[0],
      imgs = (m && m.data && m.data.imgs) || [];
    if (!imgs[i]) return;
    var v = document.createElement("dialog");
    v.className = "rp-view";
    v.setAttribute("aria-label", "Photo");
    v.innerHTML =
      '<button type="button" class="rp-x" aria-label="Close photo">' +
      ico("x") +
      '</button><figure><img alt=""><figcaption></figcaption></figure>' +
      (imgs.length > 1
        ? '<button type="button" class="dlg-nav dlg-prev" aria-label="Previous photo">‹</button><button type="button" class="dlg-nav dlg-next" aria-label="Next photo">›</button>'
        : "");
    document.body.appendChild(v);
    function show(k) {
      i = (k + imgs.length) % imgs.length;
      v.querySelector("img").src = imgs[i];
      v.querySelector("figcaption").textContent =
        "Photo " + (i + 1) + " of " + imgs.length + " · from " + Inbox.nameOf(m.from) + " · " + when(m.at);
    }
    v.onclick = function (e) {
      if (e.target.closest(".rp-x") || e.target === v) v.close();
      else if (e.target.closest(".dlg-prev")) show(i - 1);
      else if (e.target.closest(".dlg-next")) show(i + 1);
    };
    v.addEventListener("close", function () {
      v.remove();
    });
    show(i);
    v.showModal();
  }

  /* ---------- events ---------- */
  function wire() {
    var page = document.querySelector(".mx-page");
    page.addEventListener("click", function (e) {
      var f = e.target.closest("[data-f]");
      if (f) {
        filter = f.dataset.f;
        render(true);
        return;
      }
      var it = e.target.closest("[data-t]");
      if (it) return select(it.dataset.t);
      var op = e.target.closest("[data-open]");
      if (op) return open(+op.dataset.open);
      var y = e.target.closest("[data-yes]"),
        n = e.target.closest("[data-no]");
      if (y || n) {
        var r = Inbox.answer((y || n).dataset[y ? "yes" : "no"], !!y);
        if (r && r.group) toast("Deal agreed! The tenant joined the " + Inbox.title(r.group) + " group.");
        render();
        return;
      }
      if (e.target.closest("[data-counter]")) {
        offerOpen = true;
        render();
        $("mxRent").focus();
        return;
      }
      var k = e.target.closest("[data-kick]");
      if (k) {
        Inbox.leave(cur, k.dataset.kick);
        render();
        return;
      }
      if (e.target.closest("[data-leave]")) {
        Inbox.leave(cur);
        select(null);
        toast("You left the group");
        return;
      }
      var vw = e.target.closest("[data-view]");
      if (vw) return view(vw.dataset.view, +vw.dataset.i);
      var un = e.target.closest("[data-unpick]");
      if (un) {
        pending.splice(+un.dataset.unpick, 1);
        render(true);
        return;
      }
      var em = e.target.closest("[data-emoji]");
      if (em) {
        var inp = $("mxIn"),
          at = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
        inp.value = inp.value.slice(0, at) + em.dataset.emoji + inp.value.slice(inp.selectionEnd || at);
        inp.focus();
        inp.setSelectionRange(at + em.dataset.emoji.length, at + em.dataset.emoji.length);
        return;
      }
      var b = e.target.closest("button");
      if (!b) return;
      if (b.id === "mxEmoji") {
        emojiOpen = !emojiOpen;
        render(true);
      } else if (b.id === "mxPhoto") $("mxFile").click();
      else if (b.id === "mxBotOn") {
        var tid = TestBot.start();
        if (tid) select(tid);
        toast("Test bot added. Say hi, send a photo or an emoji, or make an offer.");
      } else if (b.id === "mxBotOff") {
        TestBot.remove();
        select(null);
        toast("Test bot, its test listing and its chats were removed.");
      } else if (b.id === "mxBack") select(null);
      else if (b.id === "mxOffer") {
        offerOpen = !offerOpen;
        render(true);
        if (offerOpen) $("mxRent").focus();
      } else if (b.id === "mxOfferX") {
        offerOpen = false;
        render(true);
      } else if (b.id === "mxClose") {
        Inbox.close(cur);
        render();
      } else if (b.id === "mxMembers") {
        membersOpen = !membersOpen;
        render(true);
      }
    });
    page.addEventListener("submit", function (e) {
      e.preventDefault();
      if (e.target.id === "mxComp") {
        var inp = $("mxIn"),
          text = inp.value,
          imgs = pending.slice();
        inp.value = ""; // cleared first: sending re-renders the chat (Inbox.on)
        pending = [];
        emojiOpen = false;
        var sent = Inbox.send(cur, text, { imgs: imgs });
        if (sent && !sent.error) render();
        else {
          pending = imgs;
          render(true);
          $("mxIn").value = text;
          if (sent && sent.error === "full")
            toast("This browser's storage is full. Send fewer or smaller photos, or delete old chats.");
        }
        $("mxIn").focus();
      } else if (e.target.id === "mxOfferF") {
        var o = { rent: $("mxRent").value, move: $("mxMove").value, note: $("mxNote").value };
        offerOpen = false;
        var r = Inbox.offer(cur, o);
        if (r && r.error) {
          offerOpen = true;
          return toast("Enter the rent as a number, like 2900.");
        }
        render();
      }
    });
    page.addEventListener("keydown", function (e) {
      // Enter sends, Shift+Enter makes a new line
      if (e.target.id === "mxIn" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        $("mxComp").requestSubmit();
      }
    });
    page.addEventListener("input", function (e) {
      if (e.target.id === "mxIn") grow(e.target);
    });
    page.addEventListener("change", function (e) {
      if (e.target.id === "mxFile") {
        pick(e.target.files);
        e.target.value = "";
      }
    });
    // paste a screenshot or photo straight into the message box
    page.addEventListener("paste", function (e) {
      if (e.target.id !== "mxIn" || !e.clipboardData) return;
      var files = Array.prototype.filter.call(e.clipboardData.files || [], function (f) {
        return /^image\//.test(f.type);
      });
      if (files.length) {
        e.preventDefault();
        pick(files);
      }
    });
    window.addEventListener("hashchange", route);
    // phones: when the keyboard opens the conversation gets shorter (mobile.css); keep the newest message in view
    if (window.visualViewport)
      visualViewport.addEventListener("resize", function () {
        var log = $("mxLog");
        if (log && document.activeElement && document.activeElement.id === "mxIn")
          log.scrollTop = log.scrollHeight;
      });
    Inbox.on(function () {
      render(true); // a message arrived from another tab, or this tab changed something
    });
  }
  function init() {
    wire();
    route();
  }
  return { init: init };
})();
function pageInit() {
  Messages.init();
}
