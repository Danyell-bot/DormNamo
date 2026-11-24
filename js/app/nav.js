/* ==========================================================
   nav.js - the top navigation bar shared by every page
   Edit TABS to add pages. Active tab comes from <body data-page="...">.
   ========================================================== */
var Nav = (function () {
  // icon = a name from ICONS in utils.js
  var TABS = [
    { id: "home", label: "Rooms", href: "index.html", icon: "home" },
    { id: "discover", label: "Discover", href: "discover.html", icon: "compass" },
    { id: "people", label: "Landowners", href: "people.html", icon: "users" },
    { id: "messages", label: "Messages", href: "messages.html", icon: "chat", badge: true },
  ];

  function render() {
    var page = document.body.dataset.page;
    document.getElementById("siteHeader").innerHTML =
      '<div class="wrap nav">' +
      '<a class="logo" href="index.html" aria-label="DormNamo home">' +
      logoHTML() +
      "</a>" +
      '<nav class="tabs" aria-label="Main">' +
      TABS.map(function (t) {
        return (
          '<a href="' +
          t.href +
          '" title="' +
          t.label +
          '"' +
          (t.id === page ? ' class="on" aria-current="page"' : "") +
          ">" +
          ico(t.icon, "ti") +
          '<span class="tl">' +
          t.label +
          "</span>" +
          (t.badge ? '<span class="nav-badge" id="navUnread" hidden></span>' : "") +
          "</a>"
        );
      }).join("") +
      "</nav>" +
      '<div class="nav-r"><a class="owner-link" href="' +
      (page === "home" ? "" : "index.html") +
      '#owners">List your place</a><div class="acct" id="acct"></div></div></div>';
    // fade the page out before going to the other page (it fades back in on load, css/base/brand.css)
    document.getElementById("siteHeader").addEventListener("click", function (e) {
      var a = e.target.closest("a[href]");
      if (
        !a ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        a.target
      )
        return;
      var url = new URL(a.getAttribute("href"), location.href);
      if (url.pathname === location.pathname) return; // same page: fx.js glides to #section
      e.preventDefault();
      if (url.hash.length > 1) {
        // e.g. index.html#owners from Discover
        try {
          sessionStorage.setItem("dn:goto", decodeURIComponent(url.hash.slice(1)));
          url.hash = "";
        } catch (err) {}
      }
      document.documentElement.classList.add("leaving");
      setTimeout(function () {
        location.href = url.href.replace(/#$/, "");
      }, 220);
    });
    window.addEventListener("pageshow", function () {
      document.documentElement.classList.remove("leaving");
    }); // back button
    window.addEventListener(
      "scroll",
      function () {
        document.getElementById("siteHeader").classList.toggle("stuck", window.scrollY > 8);
      },
      { passive: true },
    );
  }

  /** Unread messages on the Messages tab (inbox.js); kept live when other tabs write. */
  function unread() {
    var b = document.getElementById("navUnread");
    if (!b || !window.Inbox) return;
    var n = Inbox.unread();
    b.hidden = !n;
    b.textContent = n > 9 ? "9+" : n;
    b.parentNode.setAttribute("aria-label", "Messages" + (n ? ", " + n + " unread" : ""));
  }
  if (window.Inbox) Inbox.on(unread);

  /** Airbnb-style account pill: hamburger + avatar, opens a menu. */
  function account() {
    var p = window.Accounts && Accounts.me ? Accounts.me() : null;
    unread();
    var box = document.getElementById("acct");
    box.innerHTML =
      '<button class="pillbtn" id="acctBtn" aria-haspopup="true" aria-expanded="false" aria-label="Account menu"><span aria-hidden="true">☰</span><b class="avatar">' +
      esc((USER.name || "?").charAt(0).toUpperCase()) +
      "</b></button>" +
      '<div class="menu" id="acctMenu" hidden><b>' +
      esc(USER.name) +
      "</b><small>" +
      esc(USER.email || "Guest (this device only)") +
      "</small>" +
      (p
        ? '<span class="menu-roles">' +
          (p.student ? '<i class="role-b role-student">Student</i>' : "") +
          (p.owner ? '<i class="role-b role-owner">Landowner</i>' : "") +
          "</span>"
        : "") +
      '<button id="mAcct" type="button">' +
      ico("user") +
      'My account</button><button id="mMsg" type="button">' +
      ico("chat") +
      "Messages</button>" +
      '<button id="mList" type="button">' +
      ico("door") +
      'My listings</button><button id="mPref" type="button">' +
      ico("sliders") +
      'Edit preferences</button><button id="mChat" type="button">' +
      ico("chat") +
      'Ask Namo</button><button id="mPriv" type="button">' +
      ico("info") +
      'Privacy &amp; cookies</button><button id="mOut" type="button">' +
      ico("logout") +
      "Log out</button></div>";
    var btn = document.getElementById("acctBtn"),
      menu = document.getElementById("acctMenu");
    btn.onclick = function (e) {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute("aria-expanded", !menu.hidden);
    };
    document.addEventListener("click", function () {
      menu.hidden = true;
    });
    document.getElementById("mList").onclick = function () {
      if (document.body.dataset.page === "listings") {
        menu.hidden = true;
        return;
      }
      document.documentElement.classList.add("leaving");
      setTimeout(function () {
        location.href = "mylistings.html";
      }, 220);
    };
    function go(href) {
      document.documentElement.classList.add("leaving");
      setTimeout(function () {
        location.href = href;
      }, 220);
    }
    document.getElementById("mAcct").onclick = function () {
      if (document.body.dataset.page === "people") {
        menu.hidden = true;
        location.hash = "me";
      } else go("people.html#me");
    };
    document.getElementById("mMsg").onclick = function () {
      if (document.body.dataset.page === "messages") menu.hidden = true;
      else go("messages.html");
    };
    document.getElementById("mPref").onclick = prefs;
    document.getElementById("mChat").onclick = function () {
      Chat.open();
    };
    document.getElementById("mPriv").onclick = function () {
      menu.hidden = true;
      Consent.show(function (yes) {
        toast(yes ? "Your preferences will be remembered" : "Saved preferences deleted. Essential only.");
      });
    };
    document.getElementById("mOut").onclick = function () {
      Accounts.logOut();
      location.reload();
    };
  }
  return { render: render, account: account, unread: unread };
})();
Nav.render();
