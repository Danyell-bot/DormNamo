/* ==========================================================
   select.js - styled dropdowns (search bar, filters, sort, owner form)
   Dropdown.enhance(select) keeps the real <select> (hidden) as the
   source of truth, so browse.js keeps reading .value as before.
   Keyboard: arrows, Home/End, Enter/Space, Esc, Tab, type-to-jump.
   ========================================================== */
var Dropdown = (function () {
  var current = null,
    uid = 0;

  function enhance(sel) {
    if (!sel || sel.dataset.dd) return;
    sel.dataset.dd = "1";
    var wrap = sel.parentNode,
      n = ++uid,
      active = 0,
      typed = "",
      typedAt = 0;
    var pl = wrap.querySelector(".pl");
    var labelText = pl
      ? pl.textContent
      : wrap.firstChild && wrap.firstChild.nodeType === 3
        ? wrap.firstChild.textContent.trim()
        : "";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dd-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "dd" + n);
    btn.innerHTML = '<span class="dd-val"></span>' + ico("chev", "dd-chev");
    var list = document.createElement("ul");
    list.className = "dd-list";
    list.id = "dd" + n;
    list.hidden = true;
    list.tabIndex = -1;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", labelText);
    sel.classList.add("dd-native");
    sel.tabIndex = -1;
    sel.setAttribute("aria-hidden", "true");
    wrap.insertBefore(btn, sel); // the button becomes the label's control
    wrap.appendChild(list);
    wrap.classList.add("dd");

    function text(i) {
      return sel.options[i] ? sel.options[i].text : "";
    }
    function sync() {
      btn.querySelector(".dd-val").textContent = text(sel.selectedIndex);
      btn.setAttribute("aria-label", labelText + ": " + text(sel.selectedIndex));
    }
    function build() {
      list.innerHTML = Array.prototype.map
        .call(sel.options, function (o, i) {
          return (
            '<li role="option" id="dd' +
            n +
            "_" +
            i +
            '" data-i="' +
            i +
            '" aria-selected="' +
            (i === sel.selectedIndex) +
            '">' +
            ico("check", "dd-ok") +
            "<span>" +
            esc(o.text) +
            "</span></li>"
          );
        })
        .join("");
    }
    function setActive(i) {
      var items = list.children;
      if (!items.length) return;
      active = Math.max(0, Math.min(items.length - 1, i));
      Array.prototype.forEach.call(items, function (li, k) {
        li.classList.toggle("act", k === active);
      });
      list.setAttribute("aria-activedescendant", items[active].id);
      items[active].scrollIntoView({ block: "nearest" });
    }
    function open() {
      if (current && current !== api) current.close(false);
      build();
      list.hidden = false;
      wrap.classList.add("dd-open");
      btn.setAttribute("aria-expanded", "true");
      setActive(sel.selectedIndex);
      list.focus({ preventScroll: true });
      current = api;
    }
    function close(focusBtn) {
      if (list.hidden) return;
      list.hidden = true;
      wrap.classList.remove("dd-open");
      btn.setAttribute("aria-expanded", "false");
      if (current === api) current = null;
      if (focusBtn) btn.focus({ preventScroll: true });
    }
    function choose(i) {
      if (i !== sel.selectedIndex) {
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      sync();
      close(true);
    }

    btn.onclick = function (e) {
      e.preventDefault();
      if (list.hidden) open();
      else close(true);
    };
    btn.onkeydown = function (e) {
      if (/^(ArrowDown|ArrowUp)$/.test(e.key)) {
        e.preventDefault();
        open();
      }
    };
    list.onclick = function (e) {
      e.preventDefault(); // stops the <label> from re-opening the list
      var li = e.target.closest("li");
      if (li) choose(+li.dataset.i);
    };
    list.onmousemove = function (e) {
      var li = e.target.closest("li");
      if (li && +li.dataset.i !== active) setActive(+li.dataset.i);
    };
    list.onkeydown = function (e) {
      var k = e.key;
      if (k === "ArrowDown") {
        e.preventDefault();
        setActive(active + 1);
      } else if (k === "ArrowUp") {
        e.preventDefault();
        setActive(active - 1);
      } else if (k === "Home") {
        e.preventDefault();
        setActive(0);
      } else if (k === "End") {
        e.preventDefault();
        setActive(sel.options.length - 1);
      } else if (k === "Enter" || k === " ") {
        e.preventDefault();
        choose(active);
      } else if (k === "Escape") {
        e.preventDefault();
        close(true);
      } else if (k === "Tab") close(false);
      else if (k.length === 1) {
        // type to jump: "a" -> "Apartment"
        var now = Date.now();
        typed = (now - typedAt > 700 ? "" : typed) + k.toLowerCase();
        typedAt = now;
        for (var j = 0; j < sel.options.length; j++) {
          var t = (active + (typed.length > 1 ? 0 : 1) + j) % sel.options.length;
          if (text(t).toLowerCase().indexOf(typed) === 0) {
            setActive(t);
            break;
          }
        }
      }
    };
    list.addEventListener("focusout", function (e) {
      if (!wrap.contains(e.relatedTarget)) close(false);
    });

    if (sel.form)
      sel.form.addEventListener("reset", function () {
        setTimeout(sync, 0);
      }); // reset() changes the value without a change event

    var api = { wrap: wrap, close: close, sync: sync };
    sel._dd = api;
    sync();
    return api;
  }

  document.addEventListener("pointerdown", function (e) {
    if (current && !current.wrap.contains(e.target)) current.close(false);
  });
  /** Call after code sets select.value, so the styled button shows the new choice. */
  function sync(sel) {
    if (sel && sel._dd) sel._dd.sync();
  }
  return { enhance: enhance, sync: sync };
})();

["qNear", "qBudget", "qType", "fNear", "sort", "aT", "aS", "aPlan"].forEach(function (id) {
  Dropdown.enhance(document.getElementById(id));
});
