/* ==========================================================
   onboarding.js - full-page preference questionnaire
   Shown right after sign-up (and from the account menu to
   edit later). To add or reorder questions, edit STEPS.
   ========================================================== */
var Onboarding = (function () {
  var root = document.getElementById("ob");
  var MODES = ["Don't care", "Nice to have", "Must have"];
  var HINT = [
    "Ignored when ranking rooms.",
    "Rooms that have it rank higher.",
    "Rooms without it are hidden.",
  ];

  // fields: values the user sets.  pri: preferences with a strictness picker.
  var STEPS = [
    {
      icon: "pin",
      short: "Distance",
      title: "How close to campus?",
      sub: "Pick your school and the longest walk you'd accept.",
      fields: [
        {
          key: "school",
          type: "select",
          label: "Near school",
          options: function () {
            return SCHOOLS;
          },
        },
        {
          key: "maxKm",
          type: "range",
          label: "Max walking distance",
          min: 0.2,
          max: 5,
          step: 0.1,
          fmt: function (v) {
            return v + " km";
          },
          note: function (v) {
            return "about " + Math.round(v * 12) + " min walk";
          },
        },
      ],
      pri: ["dist"],
    },
    {
      icon: "wallet",
      short: "Budget",
      title: "What's your budget?",
      sub: "Monthly rent you can afford.",
      fields: [
        {
          key: "bhMax",
          type: "range",
          label: "Boarding house, up to",
          min: 1000,
          max: 10000,
          step: 500,
          fmt: peso,
        },
        {
          key: "aptMax",
          type: "range",
          label: "Apartment, up to",
          min: 3000,
          max: 15000,
          step: 500,
          fmt: peso,
        },
      ],
      pri: ["budget"],
    },
    {
      icon: "users",
      short: "Roommates",
      title: "Who's staying?",
      sub: "Room size and who you'd share with.",
      fields: [
        {
          key: "cap",
          type: "chips",
          label: "Room capacity",
          options: [
            ["2-3", "Boarding house: 2-3 people"],
            ["4", "Apartment: 4 people"],
            ["any", "Any"],
          ],
        },
        {
          key: "gender",
          type: "chips",
          label: "Gender accommodation",
          options: [
            ["any", "Any"],
            ["male", "Male-only"],
            ["female", "Female-only"],
            ["mixed", "Mixed"],
          ],
        },
      ],
      pri: ["cap", "gender"],
    },
    {
      icon: "drop",
      short: "Utilities",
      title: "Water and electricity",
      sub: "How strict are you about utilities?",
      pri: ["water", "elec"],
    },
    {
      icon: "leaf",
      short: "Comfort",
      title: "Comfort and space",
      sub: "The little things that make a room feel like home.",
      pri: ["env", "kit", "wifi", "space"],
    },
    {
      icon: "door",
      short: "Rules",
      title: "House rules",
      sub: "Curfews and visitors.",
      pri: ["curfew", "vis"],
    },
  ];

  var step = 0,
    draft = null,
    opts = {};

  function open(options) {
    opts = options || {};
    draft = JSON.parse(JSON.stringify(S.P));
    step = 0;
    root.hidden = false;
    document.body.classList.add("lock");
    render();
  }

  function close() {
    root.hidden = true;
    document.body.classList.remove("lock");
  }

  function fieldHTML(f) {
    var v = draft[f.key],
      id = "f_" + f.key;
    if (f.type === "select") {
      return (
        '<label class="ob-field"><span class="ob-lab">' +
        f.label +
        '</span><select id="' +
        id +
        '" data-key="' +
        f.key +
        '">' +
        f
          .options()
          .map(function (o) {
            return "<option" + (o === v ? " selected" : "") + ">" + esc(o) + "</option>";
          })
          .join("") +
        "</select></label>"
      );
    }
    if (f.type === "range") {
      return (
        '<div class="ob-field ob-range"><div class="ob-range-h"><label class="ob-lab" for="' +
        id +
        '">' +
        f.label +
        "</label>" +
        '<output id="' +
        id +
        '_v" for="' +
        id +
        '">' +
        valueHTML(f, v) +
        "</output></div>" +
        '<input type="range" id="' +
        id +
        '" data-key="' +
        f.key +
        '" min="' +
        f.min +
        '" max="' +
        f.max +
        '" step="' +
        f.step +
        '" value="' +
        v +
        '" style="--fill:' +
        fill(f, v) +
        '%">' +
        '<div class="ob-ends"><span>' +
        f.fmt(f.min) +
        "</span><span>" +
        f.fmt(f.max) +
        "</span></div></div>"
      );
    }
    return (
      '<div class="ob-field"><span class="ob-lab">' +
      f.label +
      '</span><div class="ob-opts" role="radiogroup" aria-label="' +
      esc(f.label) +
      '">' +
      f.options
        .map(function (o) {
          return (
            '<button type="button" role="radio" data-chip="' +
            f.key +
            '" data-val="' +
            o[0] +
            '" aria-checked="' +
            (v === o[0]) +
            '">' +
            o[1] +
            "</button>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }
  function valueHTML(f, v) {
    return "<b>" + f.fmt(v) + "</b>" + (f.note ? "<small>" + f.note(v) + "</small>" : "");
  }
  function fill(f, v) {
    return (((v - f.min) / (f.max - f.min)) * 100).toFixed(1);
  }

  // "How much does this matter?": three choices plus one line saying what the choice does
  function priHTML(k) {
    var cur = draft.m[k];
    return (
      '<div class="ob-pri"><div class="ob-pri-h"><b>' +
      LBL[k] +
      '</b><small class="ob-hint m' +
      cur +
      '">' +
      HINT[cur] +
      "</small></div>" +
      '<div class="ob-imp" role="radiogroup" aria-label="How important is ' +
      esc(LBL[k]) +
      '">' +
      MODES.map(function (m, i) {
        return (
          '<button type="button" role="radio" data-pri="' +
          k +
          '" data-val="' +
          i +
          '" aria-checked="' +
          (cur === i) +
          '" class="m' +
          i +
          '">' +
          m +
          "</button>"
        );
      }).join("") +
      "</div></div>"
    );
  }

  function reviewHTML() {
    var keys = Object.keys(W).sort(function (a, b) {
      return W[b] - W[a];
    });
    function group(level, title) {
      var items = keys.filter(function (k) {
        return draft.m[k] === level;
      });
      return items.length
        ? '<div class="ob-group"><span class="ob-lab">' +
            title +
            '</span><div class="ob-tags">' +
            items
              .map(function (k) {
                return '<span class="ob-tag m' + level + '">' + LBL[k] + "</span>";
              })
              .join("") +
            "</div></div>"
        : "";
    }
    var capTxt = { "2-3": "2-3 people", 4: "4 people", any: "Any size" }[draft.cap] || draft.cap;
    var row = function (icon, k, v) {
      return '<div class="ob-sum-r">' + ico(icon) + "<span>" + k + "</span><b>" + v + "</b></div>";
    };
    return (
      '<div class="ob-sum">' +
      row("pin", "Near", esc(draft.school) + ", within " + draft.maxKm + " km") +
      row("wallet", "Budget", peso(draft.bhMax) + " boarding house · " + peso(draft.aptMax) + " apartment") +
      row("users", "Room", capTxt + " · " + (draft.gender === "any" ? "any gender" : draft.gender)) +
      "</div>" +
      group(2, "Must have") +
      group(1, "Nice to have") +
      group(0, "Don't care")
    );
  }

  var dir = 1; // 1 = going forward, -1 = going back (slide direction)
  function render() {
    var total = STEPS.length + 1,
      last = step === STEPS.length,
      s = STEPS[step] || { icon: "done", short: "Review" };
    var head =
      '<div class="ob-head"><span class="ob-icon">' +
      ico(s.icon) +
      "</span><div><h1>" +
      (last ? "All set" : s.title) +
      '</h1><p class="ov-sub">' +
      (last ? "Here's what we'll match you with. You can change it anytime." : s.sub) +
      "</p></div></div>";
    var body = last
      ? reviewHTML()
      : (s.fields || []).map(fieldHTML).join("") +
        ((s.pri || []).length
          ? '<div class="ob-pris">' +
            ((s.fields || []).length ? '<span class="ob-sect">How much does this matter?</span>' : "") +
            s.pri.map(priHTML).join("") +
            "</div>"
          : "");
    var segs = "";
    for (var i = 0; i < total; i++)
      segs += '<i class="' + (i < step ? "done" : i === step ? "on" : "") + '"></i>';

    root.innerHTML =
      '<div class="ov-head"><span class="ov-logo">' +
      logoHTML() +
      "</span>" +
      (opts.edit
        ? '<button class="ob-cancel" id="obCancel" type="button">' + ico("x") + "Cancel</button>"
        : "") +
      "</div>" +
      '<div class="ov-body"><div class="ov-card wide ob-card" role="dialog" aria-label="Preferences, step ' +
      (step + 1) +
      " of " +
      total +
      '">' +
      '<div class="ob-top"><span>Step ' +
      (step + 1) +
      " of " +
      total +
      " · " +
      s.short +
      '</span><div class="ob-prog" role="progressbar" aria-valuemin="1" aria-valuemax="' +
      total +
      '" aria-valuenow="' +
      (step + 1) +
      '">' +
      segs +
      "</div></div>" +
      '<div class="ob-step ' +
      (dir < 0 ? "back" : "fwd") +
      '">' +
      head +
      body +
      "</div>" +
      '<div class="ob-nav"><button class="btn alt ob-back" id="obBack" type="button"' +
      (step ? "" : " hidden") +
      ">" +
      ico("back") +
      "Back</button>" +
      '<button class="btn big ob-next" id="obNext" type="button">' +
      (last ? "Start discovering" : "Continue") +
      ico("next") +
      "</button></div></div></div>";

    root.querySelector("#obNext").onclick = function () {
      if (last) finish();
      else {
        dir = 1;
        step++;
        render();
      }
    };
    root.querySelector("#obBack").onclick = function () {
      dir = -1;
      step--;
      render();
    };
    var cancel = root.querySelector("#obCancel");
    if (cancel) cancel.onclick = close;
    // option buttons update in place (no full re-render, so nothing jumps)
    root.querySelectorAll("[data-chip]").forEach(function (b) {
      b.onclick = function () {
        draft[b.dataset.chip] = b.dataset.val;
        root.querySelectorAll('[data-chip="' + b.dataset.chip + '"]').forEach(function (x) {
          x.setAttribute("aria-checked", x === b);
        });
      };
    });
    root.querySelectorAll("[data-pri]").forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.pri,
          v = +b.dataset.val,
          row = b.closest(".ob-pri"),
          hint = row.querySelector(".ob-hint");
        draft.m[k] = v;
        row.querySelectorAll("[data-pri]").forEach(function (x) {
          x.setAttribute("aria-checked", x === b);
        });
        hint.textContent = HINT[v];
        hint.className = "ob-hint m" + v;
      };
    });
    root.querySelectorAll("[data-key]").forEach(function (el) {
      el.oninput = function () {
        var f = STEPS[step].fields.filter(function (x) {
          return x.key === el.dataset.key;
        })[0];
        draft[f.key] = f.type === "range" ? +el.value : el.value;
        if (f.type === "range") {
          el.style.setProperty("--fill", fill(f, draft[f.key]) + "%");
          document.getElementById("f_" + f.key + "_v").innerHTML = valueHTML(f, draft[f.key]);
        }
      };
    });
  }

  function finish() {
    S.P = draft;
    S.done = 1;
    save();
    close();
    if (opts.onDone) opts.onDone();
  }
  return { open: open };
})();

function prefs() {
  Onboarding.open({
    edit: true,
    onDone: function () {
      if (window.draw) draw();
      if (window.Chat) Chat.refresh();
    },
  });
}
