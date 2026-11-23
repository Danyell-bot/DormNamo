/* ==========================================================
   nav.js - the top navigation bar shared by every page
   Edit TABS to add pages. Active tab comes from <body data-page="...">.
   ========================================================== */
var Nav = (function () {
  // icon = a name from ICONS in utils.js
  var TABS = [
    { id: "home", label: "Rooms", href: "index.html", icon: "home" },
    { id: "discover", label: "Discover", href: "discover.html", icon: "compass" },
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
          '"' +
          (t.id === page ? ' class="on" aria-current="page"' : "") +
          ">" +
          ico(t.icon, "ti") +
          t.label +
          "</a>"
        );
      }).join("") +
      "</nav>" +
      '<div class="nav-r"><a class="owner-link" href="' +
      (page === "home" ? "" : "index.html") +
      '#owners">List your place</a><div class="acct" id="acct"></div></div></div>';
    // fade the page out before going to the other page (it fades back in on load, css/brand.css)
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

  /** Airbnb-style account pill: hamburger + avatar, opens a menu. */
  function account() {
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
      '<button id="mList" type="button">' +
      ico("door") +
      'My listings</button><button id="mPref" type="button">' +
      ico("sliders") +
      'Edit preferences</button><button id="mChat" type="button">' +
      ico("chat") +
      'Ask Namo</button><button id="mOut" type="button">' +
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
    document.getElementById("mPref").onclick = prefs;
    document.getElementById("mChat").onclick = function () {
      Chat.open();
    };
    document.getElementById("mOut").onclick = function () {
      Accounts.logOut();
      location.reload();
    };
  }
  return { render: render, account: account };
})();
Nav.render();
