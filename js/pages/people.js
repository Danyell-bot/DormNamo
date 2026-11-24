/* ==========================================================
   people.js - accounts page (people.html)
   Left: your own account (role badges, the one-line category, what you
   share) with an edit form. Right: every account on DormNamo, sorted into
   Landowners / Students / Everyone, with their places. Landowners can also be
   students looking for a room, so one card can carry both badges.
   #me focuses your account, #u=<id> opens someone's profile.
   ========================================================== */
var People = (function () {
  var tab = "owner",
    q = "",
    editing = false;

  function since(t) {
    if (!t) return "";
    var d = new Date(t);
    return "Member since " + d.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  }
  function badges(p) {
    return (
      (p.bot ? '<i class="role-b role-bot">' + ico("bot") + "Test bot</i>" : "") +
      (p.owner ? '<i class="role-b role-owner">Landowner</i>' : "") +
      (p.student ? '<i class="role-b role-student">' + (p.owner ? "Also renting" : "Student") + "</i>" : "")
    );
  }
  function placeRow(id) {
    var h = Inbox.house(id);
    if (!h) return "";
    var ph = Photos.forHouse(h).list[0];
    return (
      '<button type="button" class="pp-place" data-open="' +
      h.id +
      '"><img src="' +
      esc(ph.thumb || ph.src) +
      '" alt="" loading="lazy"><span><b>' +
      esc(h.n) +
      "</b><small>" +
      (h.p == null ? "Rate on request" : peso(h.p) + " / mo") +
      " · " +
      esc(h.t) +
      " · " +
      esc(refShort(h)) +
      "</small></span></button>"
    );
  }
  function msgBtn(p) {
    if (!window.USER || USER.id === "guest" || USER.id === p.id) return "";
    return (
      '<button type="button" class="btn sm" data-dm="' + esc(p.id) + '">' + ico("chat") + "Message</button>"
    );
  }

  /* ---------- your account ---------- */
  function meHTML() {
    var p = Accounts.me();
    if (!p)
      return (
        '<div class="pp-me pp-card"><span class="eyebrow">Your account</span><h2>' +
        esc((window.USER && USER.name) || "Guest") +
        "</h2>" +
        '<p class="meta">Guests have no profile, so landowners can\'t reply to you. Create a free account to message owners and join tenant groups.</p>' +
        '<button type="button" class="btn" id="ppSignup">Create an account</button></div>'
      );
    var chats = Inbox.threads().length;
    if (editing) return editHTML(p);
    return (
      '<div class="pp-me pp-card" id="me"><span class="eyebrow">Your account</span>' +
      '<div class="pp-head">' +
      avatarHTML(p.id, p.name, "lg") +
      "<div><h2>" +
      esc(p.name) +
      '</h2><div class="pp-badges">' +
      badges(p) +
      "</div></div></div>" +
      '<p class="pp-desc">' +
      esc(Accounts.describe(p)) +
      "</p>" +
      (p.bio
        ? '<p class="pp-bio">' + esc(p.bio) + "</p>"
        : '<p class="pp-bio meta">No description yet. Tell people who you are and what you\'re looking for or offering.</p>') +
      '<dl class="pp-info">' +
      "<div><dt>Email</dt><dd>" +
      esc(p.email) +
      ' <small class="meta">(private)</small></dd></div>' +
      "<div><dt>Phone</dt><dd>" +
      (p.phone
        ? esc(p.phone) +
          (p.showPhone
            ? ' <small class="meta">(on your profile)</small>'
            : ' <small class="meta">(private)</small>')
        : '<span class="meta">Not added</span>') +
      "</dd></div>" +
      "<div><dt>School</dt><dd>" +
      (p.school ? esc(p.school) : '<span class="meta">Not set</span>') +
      "</dd></div>" +
      "<div><dt>Joined</dt><dd>" +
      (esc(since(p.joined).replace("Member since ", "")) || '<span class="meta">Before profiles</span>') +
      "</dd></div></dl>" +
      '<div class="pp-stats"><span><b>' +
      p.places.length +
      "</b> places listed</span><span><b>" +
      chats +
      "</b> conversations</span><span><b>" +
      ((window.S && S.likes && S.likes.length) || 0) +
      "</b> saved</span></div>" +
      '<div class="pp-acts"><button type="button" class="btn sm" id="ppEdit">' +
      ico("edit") +
      'Edit profile</button><a class="btn alt sm" href="mylistings.html">' +
      ico("door") +
      (p.owner ? "My listings" : "List a place") +
      "</a></div></div>"
    );
  }
  function editHTML(p) {
    var lockOwner = p.places.length > 0;
    return (
      '<form class="pp-me pp-card pp-edit" id="ppForm" novalidate><span class="eyebrow">Edit your account</span>' +
      '<label>Name<input id="ppName" maxlength="60" value="' +
      esc(p.name) +
      '" autocomplete="name"></label>' +
      '<fieldset class="pp-roles"><legend>I am</legend>' +
      '<label class="pp-check"><input type="checkbox" id="ppStudent"' +
      (p.setRoles.indexOf("student") >= 0 ? " checked" : "") +
      "><span><b>Looking for a room</b><small>A student or tenant (customer of landowners)</small></span></label>" +
      '<label class="pp-check"><input type="checkbox" id="ppOwner"' +
      (p.owner ? " checked" : "") +
      (lockOwner ? " disabled" : "") +
      "><span><b>A landowner</b><small>" +
      (lockOwner ? "You have places listed, so you're a landowner" : "I own or manage a place") +
      "</small></span></label></fieldset>" +
      '<label><span>About you <small class="meta" id="ppBioN"></small></span><textarea id="ppBio" rows="4" maxlength="280" placeholder="' +
      (p.owner
        ? "e.g. I run a quiet dorm for 12 girls in Tibanga. Water and Wi-Fi included, curfew 10 pm."
        : "e.g. 2nd-year engineering student, looking for a quiet room near campus from June.") +
      '">' +
      esc(p.bio) +
      "</textarea></label>" +
      '<label>School<select id="ppSchool"><option value="">Not set</option>' +
      SCHOOLS.map(function (s) {
        return "<option" + (s === p.school ? " selected" : "") + ">" + esc(s) + "</option>";
      }).join("") +
      "</select></label>" +
      '<label>Phone<input id="ppPhone" inputmode="tel" autocomplete="tel" placeholder="0917 123 4567" value="' +
      esc(p.phone) +
      '"></label>' +
      '<label class="pp-check"><input type="checkbox" id="ppShow"' +
      (p.showPhone ? " checked" : "") +
      "><span><b>Show my phone on my profile</b><small>Off: only you can see it</small></span></label>" +
      '<p class="err" id="ppErr" role="alert"></p>' +
      '<div class="pp-acts"><button class="btn sm" type="submit">Save profile</button><button class="btn alt sm" type="button" id="ppCancel">Cancel</button></div></form>'
    );
  }

  /* ---------- everyone ---------- */
  function cardHTML(p) {
    return (
      '<article class="pp-card pp-person" data-u="' +
      esc(p.id) +
      '"><div class="pp-head">' +
      avatarHTML(p.id, p.name) +
      "<div><h3>" +
      esc(p.name) +
      (window.USER && USER.id === p.id ? ' <small class="meta">(you)</small>' : "") +
      '</h3><div class="pp-badges">' +
      badges(p) +
      "</div></div></div>" +
      '<p class="pp-desc">' +
      esc(Accounts.describe(p)) +
      "</p>" +
      (p.bio ? '<p class="pp-bio">' + esc(p.bio) + "</p>" : "") +
      (p.places.length
        ? '<div class="pp-places">' +
          p.places.slice(0, 3).map(placeRow).join("") +
          "</div>" +
          (p.places.length > 3 ? '<small class="meta">+' + (p.places.length - 3) + " more</small>" : "")
        : "") +
      '<div class="pp-foot"><small class="meta">' +
      esc(since(p.joined)) +
      (p.phone ? " · " + esc(p.phone) : "") +
      '</small><div class="pp-acts">' +
      msgBtn(p) +
      '<a class="btn alt sm" href="#u=' +
      esc(p.id) +
      '">Profile</a></div></div></article>'
    );
  }
  function listHTML() {
    var all = Accounts.people(),
      n = {
        owner: all.filter(function (p) {
          return p.owner;
        }).length,
        student: all.filter(function (p) {
          return p.student;
        }).length,
        all: all.length,
      },
      words = q.toLowerCase().split(/\s+/).filter(Boolean),
      shown = all.filter(function (p) {
        if (tab === "owner" && !p.owner) return false;
        if (tab === "student" && !p.student) return false;
        var hay = (
          p.name +
          " " +
          p.bio +
          " " +
          p.school +
          " " +
          p.places
            .map(function (id) {
              var h = Inbox.house(id);
              return h ? h.n + " " + h.a : "";
            })
            .join(" ")
        ).toLowerCase();
        return words.every(function (w) {
          return hay.indexOf(w) >= 0;
        });
      });
    var chips = [
      ["owner", "Landowners", n.owner],
      ["student", "Students", n.student],
      ["all", "Everyone", n.all],
    ]
      .map(function (c) {
        return (
          '<button type="button" role="tab" data-tab="' +
          c[0] +
          '" aria-selected="' +
          (tab === c[0]) +
          '">' +
          c[1] +
          " <span>" +
          c[2] +
          "</span></button>"
        );
      })
      .join("");
    var empty =
      tab === "owner"
        ? "No landowners yet. List your place on DormNamo and you'll appear here for students."
        : "No accounts match that.";
    return (
      '<div class="pp-bar"><div class="pp-tabs" role="tablist" aria-label="Account type">' +
      chips +
      '</div><label class="pp-q">' +
      ico("search") +
      '<input id="ppQ" type="search" placeholder="Search names, places, areas" aria-label="Search accounts" value="' +
      esc(q) +
      '"></label></div>' +
      (shown.length
        ? '<div class="pp-list">' + shown.map(cardHTML).join("") + "</div>"
        : '<div class="pp-empty pp-card">' + ico("users") + "<p>" + empty + "</p></div>") +
      '<p class="pp-note meta">' +
      ico("info") +
      "<span>Accounts and messages are kept in this browser for now (demo). Email addresses are never shown to others.</span></p>"
    );
  }

  /* ---------- one profile (#u=id) ---------- */
  function showProfile(id) {
    var p = Accounts.person(id);
    if (!p) {
      toast("That account isn't on this device.");
      return;
    }
    var mine = window.USER && USER.id === p.id,
      canMsg = window.USER && USER.id !== "guest" && !mine;
    D.innerHTML =
      '<button class="x dlg-x" type="button" aria-label="Close" onclick="dlg.close()">✕</button>' +
      '<div class="pp-prof"><div class="pp-head">' +
      avatarHTML(p.id, p.name, "lg") +
      "<div><h2>" +
      esc(p.name) +
      '</h2><div class="pp-badges">' +
      badges(p) +
      "</div></div></div>" +
      '<p class="pp-desc">' +
      esc(Accounts.describe(p)) +
      "</p>" +
      (p.bio
        ? '<p class="pp-bio">' + esc(p.bio) + "</p>"
        : '<p class="pp-bio meta">No description yet.</p>') +
      '<dl class="pp-info"><div><dt>Joined</dt><dd>' +
      (esc(since(p.joined).replace("Member since ", "")) || '<span class="meta">Before profiles</span>') +
      "</dd></div>" +
      (p.school ? "<div><dt>School</dt><dd>" + esc(p.school) + "</dd></div>" : "") +
      (p.phone ? "<div><dt>Phone</dt><dd>" + esc(p.phone) + "</dd></div>" : "") +
      "</dl>" +
      (p.places.length
        ? '<span class="dlg-k">Places on DormNamo</span><div class="pp-places">' +
          p.places
            .map(function (pid) {
              return (
                '<div class="pp-prow">' +
                placeRow(pid) +
                (canMsg
                  ? '<button type="button" class="btn sm" data-interest="' +
                    pid +
                    '">' +
                    ico("chat") +
                    "I'm interested</button>"
                  : "") +
                "</div>"
              );
            })
            .join("") +
          "</div>"
        : "") +
      '<div class="pp-acts">' +
      (canMsg ? msgBtn(p) : "") +
      (mine ? '<a class="btn alt sm" href="#me">Edit my account</a>' : "") +
      "</div></div>";
    D.showModal();
    D.scrollTop = 0;
    D.addEventListener(
      "close",
      function () {
        if (/^#u=/.test(location.hash)) history.replaceState(null, "", location.pathname);
      },
      { once: true },
    );
  }

  /* ---------- render + events ---------- */
  function render() {
    document.getElementById("ppMe").innerHTML = meHTML();
    document.getElementById("ppMain").innerHTML = listHTML();
    var ph = document.getElementById("ppPhone");
    if (ph) phoneField(ph);
    var bio = document.getElementById("ppBio");
    if (bio) {
      var cnt = function () {
        document.getElementById("ppBioN").textContent = bio.value.length + " / 280";
      };
      bio.oninput = cnt;
      cnt();
    }
  }
  function route() {
    var m = location.hash.match(/^#u=(.+)$/);
    if (m) showProfile(decodeURIComponent(m[1]));
    else if (location.hash === "#me") {
      var el = document.getElementById("ppMe");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  function go(href) {
    document.documentElement.classList.add("leaving");
    setTimeout(function () {
      location.href = href;
    }, 220);
  }
  function wire() {
    var page = document.querySelector(".pp-page");
    page.addEventListener("click", function (e) {
      var t = e.target.closest("[data-tab]");
      if (t) {
        tab = t.dataset.tab;
        render();
        return;
      }
      var o = e.target.closest("[data-open]");
      if (o) return open(+o.dataset.open);
      var dm = e.target.closest("[data-dm]");
      if (dm) return startDM(dm.dataset.dm);
      var b = e.target.closest("button");
      if (!b) return;
      if (b.id === "ppEdit") {
        editing = true;
        render();
        document.getElementById("ppName").focus();
      } else if (b.id === "ppCancel") {
        editing = false;
        render();
      } else if (b.id === "ppSignup") {
        Accounts.logOut();
        location.reload();
      }
    });
    // the profile dialog (#dlg) has its own buttons
    D.addEventListener("click", function (e) {
      var o = e.target.closest(".pp-prof [data-open]");
      if (o) {
        D.close();
        open(+o.dataset.open);
        return;
      }
      var dm = e.target.closest(".pp-prof [data-dm]");
      if (dm) startDM(dm.dataset.dm);
    });
    page.addEventListener("input", function (e) {
      if (e.target.id === "ppQ") {
        q = e.target.value;
        var at = e.target.selectionStart;
        render();
        var i = document.getElementById("ppQ");
        i.focus();
        i.setSelectionRange(at, at);
      }
    });
    page.addEventListener("submit", function (e) {
      if (e.target.id !== "ppForm") return;
      e.preventDefault();
      var roles = [];
      if (document.getElementById("ppStudent").checked) roles.push("student");
      if (document.getElementById("ppOwner").checked) roles.push("owner");
      var err = document.getElementById("ppErr");
      if (!roles.length) {
        err.textContent = "Pick at least one: looking for a room, or landowner.";
        return;
      }
      var phone = document.getElementById("ppPhone").value;
      if (phone && !phoneOk(phone)) {
        err.textContent = "Enter a PH mobile number like 0917 123 4567, or leave it empty.";
        return;
      }
      Accounts.updateProfile({
        name: document.getElementById("ppName").value,
        bio: document.getElementById("ppBio").value,
        school: document.getElementById("ppSchool").value,
        phone: phone,
        showPhone: document.getElementById("ppShow").checked,
        roles: roles,
      }).then(
        function (session) {
          USER = session;
          editing = false;
          render();
          Nav.account();
          toast("Profile saved");
        },
        function (x) {
          err.textContent = x.message;
        },
      );
    });
    window.addEventListener("hashchange", route);
    Inbox.on(render);
  }
  function startDM(uid) {
    var r = Inbox.dm(uid, null);
    if (r.error) return toast(r.error === "account" ? "Create an account to message people." : "That's you!");
    go("messages.html#t=" + r.thread.id);
  }
  function init() {
    wire();
    render();
    route();
  }
  return { init: init, render: render };
})();
function pageInit() {
  People.init();
}
