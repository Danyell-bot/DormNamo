/* ==========================================================
   auth.js - full-page log in / sign up screen
   Modes: "signup", "login", "forgot" (email a reset link; online accounts only).
   Auth.reset() is the "set a new password" screen a reset link opens.
   ========================================================== */
var Auth = (function () {
  var root = document.getElementById("auth");

  function open() {
    document.body.classList.add("lock");
    root.hidden = false;
  }
  function close() {
    root.hidden = true;
    document.body.classList.remove("lock");
  }
  /** The card around every screen. note = a message; ok = it's good news, not an error. */
  function card(title, sub, inner, note, ok) {
    return (
      '<div class="ov-head"><span class="ov-logo">' +
      logoHTML() +
      "</span></div>" +
      '<div class="ov-body"><form class="ov-card" id="authForm" novalidate>' +
      '<div class="ov-icon" aria-hidden="true">' +
      ico("home") +
      "</div>" +
      "<h1>" +
      title +
      "</h1>" +
      '<p class="ov-sub">' +
      sub +
      "</p>" +
      inner.replace("{{note}}", function () {
        // a function, so a "$" in the message is never read as a replacement pattern
        return '<p class="err' + (ok ? " note" : "") + '" role="alert">' + esc(note || "") + "</p>";
      }) +
      "</form></div>"
    );
  }

  function show(onDone) {
    var mode = "signup",
      role = "student"; // "student", "owner" or "both": one account can be both
    var online = Accounts.cloud();
    open();

    function draw(note, ok) {
      var signup = mode === "signup",
        forgot = mode === "forgot";
      var keep = online ? "Your account works on any phone or computer." : "Saved in this browser only.";
      if (forgot) {
        root.innerHTML = card(
          "Reset your password",
          "Enter your email and we'll send you a link to set a new password.",
          '<label>Email<input id="aEmail" type="email" autocomplete="email"></label>{{note}}' +
            '<button class="btn big" type="submit">Send reset link</button>' +
            '<button class="linkbtn" type="button" id="swap">Back to log in</button>',
          note,
          ok,
        );
      } else {
        root.innerHTML = card(
          signup ? "Create your account" : "Welcome back",
          (signup ? "Save your preferences and liked rooms. " : "Log in to see your matches. ") + keep,
          (signup ? '<label>Name<input id="aName" autocomplete="name"></label>' : "") +
            (signup
              ? '<fieldset class="au-role"><legend>I’m here to</legend><div role="radiogroup">' +
                [
                  ["student", "Find a room", "Student or tenant"],
                  ["owner", "List my place", "Landowner"],
                  ["both", "Both", "Landowners can rent too"],
                ]
                  .map(function (o) {
                    return (
                      '<button type="button" role="radio" data-role="' +
                      o[0] +
                      '" aria-checked="' +
                      (role === o[0]) +
                      '"><b>' +
                      o[1] +
                      "</b><small>" +
                      o[2] +
                      "</small></button>"
                    );
                  })
                  .join("") +
                "</div></fieldset>"
              : "") +
            '<label>Email<input id="aEmail" type="email" autocomplete="email"></label>' +
            '<label>Password<input id="aPass" type="password" autocomplete="' +
            (signup ? "new" : "current") +
            '-password"></label>' +
            "{{note}}" +
            '<button class="btn big" type="submit">' +
            (signup ? "Sign up" : "Log in") +
            "</button>" +
            (!signup && online
              ? '<button class="linkbtn" type="button" id="forgot">Forgot your password?</button>'
              : "") +
            '<button class="linkbtn" type="button" id="swap">' +
            (signup ? "Already have an account? Log in" : "New here? Create an account") +
            "</button>" +
            '<button class="linkbtn" type="button" id="guest">Continue as guest (saved on this device only)</button>',
          note,
          ok,
        );
      }

      root.querySelectorAll("[data-role]").forEach(function (b) {
        b.onclick = function () {
          role = b.dataset.role;
          root.querySelectorAll("[data-role]").forEach(function (x) {
            x.setAttribute("aria-checked", x === b);
          });
        };
      });
      document.getElementById("swap").onclick = function () {
        mode = signup ? "login" : forgot ? "login" : "signup";
        draw();
      };
      var fg = document.getElementById("forgot");
      if (fg)
        fg.onclick = function () {
          mode = "forgot";
          draw();
        };
      var gu = document.getElementById("guest");
      if (gu)
        gu.onclick = function () {
          finish(Accounts.guest());
        };
      document.getElementById("authForm").onsubmit = function (e) {
        e.preventDefault();
        var email = document.getElementById("aEmail").value,
          btn = root.querySelector("button[type=submit]");
        btn.disabled = true;
        if (forgot) {
          btn.textContent = "Sending…";
          Accounts.resetPassword(email).then(
            function () {
              mode = "login";
              draw(
                "If " + email.trim() + " has an account, a reset link is on its way. Check your inbox.",
                true,
              );
            },
            function (err) {
              draw(err.message);
            },
          );
          return;
        }
        var pass = document.getElementById("aPass").value;
        var job = signup
          ? Accounts.signUp(
              document.getElementById("aName").value,
              email,
              pass,
              role === "both" ? ["student", "owner"] : [role],
            )
          : Accounts.logIn(email, pass);
        btn.textContent = online
          ? signup
            ? "Creating your account…"
            : "Logging in…"
          : "Securing your password…";
        job.then(finish, function (err) {
          if (err.info) mode = "login"; // e.g. "confirm your email, then log in"
          draw(err.message, !!err.info);
          if (err.info) document.getElementById("aEmail").value = email;
        });
      };
      var first = root.querySelector("input");
      if (first) first.focus();
    }

    function finish(user) {
      close();
      onDone(user);
    }
    draw();
  }

  /** "Set a new password", opened by the reset link from the email. */
  function reset(onDone) {
    open();
    function draw(note) {
      root.innerHTML = card(
        "Set a new password",
        "Choose a new password for your DormNamo account.",
        '<label>New password<input id="aPass" type="password" autocomplete="new-password"></label>{{note}}' +
          '<button class="btn big" type="submit">Save password</button>',
        note,
      );
      document.getElementById("authForm").onsubmit = function (e) {
        e.preventDefault();
        var btn = root.querySelector("button[type=submit]");
        btn.disabled = true;
        btn.textContent = "Saving…";
        Accounts.setPassword(document.getElementById("aPass").value).then(
          function (user) {
            close();
            toast("Password changed. You're logged in.");
            onDone(user);
          },
          function (err) {
            draw(err.message);
          },
        );
      };
      document.getElementById("aPass").focus();
    }
    draw();
  }
  return { show: show, reset: reset };
})();
