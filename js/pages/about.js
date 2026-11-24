/* ==========================================================
   about.js - the About us page (about.html): values and the five developers
   Edit TEAM to fill in each person:
   - name, role: shown under the photo
   - bio: one or two sentences about them
   - focus: the part of DormNamo they built
   - photo (optional): an image path such as "img/team/ana.jpg", otherwise their initials
   - links: their profiles. Only https:// links are used. A key set to "" shows the icon
     dimmed (not filled in yet); delete the key to hide that network for that person.
   ========================================================== */
var SOCIALS = [
  ["github", "GitHub"],
  ["facebook", "Facebook"],
  ["x", "X"],
  ["instagram", "Instagram"],
  ["linkedin", "LinkedIn"],
];
var TEAM = [
  {
    name: "Developer 1",
    role: "Add role",
    bio: "Add a short description: what they study, what they enjoy building.",
    focus: "Rooms page, design system and the Discover strip",
    links: {
      github: "",
      facebook: "",
      x: "",
      instagram: "",
      linkedin: "",
    },
  },
  {
    name: "Developer 2",
    role: "Add role",
    bio: "Add a short description: what they study, what they enjoy building.",
    focus: "Namo, the room helper chatbot",
    links: {
      github: "",
      facebook: "",
      x: "",
      instagram: "",
      linkedin: "",
    },
  },
  {
    name: "Developer 3",
    role: "Add role",
    bio: "Add a short description: what they study, what they enjoy building.",
    focus: "Matching and the learning model",
    links: {
      github: "",
      facebook: "",
      x: "",
      instagram: "",
      linkedin: "",
    },
  },
  {
    name: "Developer 4",
    role: "Add role",
    bio: "Add a short description: what they study, what they enjoy building.",
    focus: "Maps, nearby places and walking routes",
    links: {
      github: "",
      facebook: "",
      x: "",
      instagram: "",
      linkedin: "",
    },
  },
  {
    name: "Developer 5",
    role: "Add role",
    bio: "Add a short description: what they study, what they enjoy building.",
    focus: "Accounts, messages and owner listings",
    links: {
      github: "",
      facebook: "",
      x: "",
      instagram: "",
      linkedin: "",
    },
  },
];

var VALUES = [
  {
    icon: "check",
    h: "Honest listings",
    p: "We never invent rent, amenities or rules. If a listing doesn’t say it, DormNamo shows it as unverified.",
  },
  {
    icon: "namo",
    h: "Matches that explain themselves",
    p: "Namo tells you why a room fits, why another doesn’t, and compares places side by side.",
  },
  {
    icon: "pin",
    h: "Close to campus, free to use",
    p: "Walking time to campus, nearby stores and routes, and students never pay to search.",
  },
];

(function () {
  var v = document.getElementById("abValues");
  if (v)
    v.innerHTML = VALUES.map(function (x) {
      return (
        '<div class="ab-value">' + ico(x.icon) + "<h3>" + esc(x.h) + "</h3><p>" + esc(x.p) + "</p></div>"
      );
    }).join("");
  var box = document.getElementById("abTeam");
  if (!box) return;
  function initials(n) {
    return String(n)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (w) {
        return w.charAt(0).toUpperCase();
      })
      .join("");
  }
  /** Icon links to each profile that is set; "" = dimmed placeholder; a missing key = not shown. */
  function socials(p) {
    var l = p.links || {};
    var html = SOCIALS.filter(function (s) {
      return s[0] in l;
    })
      .map(function (s) {
        var url = String(l[s[0]] || "").trim(),
          label = p.name + " on " + s[1];
        return /^https:\/\/\S+$/.test(url)
          ? '<a href="' +
              esc(url) +
              '" target="_blank" rel="noopener" aria-label="' +
              esc(label) +
              '" title="' +
              esc(s[1]) +
              '">' +
              ico("s-" + s[0]) +
              "</a>"
          : '<span class="off" title="' + esc(s[1]) + ': not added yet">' + ico("s-" + s[0]) + "</span>";
      })
      .join("");
    return html ? '<div class="ab-social">' + html + "</div>" : "";
  }
  box.innerHTML = TEAM.map(function (p, i) {
    return (
      '<article class="ab-member">' +
      (p.photo
        ? '<img class="ab-photo" src="' + esc(p.photo) + '" alt="' + esc(p.name) + '" loading="lazy">'
        : '<span class="ab-photo ab-ini" style="--av:' +
          (210 + i * 28) +
          '" aria-hidden="true">' +
          esc(initials(p.name)) +
          "</span>") +
      "<h3>" +
      esc(p.name) +
      "</h3>" +
      '<p class="ab-role">' +
      esc(p.role) +
      "</p>" +
      (p.bio ? '<p class="ab-bio">' + esc(p.bio) + "</p>" : "") +
      (p.focus ? '<p class="ab-focus"><b>Built</b>' + esc(p.focus) + "</p>" : "") +
      socials(p) +
      "</article>"
    );
  }).join("");
})();
