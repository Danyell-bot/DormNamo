/* ==========================================================
   auth.js - full-page log in / sign up screen
   ========================================================== */
var Auth = (function () {
  var root = document.getElementById("auth");

  function show(onDone) {
    var mode = "signup",
      role = "student"; // "student", "owner" or "both": one account can be both
    document.body.classList.add("lock");
    root.hidden = false;

    function draw(error) {
      var signup = mode === "signup";
      root.innerHTML =
        '<div class="ov-head"><span class="ov-logo">' +
        logoHTML() +
        "</span></div>" +
        '<div class="ov-body"><form class="ov-card" id="authForm" novalidate>' +
        '<div class="ov-icon" aria-hidden="true">' +
        ico("home") +
        "</div>" +
        "<h1>" +
        (signup ? "Create your account" : "Welcome back") +
        "</h1>" +
        '<p class="ov-sub">' +
        (signup ? "Save your preferences and liked rooms." : "Log in to see your matches.") +
        "</p>" +
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
        '<p class="err" role="alert">' +
        (error || "") +
        "</p>" +
        '<button class="btn big" type="submit">' +
        (signup ? "Sign up" : "Log in") +
        "</button>" +
        '<button class="linkbtn" type="button" id="swap">' +
        (signup ? "Already have an account? Log in" : "New here? Create an account") +
        "</button>" +
        '<button class="linkbtn" type="button" id="guest">Continue as guest (saved on this device only)</button>' +
        "</form></div>";

      root.querySelectorAll("[data-role]").forEach(function (b) {
        b.onclick = function () {
          role = b.dataset.role;
          root.querySelectorAll("[data-role]").forEach(function (x) {
            x.setAttribute("aria-checked", x === b);
          });
        };
      });
      document.getElementById("swap").onclick = function () {
        mode = signup ? "login" : "signup";
        draw();
      };
      document.getElementById("guest").onclick = function () {
        finish(Accounts.guest());
      };
      document.getElementById("authForm").onsubmit = function (e) {
        e.preventDefault();
        var email = document.getElementById("aEmail").value,
          pass = document.getElementById("aPass").value;
        var job = signup
          ? Accounts.signUp(
              document.getElementById("aName").value,
              email,
              pass,
              role === "both" ? ["student", "owner"] : [role],
            )
          : Accounts.logIn(email, pass);
        var btn = root.querySelector("button[type=submit]");
        btn.disabled = true;
        btn.textContent = "Securing your password…";
        job.then(finish, function (err) {
          draw(err.message);
        });
      };
      var first = root.querySelector("input");
      if (first) first.focus();
    }

    function finish(user) {
      root.hidden = true;
      document.body.classList.remove("lock");
      onDone(user);
    }
    draw();
  }
  return { show: show };
})();
