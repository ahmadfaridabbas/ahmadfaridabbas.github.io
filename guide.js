/* API Testing Guide — theme toggle (shares the portfolio's "afa-theme" key),
   table-of-contents highlighting, and a collapsed TOC on small screens. */
(function () {
  "use strict";

  var root = document.documentElement;
  var THEME_KEY = "afa-theme";

  function applyTheme(theme, persist) {
    root.setAttribute("data-theme", theme);
    var button = document.getElementById("themeToggle");
    if (button) {
      button.setAttribute("aria-pressed", String(theme === "dark"));
      button.setAttribute("title", "Switch to " + (theme === "dark" ? "light" : "dark") + " theme");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#101211" : "#f2f1e8");
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* storage unavailable */ }
    }
  }

  applyTheme(root.getAttribute("data-theme") === "light" ? "light" : "dark", false);

  var toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
    });
  }

  document.querySelectorAll("[data-year]").forEach(function (node) {
    node.textContent = String(new Date().getFullYear());
  });

  // ---- Chapter progress -------------------------------------------------
  // Stored in sessionStorage on purpose: it survives reloads and navigation within the tab,
  // but is cleared when the tab/window is closed, so a new visit starts fresh.
  var PROGRESS_KEY = "afa-qa-guide-done";
  var memory = [];
  function readDone() {
    try {
      var raw = sessionStorage.getItem(PROGRESS_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(function (x) { return typeof x === "string"; }) : [];
    } catch (e) { return memory.slice(); }
  }
  function writeDone(list) {
    memory = list.slice();
    try { sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }

  var doneBtn = document.getElementById("guideDoneBtn");
  var doneBox = document.querySelector(".guide-done");
  var donePill = document.getElementById("guideDonePill");
  if (doneBtn && doneBox) {
    var slug = doneBox.getAttribute("data-chapter");
    var renderChapter = function () {
      var done = readDone().indexOf(slug) !== -1;
      doneBox.classList.toggle("is-done", done);
      doneBtn.setAttribute("aria-pressed", String(done));
      doneBtn.querySelector(".guide-done-label").textContent = done ? "✓ Done — undo" : "Mark as done";
      if (donePill) donePill.hidden = !done;
    };
    doneBtn.addEventListener("click", function () {
      var list = readDone();
      var i = list.indexOf(slug);
      if (i === -1) list.push(slug); else list.splice(i, 1);
      writeDone(list);
      renderChapter();
    });
    renderChapter();
  }

  var cards = document.querySelectorAll("#guideCards [data-chapter]");
  if (cards.length) {
    var progress = document.getElementById("guideTracker");
    var progressText = document.getElementById("guideProgressText");
    var resetBtn = document.getElementById("guideProgressReset");
    var renderHub = function () {
      var list = readDone();
      var count = 0;
      cards.forEach(function (card) {
        var done = list.indexOf(card.getAttribute("data-chapter")) !== -1;
        if (done) count++;
        card.classList.toggle("is-done", done);
        var badge = card.querySelector(".guide-card-status");
        if (badge) badge.hidden = !done;
      });
      if (progress) progress.hidden = count === 0;
      if (progressText) progressText.textContent = count + " of " + cards.length + " chapters done";
    };
    if (resetBtn) {
      resetBtn.addEventListener("click", function () { writeDone([]); renderHub(); });
    }
    // Refresh when returning via back/forward cache.
    window.addEventListener("pageshow", renderHub);
    renderHub();
  }

  // Collapse the TOC on narrow screens (it is open by default for no-JS and desktop).
  var details = document.querySelector(".guide-toc-details");
  var narrow = window.matchMedia ? window.matchMedia("(max-width: 960px)") : null;
  if (details && narrow && narrow.matches) details.removeAttribute("open");

  // Hub: filter the question index.
  var search = document.getElementById("guideSearch");
  if (search) {
    var items = Array.prototype.slice.call(document.querySelectorAll("#guideIndex [data-q]"));
    var groups = Array.prototype.slice.call(document.querySelectorAll("#guideIndex [data-group]"));
    var status = document.getElementById("guideSearchStatus");
    search.addEventListener("input", function () {
      var terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
      var shown = 0;
      items.forEach(function (li) {
        var text = li.textContent.toLowerCase();
        var match = terms.every(function (t) { return text.indexOf(t) !== -1; });
        li.hidden = !match;
        if (match) shown++;
      });
      groups.forEach(function (g) {
        g.hidden = !g.querySelector("[data-q]:not([hidden])");
      });
      if (status) {
        status.textContent = terms.length
          ? (shown ? shown + " of " + items.length + " questions" : "No matching questions.")
          : "";
      }
    });
  }

  // Highlight the section currently being read.
  var links = Array.prototype.slice.call(document.querySelectorAll("#guideToc a"));
  if (!links.length || !("IntersectionObserver" in window)) return;
  var tocBox = document.querySelector(".guide-toc");
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });

  function setCurrent(id) {
    links.forEach(function (a) {
      if (a === byId[id]) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    // Keep the active entry visible inside the (scrollable) sticky TOC without moving the page.
    var active = byId[id];
    if (active && tocBox && tocBox.scrollHeight > tocBox.clientHeight) {
      var top = active.offsetTop;
      if (top < tocBox.scrollTop || top > tocBox.scrollTop + tocBox.clientHeight - 60) {
        tocBox.scrollTop = Math.max(0, top - tocBox.clientHeight / 3);
      }
    }
  }

  var visible = {};
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
    for (var i = 0; i < links.length; i++) {
      var id = links[i].getAttribute("href").slice(1);
      if (visible[id]) { setCurrent(id); return; }
    }
  }, { rootMargin: "-90px 0px -60% 0px", threshold: 0 });

  Object.keys(byId).forEach(function (id) {
    var section = document.getElementById(id);
    if (section) observer.observe(section);
  });
})();
