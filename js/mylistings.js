/* ==========================================================
   mylistings.js - "My listings" page (mylistings.html)
   Owners see the places they listed and edit what students see: cover
   photo, more photos, basics, description, amenities, house rules & bills.
   Edits happen on a working copy (`cur`) and are written with Listings.save()
   only when the owner presses Save. #<id> in the URL picks a listing, #new
   starts a new one.
   ========================================================== */
var ML = (function () {
  var MAX_PHOTOS = 8,
    COVER_PX = 1400,
    PHOTO_PX = 1100,
    QUALITY = 0.74,
    DESC_MAX = 1000;
  // what owners can tick; the first four are also the Rooms filter chips (AMS in data.js)
  var AMEN = AMS.concat([
    "Kitchen",
    "Laundry area",
    "Study area",
    "Electric fan",
    "Bed and mattress",
    "Cabinet",
    "CCTV",
    "Parking",
  ]).filter(function (x, i, a) {
    return a.indexOf(x) === i;
  });
  // [facts key, label, options]; "" = Not stated (students see it as unverified)
  var RULES = [
    [
      "water",
      "Water bill",
      [
        ["", "Not stated"],
        ["incl", "Included in rent"],
        ["extra", "Paid separately"],
      ],
    ],
    [
      "water247",
      "24/7 water supply",
      [
        ["", "Not stated"],
        ["1", "Yes"],
        ["0", "No"],
      ],
    ],
    [
      "elec",
      "Electricity",
      [
        ["", "Not stated"],
        ["incl", "Included in rent"],
        ["extra", "Paid separately"],
      ],
    ],
    [
      "cap",
      "Persons per room",
      [
        ["", "Not stated"],
        ["1", "1 (solo room)"],
        ["2", "2"],
        ["3", "3"],
        ["4", "4"],
        ["6", "6"],
      ],
    ],
    [
      "gender",
      "Who can stay",
      [
        ["", "Not stated"],
        ["female", "Female only"],
        ["male", "Male only"],
        ["mixed", "Male and female"],
      ],
    ],
    [
      "curfew",
      "Curfew",
      [
        ["", "Not stated"],
        ["1", "Yes, there is a curfew"],
        ["0", "No curfew"],
      ],
    ],
    [
      "vis",
      "Visitors",
      [
        ["", "Not stated"],
        ["1", "Allowed"],
        ["0", "Not allowed"],
      ],
    ],
  ];

  var main,
    side,
    cur = null,
    saved = "",
    isNew = false,
    dirty = false,
    busy = 0;

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function blank() {
    return {
      n: "",
      a: "",
      s: SCHOOLS[0],
      t: TYPES[0],
      d: "",
      p: "",
      c: "",
      ds: "",
      am: [],
      facts: {},
      plan: "basic",
      f: 0,
      cover: null,
      photos: [],
    };
  }
  function ago(t) {
    var s = (Date.now() - t) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    if (s < 7 * 86400) return Math.floor(s / 86400) + " d ago";
    return new Date(t).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  }
  function mb(b) {
    return (b / 1048576).toFixed(b < 1048576 ? 2 : 1) + " MB";
  }

  /* ---------- facts <-> select values ---------- */
  function ruleVal(k) {
    var x = (cur.facts || {})[k];
    if (x == null) return "";
    if (k === "gender") return x.length > 1 ? "mixed" : x[0];
    if (typeof x === "boolean") return x ? "1" : "0";
    return String(x);
  }
  function setRule(k, v) {
    var f = cur.facts || (cur.facts = {});
    if (v === "") delete f[k];
    else if (k === "cap") f.cap = +v;
    else if (k === "gender") f.gender = v === "mixed" ? ["male", "female", "mixed"] : [v];
    else if (k === "water247" || k === "curfew" || k === "vis") f[k] = v === "1";
    else f[k] = v;
  }

  /* ---------- side list + head stats ---------- */
  function renderSide() {
    var list = Listings.mine(),
      cc = window.Comments ? Comments.counts() : {},
      photos = 0,
      comments = 0;
    list.forEach(function (r) {
      photos += (r.cover ? 1 : 0) + (r.photos || []).length;
      comments += cc[r.id] || 0;
    });
    $("mlStats").innerHTML = list.length
      ? "<span><b>" +
        list.length +
        "</b> " +
        (list.length === 1 ? "listing" : "listings") +
        "</span><span><b>" +
        photos +
        "</b> photos</span><span><b>" +
        comments +
        "</b> comments</span>"
      : "";
    side.innerHTML =
      (isNew
        ? '<button type="button" class="ml-item on" aria-current="true"><span class="ml-th">' +
          ico("plus") +
          '</span><span class="ml-it-t"><b>' +
          esc(cur.n || "New listing") +
          "</b><small>Not saved yet</small></span></button>"
        : "") +
      list
        .map(function (r) {
          var on = !isNew && cur && cur.id === r.id;
          return (
            '<button type="button" class="ml-item' +
            (on ? " on" : "") +
            '" data-id="' +
            r.id +
            '"' +
            (on ? ' aria-current="true"' : "") +
            ">" +
            '<span class="ml-th">' +
            (r.cover || (r.photos || [])[0]
              ? '<img src="' + esc(r.cover || r.photos[0]) + '" alt="">'
              : ico("image")) +
            "</span>" +
            '<span class="ml-it-t"><b>' +
            esc(r.n) +
            "</b><small>" +
            (r.p == null ? "Rate on request" : peso(r.p) + " / mo") +
            " · " +
            esc(r.a) +
            "</small>" +
            '<small class="ml-upd">Updated ' +
            ago(r.upd || r.at) +
            (cc[r.id] ? " · " + cc[r.id] + (cc[r.id] === 1 ? " comment" : " comments") : "") +
            "</small></span>" +
            (r.f ? '<span class="ml-feat">Featured</span>' : "") +
            "</button>"
          );
        })
        .join("") +
      (list.length || isNew
        ? '<button type="button" class="ml-item ml-new" id="mlNew2">' +
          ico("plus") +
          "<span>Add another place</span></button>"
        : "");
    var u = Listings.usage(),
      pct = Math.min(100, Math.round((u.used / u.limit) * 100));
    $("mlUse").innerHTML =
      '<div class="ml-use-bar' +
      (pct > 80 ? " hi" : "") +
      '"><i style="width:' +
      pct +
      '%"></i></div><span>This browser is using <b>' +
      mb(u.used) +
      "</b> of about " +
      mb(u.limit) +
      ". Photos take the most space.</span>";
  }

  /* ---------- editor ---------- */
  function opts(arr, v) {
    return arr
      .map(function (o) {
        var val = typeof o === "string" ? o : o[0],
          lab = typeof o === "string" ? o : o[1];
        return (
          '<option value="' +
          esc(val) +
          '"' +
          (String(v) === val ? " selected" : "") +
          ">" +
          esc(lab) +
          "</option>"
        );
      })
      .join("");
  }

  function renderEmpty() {
    main.innerHTML =
      '<div class="ml-empty"><span class="ml-empty-i">' +
      ico("door") +
      "</span><h2>You haven’t listed a place yet</h2>" +
      "<p>Add your boarding house, dorm or apartment so students near MSU-IIT can find it. You can add photos, rules and bills any time.</p>" +
      '<div class="ml-empty-acts"><button class="btn" type="button" id="mlStart">' +
      ico("plus") +
      'Create a listing</button><a class="btn alt" href="index.html#owners">See owner plans</a></div></div>';
  }

  function renderEditor() {
    if (!cur) {
      renderEmpty();
      renderSide();
      return;
    }
    var noRate = cur.p === null;
    main.innerHTML =
      '<div class="ml-ed">' +
      '<div class="ml-ed-head"><div><span class="ml-state' +
      (isNew ? " draft" : "") +
      '">' +
      (isNew ? "Draft · not on DormNamo yet" : "Live on Rooms and Discover") +
      "</span>" +
      '<h2 id="mlTitle">' +
      esc(cur.n || "New listing") +
      "</h2></div>" +
      '<button class="btn alt sm" type="button" id="mlPrev"' +
      (isNew ? " disabled" : "") +
      ">" +
      ico("eye") +
      "Preview as a student</button></div>" +
      // photos
      '<div class="ml-card" id="mlPhotos"><div class="ml-card-h"><h3>' +
      ico("image") +
      'Photos</h3><span class="meta">Listings with real photos get far more clicks.</span></div>' +
      '<div class="ml-cover" id="mlCover"></div>' +
      '<div class="ml-gal-h"><b>More photos</b><span class="meta" id="mlCount"></span></div>' +
      '<div class="ml-gal" id="mlGal"></div>' +
      '<p class="ml-rule">' +
      ico("alert") +
      "<span>Only upload photos you took yourself or have permission to use. Never copy photos from Google Maps or Facebook.</span></p>" +
      '<input type="file" id="mlCoverIn" accept="image/*" hidden><input type="file" id="mlGalIn" accept="image/*" multiple hidden></div>' +
      // basics
      '<div class="ml-card"><div class="ml-card-h"><h3>' +
      ico("edit") +
      'Basics</h3></div><div class="ml-form">' +
      '<label class="full">Property name<input type="text" data-k="n" maxlength="80" value="' +
      esc(cur.n) +
      '" placeholder="e.g. Sunrise Boarding House"></label>' +
      '<label>Area or barangay<input type="text" data-k="a" maxlength="60" value="' +
      esc(cur.a) +
      '" placeholder="e.g. Tibanga"></label>' +
      '<label>Room type<select data-k="t" id="mlT">' +
      opts(TYPES, cur.t) +
      "</select></label>" +
      '<label>Near<select data-k="s" id="mlS">' +
      opts(SCHOOLS, cur.s) +
      "</select></label>" +
      '<label>Distance to campus (km)<input type="number" data-k="d" min="0" max="50" step="0.1" inputmode="decimal" value="' +
      esc(cur.d == null ? "" : cur.d) +
      '" placeholder="e.g. 0.6"></label>' +
      '<div class="ml-fld"><label for="mlP">Monthly rent (₱)</label><input type="number" id="mlP" data-k="p" min="300" step="50" inputmode="numeric" value="' +
      esc(cur.p == null ? "" : cur.p) +
      '" placeholder="e.g. 2500"' +
      (noRate ? " disabled" : "") +
      ">" +
      '<label class="ml-check"><input type="checkbox" id="mlNoRate"' +
      (noRate ? " checked" : "") +
      ">Rate on request (don’t show a price)</label></div>" +
      '<label>Contact number<input type="tel" id="mlC" data-k="c" value="' +
      esc(cur.c) +
      '" placeholder="0917 123 4567"></label>' +
      "</div></div>" +
      // description
      '<div class="ml-card"><div class="ml-card-h"><h3>' +
      ico("chat") +
      'Description</h3><span class="meta">What should a student know before visiting?</span></div>' +
      '<div class="ml-ta"><textarea data-k="ds" id="mlD" rows="6" maxlength="' +
      DESC_MAX +
      '" placeholder="Rooms, what the rent includes, the walk to campus, nearby stores, house rules…">' +
      esc(cur.ds) +
      '</textarea><span class="ml-cnt" id="mlDc"></span></div>' +
      '<div class="ml-tips"><span class="meta">Ideas:</span>' +
      ["How many beds per room", "What the rent includes", "Walk to the gate", "Nearby stores and eateries"]
        .map(function (t) {
          return '<span class="ml-tip">' + esc(t) + "</span>";
        })
        .join("") +
      "</div></div>" +
      // amenities
      '<div class="ml-card"><div class="ml-card-h"><h3>' +
      ico("check") +
      'Amenities</h3><span class="meta">Tick only what every tenant gets.</span></div>' +
      '<div class="chips ml-chips" id="mlAm">' +
      AMEN.map(function (a) {
        return (
          '<button type="button" class="chip" data-am="' +
          esc(a) +
          '" aria-pressed="' +
          ((cur.am || []).indexOf(a) >= 0) +
          '">' +
          ico("check", "ml-ok") +
          esc(a) +
          "</button>"
        );
      }).join("") +
      "</div></div>" +
      // rules & bills
      '<div class="ml-card"><div class="ml-card-h"><h3>' +
      ico("sliders") +
      'House rules and bills</h3><span class="meta">Not sure? Leave it as “Not stated”. Students see it as unverified and can ask you.</span></div>' +
      '<div class="ml-form ml-rules">' +
      RULES.map(function (r) {
        return (
          "<label>" +
          esc(r[1]) +
          '<select data-rule="' +
          r[0] +
          '" id="mlR_' +
          r[0] +
          '">' +
          opts(r[2], ruleVal(r[0])) +
          "</select></label>"
        );
      }).join("") +
      "</div></div>" +
      (isNew
        ? ""
        : '<div class="ml-card ml-danger"><div><b>Delete this listing</b><span class="meta">Removes it from Rooms and Discover. This can’t be undone.</span></div><button type="button" class="ml-delbtn" id="mlDel">' +
          ico("trash") +
          "Delete listing</button></div>") +
      "</div>" +
      '<div class="ml-bar" id="mlBar" role="region" aria-label="Save changes"><span class="ml-bar-msg" id="mlBarMsg" aria-live="polite"></span><div class="ml-bar-acts"><button class="btn alt sm" type="button" id="mlDiscard">Discard</button><button class="btn sm" type="button" id="mlSave">' +
      ico("check") +
      "Save changes</button></div></div>";

    phoneField($("mlC"));
    if (window.Dropdown)
      main.querySelectorAll("select").forEach(function (s) {
        Dropdown.enhance(s);
      });
    renderPhotos();
    descCount();
    bar();
    renderSide();
  }

  function renderPhotos() {
    var c = $("mlCover"),
      g = $("mlGal");
    if (!c) return;
    c.innerHTML = cur.cover
      ? '<img src="' +
        esc(cur.cover) +
        '" alt="Cover photo"><span class="ml-cover-tag">' +
        ico("star") +
        "Cover</span>" +
        '<div class="ml-cover-acts"><button type="button" class="ml-pill" data-act="cover-pick">' +
        ico("image") +
        'Change cover</button><button type="button" class="ml-pill" data-act="cover-del">' +
        ico("trash") +
        "Remove</button></div>"
      : '<button type="button" class="ml-drop" data-act="cover-pick"><span class="ml-drop-i">' +
        ico("image") +
        "</span><b>Add a cover photo</b><span>Drag a photo here or click to choose. A wide shot of the building or your best room works well.</span></button>";
    var n = cur.photos.length;
    g.innerHTML =
      cur.photos
        .map(function (src, i) {
          return (
            '<figure class="ml-tile"><img src="' +
            esc(src) +
            '" alt="Photo ' +
            (i + 1) +
            '"><span class="ml-num">' +
            (i + 1) +
            "</span>" +
            '<figcaption class="ml-tile-acts">' +
            '<button type="button" data-act="left" data-i="' +
            i +
            '" aria-label="Move photo ' +
            (i + 1) +
            ' left"' +
            (i ? "" : " disabled") +
            ">" +
            ico("back") +
            "</button>" +
            '<button type="button" data-act="make-cover" data-i="' +
            i +
            '" aria-label="Use photo ' +
            (i + 1) +
            ' as cover" title="Use as cover">' +
            ico("star") +
            "</button>" +
            '<button type="button" data-act="del" data-i="' +
            i +
            '" aria-label="Remove photo ' +
            (i + 1) +
            '" title="Remove">' +
            ico("trash") +
            "</button>" +
            '<button type="button" data-act="right" data-i="' +
            i +
            '" aria-label="Move photo ' +
            (i + 1) +
            ' right"' +
            (i < n - 1 ? "" : " disabled") +
            ">" +
            ico("next") +
            "</button>" +
            "</figcaption></figure>"
          );
        })
        .join("") +
      new Array(busy + 1).join(
        '<div class="ml-tile ml-busy" aria-label="Adding photo"><span class="ml-spin"></span></div>',
      ) +
      (n + busy < MAX_PHOTOS
        ? '<button type="button" class="ml-add" data-act="add">' +
          ico("plus") +
          "<b>Add photos</b><small>" +
          (MAX_PHOTOS - n - busy) +
          " more allowed</small></button>"
        : "");
    $("mlCount").textContent = n + " / " + MAX_PHOTOS;
  }

  function descCount() {
    var t = $("mlD");
    if (t) $("mlDc").textContent = t.value.length + " / " + DESC_MAX;
  }

  function bar() {
    var b = $("mlBar");
    if (!b) return;
    var on = dirty || isNew;
    b.classList.toggle("dirty", on);
    $("mlBarMsg").innerHTML = isNew
      ? "<i></i>New listing · not saved yet"
      : dirty
        ? "<i></i>Unsaved changes"
        : ico("done") + "All changes saved";
    $("mlSave").disabled = !on || busy > 0;
    $("mlDiscard").hidden = !on;
    $("mlSave").lastChild.textContent = isNew ? "Publish listing" : "Save changes";
  }
  function touch() {
    dirty = true;
    bar();
  }

  /* ---------- photos ---------- */
  function addFiles(files, toCover) {
    files = Array.prototype.filter.call(files || [], function (f) {
      return /^image\//.test(f.type);
    });
    if (!files.length) {
      toast("Choose a photo (JPG or PNG).");
      return;
    }
    var extra = [];
    if (toCover) {
      extra = files.slice(1);
      files = files.slice(0, 1);
    }
    var room = MAX_PHOTOS - cur.photos.length - busy;
    extra = extra.slice(0, Math.max(0, room));
    if (!toCover && files.length > room) {
      toast("Up to " + MAX_PHOTOS + " photos. Added the first " + Math.max(0, room) + ".");
      files = files.slice(0, Math.max(0, room));
    }
    var jobs = files
      .map(function (f) {
        return [f, toCover];
      })
      .concat(
        extra.map(function (f) {
          return [f, false];
        }),
      );
    if (!jobs.length) return;
    var me = cur;
    busy += jobs.filter(function (j) {
      return !j[1];
    }).length;
    renderPhotos();
    bar();
    (function next() {
      var j = jobs.shift();
      if (!j) return;
      Listings.shrink(j[0], j[1] ? COVER_PX : PHOTO_PX, QUALITY, function (err, url) {
        if (!j[1]) busy--;
        if (me !== cur) return; // owner switched listings meanwhile
        if (err)
          toast(err === "big" ? "That photo is over 25 MB." : "Couldn’t read that photo. Try a JPG or PNG.");
        else if (j[1]) cur.cover = url;
        else cur.photos.push(url);
        touch();
        renderPhotos();
        bar();
        renderSide();
        next();
      });
    })();
  }

  function photoAct(act, i) {
    var p = cur.photos;
    if (act === "cover-pick") $("mlCoverIn").click();
    else if (act === "add") $("mlGalIn").click();
    else if (act === "cover-del") {
      cur.cover = null;
    } else if (act === "del") p.splice(i, 1);
    else if (act === "left" && i > 0) p.splice(i - 1, 0, p.splice(i, 1)[0]);
    else if (act === "right" && i < p.length - 1) p.splice(i + 1, 0, p.splice(i, 1)[0]);
    else if (act === "make-cover") {
      var old = cur.cover;
      cur.cover = p[i];
      if (old) p[i] = old;
      else p.splice(i, 1);
      toast("Cover photo changed");
    } else return;
    if (act !== "cover-pick" && act !== "add") {
      touch();
      renderPhotos();
    }
  }

  /* ---------- save / discard / delete ---------- */
  function collect() {
    var r = clone(cur),
      noRate = $("mlNoRate") && $("mlNoRate").checked;
    r.n = String(r.n || "").trim();
    r.a = String(r.a || "").trim();
    r.ds = String(r.ds || "").trim();
    r.d = r.d === "" || r.d == null ? null : Math.round(+r.d * 10) / 10;
    r.p = noRate || r.p === "" || r.p == null ? null : Math.round(+r.p);
    r.c = fmtPhone(r.c || "");
    // keep the "Water included" amenity chip in step with the water rule (it is also a Rooms filter)
    var w = (r.facts || {}).water,
      k = r.am.indexOf("Water included");
    if (w === "incl" && k < 0) r.am.push("Water included");
    if (w === "extra" && k >= 0) r.am.splice(k, 1);
    return r;
  }
  function check(r) {
    var bad = [];
    if (!r.n) bad.push(["n", "Add the property name"]);
    if (!r.a) bad.push(["a", "Add the area or barangay"]);
    if (r.d == null || isNaN(r.d) || r.d < 0 || r.d > 50)
      bad.push(["d", "Add the distance to campus (0 to 50 km)"]);
    var noRate = $("mlNoRate") && $("mlNoRate").checked;
    if (!noRate && (r.p == null || isNaN(r.p) || r.p < 300))
      bad.push(["p", "Add the monthly rent (at least ₱300), or tick Rate on request"]);
    if (!phoneOk(r.c)) bad.push(["c", "Add an 11-digit mobile number"]);
    return bad;
  }
  function doSave() {
    if (!cur || busy) return;
    var r = collect(),
      bad = check(r);
    main.querySelectorAll(".bad").forEach(function (el) {
      el.classList.remove("bad");
    });
    if (bad.length) {
      bad.forEach(function (b) {
        var el = main.querySelector('[data-k="' + b[0] + '"]');
        if (el) el.classList.add("bad");
      });
      var first = main.querySelector('[data-k="' + bad[0][0] + '"]');
      if (first) {
        first.focus({ preventScroll: true });
        first.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      $("mlBarMsg").innerHTML =
        '<i class="err"></i>' + esc(bad[0][1]) + (bad.length > 1 ? " (+" + (bad.length - 1) + " more)" : "");
      return;
    }
    var res = Listings.save(r);
    if (res.error) {
      toast(
        res.error === "full"
          ? "This browser is out of space. Remove a few photos and try again."
          : "Couldn’t save. Try again.",
      );
      return;
    }
    var wasNew = isNew;
    cur = clone(res.rec);
    saved = JSON.stringify(cur);
    isNew = false;
    dirty = false;
    history.replaceState(null, "", "#" + cur.id);
    renderEditor();
    toast(wasNew ? "Published. Students can find it now." : "Saved. Students see the changes now.");
  }
  function discard() {
    if (isNew) {
      isNew = false;
      cur = null;
      dirty = false;
      history.replaceState(null, "", location.pathname);
      pick();
      return;
    }
    cur = JSON.parse(saved);
    dirty = false;
    renderEditor();
    toast("Changes discarded");
  }
  function select(id) {
    var r = Listings.get(id);
    if (!r || !USER || r.uid !== USER.id) return false;
    cur = clone(r);
    cur.photos = cur.photos || [];
    cur.am = cur.am || [];
    cur.facts = cur.facts || {};
    saved = JSON.stringify(cur);
    isNew = false;
    dirty = false;
    history.replaceState(null, "", "#" + id);
    renderEditor();
    return true;
  }
  function startNew() {
    cur = blank();
    saved = "";
    isNew = true;
    dirty = false;
    history.replaceState(null, "", "#new");
    renderEditor();
    var n = main.querySelector('[data-k="n"]');
    if (n) n.focus();
  }
  /** Pick from the URL hash, else the most recent listing, else the empty state. */
  function pick() {
    var h = location.hash.slice(1);
    if (h === "new") return startNew();
    if (h && select(+h)) return;
    var m = Listings.mine();
    if (m.length) select(m[0].id);
    else {
      cur = null;
      history.replaceState(null, "", location.pathname);
      renderEditor();
    }
  }
  function guard() {
    // switching away with unsaved edits: nudge the save bar instead
    if (!dirty && !isNew) return true;
    var b = $("mlBar");
    if (b) {
      b.classList.remove("nudge");
      void b.offsetWidth;
      b.classList.add("nudge");
    }
    toast("Save or discard your changes first");
    return false;
  }

  /* ---------- events ---------- */
  function onField(e) {
    var el = e.target;
    if (!cur) return;
    if (el.id === "mlNoRate") {
      var p = $("mlP");
      p.disabled = el.checked;
      if (el.checked) {
        cur.p = null;
        p.value = "";
      } else {
        cur.p = "";
        p.focus();
      }
      touch();
      return;
    }
    if (el.id === "mlCoverIn" || el.id === "mlGalIn") {
      addFiles(el.files, el.id === "mlCoverIn");
      el.value = "";
      return;
    }
    if (el.dataset.k) {
      cur[el.dataset.k] = el.value;
      el.classList.remove("bad");
      if (el.dataset.k === "n") {
        $("mlTitle").textContent = el.value || "New listing";
        if (isNew) renderSide();
      }
      if (el.dataset.k === "ds") descCount();
      touch();
    } else if (el.dataset.rule) {
      setRule(el.dataset.rule, el.value);
      touch();
    }
  }

  function init() {
    main = $("mlMain");
    side = $("mlList");
    main.addEventListener("input", function (e) {
      if (e.target.type !== "file" && e.target.type !== "checkbox") onField(e);
    }); // those two are handled on change
    main.addEventListener("change", function (e) {
      if (e.target.tagName === "SELECT" || e.target.type === "checkbox" || e.target.type === "file")
        onField(e);
    });
    main.addEventListener("click", function (e) {
      var a = e.target.closest("[data-act]");
      if (a && !a.disabled) {
        photoAct(a.dataset.act, +a.dataset.i);
        return;
      }
      var chip = e.target.closest("[data-am]");
      if (chip) {
        var v = chip.dataset.am,
          i = cur.am.indexOf(v);
        if (i >= 0) cur.am.splice(i, 1);
        else cur.am.push(v);
        chip.setAttribute("aria-pressed", i < 0);
        touch();
        return;
      }
      var t = e.target.closest("button");
      if (!t) return;
      if (t.id === "mlSave") doSave();
      else if (t.id === "mlDiscard") discard();
      else if (t.id === "mlStart") startNew();
      else if (t.id === "mlPrev") {
        if (dirty) toast("Showing the last saved version");
        open(cur.id);
      } else if (t.id === "mlDel") {
        if (!t.classList.contains("sure")) {
          t.classList.add("sure");
          t.lastChild.textContent = "Click again to delete";
          setTimeout(function () {
            if (t.isConnected) {
              t.classList.remove("sure");
              t.lastChild.textContent = "Delete listing";
            }
          }, 3500);
          return;
        }
        var name = cur.n;
        if (!Listings.remove(cur.id)) {
          toast("Couldn’t delete. Try again.");
          return;
        }
        cur = null;
        dirty = false;
        history.replaceState(null, "", location.pathname);
        pick();
        toast("Deleted " + name);
      }
    });
    // drag photos onto the photo card: on the cover box = new cover, anywhere else = more photos
    main.addEventListener("dragover", function (e) {
      var z = e.target.closest("#mlPhotos");
      if (!z) return;
      e.preventDefault();
      z.classList.add("drop");
      var c = e.target.closest("#mlCover");
      $("mlCover").classList.toggle("drop", !!c);
    });
    main.addEventListener("dragleave", function (e) {
      var z = e.target.closest("#mlPhotos");
      if (z && !z.contains(e.relatedTarget)) {
        z.classList.remove("drop");
        $("mlCover").classList.remove("drop");
      }
    });
    main.addEventListener("drop", function (e) {
      var z = e.target.closest("#mlPhotos");
      if (!z) return;
      e.preventDefault();
      z.classList.remove("drop");
      $("mlCover").classList.remove("drop");
      addFiles(e.dataTransfer.files, !!e.target.closest("#mlCover") || !cur.cover);
    });
    side.addEventListener("click", function (e) {
      var b = e.target.closest(".ml-item");
      if (!b) return;
      if (b.id === "mlNew2") {
        if (guard()) startNew();
        return;
      }
      if (b.dataset.id && +b.dataset.id !== (cur && cur.id) && guard()) {
        select(+b.dataset.id);
        main.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && cur) {
        e.preventDefault();
        doSave();
      }
    });
    window.addEventListener("beforeunload", function (e) {
      if (dirty || (isNew && cur && cur.n)) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    pick();
  }
  return { init: init };
})();

function pageInit() {
  ML.init();
}
