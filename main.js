/* Ahmad Farid Abbas — progressively enhanced, dependency-free interactions. */
(function () {
  "use strict";

  if (typeof document === "undefined") return;
  const doc = document;
  const win = typeof window !== "undefined" ? window : doc.defaultView;
  if (!win || !doc.documentElement) return;
  let started = false;

  function start() {
    if (started) return;
    started = true;

    const root = doc.documentElement;
    if (!root.classList || typeof root.setAttribute !== "function" || typeof doc.createElement !== "function") return;
    const PROFILE_URL = "https://github.com/ahmadfaridabbas";
    const THEME_KEY = "afa-theme";
    const MOTION_KEY = "afa-motion";
    const noop = function () {};
    const themeSubscribers = [];
    const motionSubscribers = [];
    const layoutSubscribers = [];
    let pageVisible = doc.visibilityState !== "hidden";
    let themePreference = readPreference(THEME_KEY, ["dark", "light"]);
    let motionPreference = readPreference(MOTION_KEY, ["on", "off"]) || "on";
    let theme = "dark";
    let motionEnabled = false;
    let activeDialog = null;
    let closeMenu = noop;
    let refreshLayout = noop;
    let dialogs = { open: function () { return false; }, close: noop };
    let toastTimer = 0;
    let copyGeneration = 0;
    const themeMedia = mediaQuery("(prefers-color-scheme: light)");
    const reducedMedia = mediaQuery("(prefers-reduced-motion: reduce)");
    const pointerMedia = mediaQuery("(hover: hover) and (pointer: fine)");
    const canFrame = typeof win.requestAnimationFrame === "function" &&
      typeof win.cancelAnimationFrame === "function";

    function byId(id) {
      return typeof doc.getElementById === "function" ? doc.getElementById(id) : null;
    }

    function all(selector, parent) {
      const scope = parent || doc;
      return typeof scope.querySelectorAll === "function"
        ? Array.from(scope.querySelectorAll(selector)) : [];
    }

    function query(selector, parent) {
      const scope = parent || doc;
      return typeof scope.querySelector === "function" ? scope.querySelector(selector) : null;
    }

    function closest(element, selector) {
      return element && typeof element.closest === "function" ? element.closest(selector) : null;
    }

    function listen(target, event, handler, options) {
      if (!target || typeof target.addEventListener !== "function") return noop;
      target.addEventListener(event, handler, options);
      return function () { target.removeEventListener(event, handler, options); };
    }

    function safely(initialize) {
      // A missing optional hook or unsupported visual API must not disable other controls.
      try { initialize(); } catch (_) { /* Progressive enhancement stays optional. */ }
    }

    function notify(subscribers, value) {
      subscribers.slice().forEach(function (subscriber) {
        try { subscriber(value); } catch (_) { /* Isolate optional enhancements. */ }
      });
    }

    function readPreference(key, allowed) {
      try {
        const value = win.localStorage.getItem(key);
        return allowed.indexOf(value) !== -1 ? value : null;
      } catch (_) { return null; }
    }

    function savePreference(key, value) {
      try { win.localStorage.setItem(key, value); } catch (_) { /* Session state still works. */ }
    }

    function mediaQuery(value) {
      try {
        return typeof win.matchMedia === "function" ? win.matchMedia(value) : { matches: false };
      } catch (_) { return { matches: false }; }
    }

    function watchMedia(media, callback) {
      try {
        if (typeof media.addEventListener === "function") media.addEventListener("change", callback);
        else if (typeof media.addListener === "function") media.addListener(callback);
      } catch (_) { /* Static preference fallback. */ }
    }

    function clamp(value, minimum, maximum) {
      return Math.max(minimum, Math.min(maximum, value));
    }

    function safeFocus(element) {
      if (!element || typeof element.focus !== "function" || element.isConnected === false) return;
      try { element.focus({ preventScroll: true }); } catch (_) {
        try { element.focus(); } catch (_) { /* Non-focusable fallback. */ }
      }
    }

    function element(tag, className, text) {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function replaceContent(parent, child) {
      while (parent.firstChild) parent.removeChild(parent.firstChild);
      if (child) parent.appendChild(child);
    }

    function decorationsAllowed() {
      return motionEnabled && pageVisible && !activeDialog;
    }

    function applyTheme() {
      const next = themePreference || (themeMedia.matches ? "light" : "dark");
      const changed = next !== theme;
      theme = next;
      root.setAttribute("data-theme", theme);
      const button = byId("themeToggle");
      if (button) {
        const label = "Switch to " + (theme === "dark" ? "light" : "dark") + " theme";
        button.setAttribute("aria-label", "Dark theme");
        button.setAttribute("aria-pressed", String(theme === "dark"));
        button.setAttribute("title", label);
      }
      if (changed) notify(themeSubscribers, theme);
    }

    function applyMotion() {
      motionEnabled = motionPreference === "on" && !reducedMedia.matches;
      root.setAttribute("data-motion", motionEnabled && pageVisible ? "on" : "off");
      const button = byId("motionToggle");
      if (button) {
        const label = motionEnabled ? "Disable motion" : "Enable motion";
        button.setAttribute("aria-label", "Ambient animation");
        button.setAttribute("aria-pressed", String(motionEnabled));
        button.setAttribute("title", reducedMedia.matches
          ? "Motion is off to respect your system's reduced-motion preference" : label);
      }
      notify(motionSubscribers, motionEnabled);
    }

    function toggleTheme() {
      themePreference = theme === "dark" ? "light" : "dark";
      savePreference(THEME_KEY, themePreference);
      applyTheme();
      showToast((theme === "dark" ? "Dark" : "Light") + " theme enabled.");
    }

    function toggleMotion() {
      motionPreference = motionEnabled ? "off" : "on";
      savePreference(MOTION_KEY, motionPreference);
      applyMotion();
      showToast(reducedMedia.matches
        ? "Motion stays off while your system requests reduced motion."
        : motionEnabled ? "Motion enabled." : "Motion disabled.");
    }

    function showToast(message, duration) {
      let toast = byId("toast");
      if (!toast && doc.body && typeof doc.createElement === "function") {
        toast = element("div", "toast");
        toast.id = "toast";
        doc.body.appendChild(toast);
      }
      if (!toast) return;
      win.clearTimeout(toastTimer);
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.setAttribute("aria-atomic", "true");
      toast.textContent = message;
      toast.classList.add("show");
      toastTimer = win.setTimeout(function () {
        toast.classList.remove("show");
        toastTimer = 0;
      }, duration || 4500);
    }

    function navigateTo(id) {
      const target = byId(id);
      if (!target) return;
      closeMenu();
      try {
        if (win.location.hash !== "#" + id) win.history.pushState(null, "", "#" + id);
      } catch (_) {
        try { win.location.hash = id; } catch (_) { /* Scrolling remains available. */ }
      }
      if (typeof target.scrollIntoView === "function") {
        try { target.scrollIntoView({ behavior: motionEnabled ? "smooth" : "auto", block: "start" }); }
        catch (_) { target.scrollIntoView(); }
      }
      if (!target.hasAttribute("tabindex")) {
        target.setAttribute("tabindex", "-1");
        listen(target, "blur", function () { target.removeAttribute("tabindex"); }, { once: true });
      }
      safeFocus(target);
      refreshLayout();
    }

    function initPreferences() {
      applyTheme();
      applyMotion();
      listen(byId("themeToggle"), "click", toggleTheme);
      listen(byId("motionToggle"), "click", toggleMotion);
      watchMedia(themeMedia, function () { if (!themePreference) applyTheme(); });
      watchMedia(reducedMedia, applyMotion);
      function updateVisibility() {
        pageVisible = doc.visibilityState !== "hidden";
        applyMotion();
        if (pageVisible) refreshLayout();
      }
      listen(doc, "visibilitychange", updateVisibility);
      listen(win, "pageshow", updateVisibility);
      listen(win, "pagehide", function () {
        pageVisible = false;
        applyMotion();
      });
    }

    function initNavigation() {
      const button = byId("menuBtn");
      const nav = byId("mobileNav");
      if (!button || !nav) return;
      let menuOpen = false;
      function setMenu(open, returnFocus) {
        menuOpen = Boolean(open);
        nav.hidden = !menuOpen;
        nav.classList.toggle("open", menuOpen);
        button.classList.toggle("open", menuOpen);
        button.setAttribute("aria-expanded", String(menuOpen));
        button.setAttribute("aria-label", menuOpen ? "Close menu" : "Open menu");
        if (returnFocus) safeFocus(button);
      }
      closeMenu = function (returnFocus) { setMenu(false, returnFocus); };
      button.setAttribute("aria-controls", nav.id);
      setMenu(false);
      listen(button, "click", function () { setMenu(!menuOpen); });
      listen(nav, "click", function (event) {
        if (closest(event.target, "a")) closeMenu();
      });
      listen(doc, "click", function (event) {
        if (menuOpen && !nav.contains(event.target) && !button.contains(event.target)) closeMenu();
      });
      listen(doc, "keydown", function (event) {
        if (event.key === "Escape" && menuOpen && !activeDialog) {
          event.preventDefault();
          closeMenu(true);
        }
      });
      layoutSubscribers.push(function (reason) {
        if (reason !== "scroll" && menuOpen && typeof win.getComputedStyle === "function") {
          if (win.getComputedStyle(button).display === "none") closeMenu();
        }
      });
    }

    function initScroll() {
      const header = query(".site-header");
      const progress = byId("scrollProgress");
      const backToTop = byId("backToTop");
      const originalTabIndex = backToTop ? backToTop.getAttribute("tabindex") : null;
      const sections = ["experience", "work", "lab", "about", "contact"]
        .map(byId).filter(Boolean);
      const navLinks = all('.site-header nav a[href^="#"]');
      let frame = 0;
      let measureNeeded = true;
      let currentSection = null;
      function update() {
        frame = 0;
        const body = doc.body;
        const height = root.clientHeight || win.innerHeight || 1;
        const scroll = Math.max(0, win.scrollY || root.scrollTop || (body && body.scrollTop) || 0);
        const maxScroll = Math.max(0, Math.max(root.scrollHeight || 0, body ? body.scrollHeight : 0) - height);
        if (header) header.classList.toggle("scrolled", scroll > 12);
        if (progress) progress.style.transform = "scaleX(" + (maxScroll ? clamp(scroll / maxScroll, 0, 1) : 0) + ")";
        if (backToTop) {
          const visible = scroll > Math.max(320, height * 0.6);
          backToTop.classList.toggle("visible", visible);
          backToTop.setAttribute("aria-hidden", String(!visible));
          if (!visible) backToTop.setAttribute("tabindex", "-1");
          else if (originalTabIndex === null) backToTop.removeAttribute("tabindex");
          else backToTop.setAttribute("tabindex", originalTabIndex);
        }
        let active = "top";
        let nearest = -Infinity;
        const marker = (header ? header.getBoundingClientRect().height : 70) + height * 0.16;
        const atBottom = maxScroll > 20 && scroll >= maxScroll - 4;
        sections.forEach(function (section) {
          const top = section.getBoundingClientRect().top;
          if ((top <= marker || atBottom) && top > nearest && scroll > 32) {
            nearest = top;
            active = section.id;
          }
        });
        if (active !== currentSection) {
          currentSection = active;
          navLinks.forEach(function (link) {
            if (link.getAttribute("href") === "#" + active) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
          });
        }
        const reason = measureNeeded ? "resize" : "scroll";
        measureNeeded = false;
        notify(layoutSubscribers, reason);
      }
      refreshLayout = function (reason) {
        if (reason !== "scroll") measureNeeded = true;
        if (frame || !pageVisible) return;
        if (canFrame) frame = win.requestAnimationFrame(update);
        else update();
      };
      listen(win, "scroll", function () { refreshLayout("scroll"); }, { passive: true });
      listen(win, "resize", function () { refreshLayout("resize"); }, { passive: true });
      listen(win, "hashchange", function () { refreshLayout(); });
      listen(backToTop, "click", function (event) { event.preventDefault(); navigateTo("top"); });
      motionSubscribers.push(function () {
        if (!pageVisible && frame) {
          win.cancelAnimationFrame(frame);
          frame = 0;
        } else if (pageVisible) refreshLayout();
      });
      try {
        if (typeof win.ResizeObserver === "function" && doc.body) {
          const observer = new win.ResizeObserver(function () { refreshLayout("resize"); });
          observer.observe(doc.body);
        }
      } catch (_) { /* Scroll and viewport events still recalculate progress. */ }
      if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === "function") {
        doc.fonts.ready.then(function () { refreshLayout(); }).catch(noop);
      }
      update();
    }

    function initReveals() {
      const reveals = all(".reveal");
      let observer = null;
      function showAll() {
        if (observer) observer.disconnect();
        observer = null;
        root.classList.remove("motion-ready");
        reveals.forEach(function (item) { item.classList.add("in"); });
      }
      root.classList.remove("motion-ready");
      if (!motionEnabled || typeof win.IntersectionObserver !== "function" || !reveals.length) {
        showAll();
        return;
      }
      try {
        observer = new win.IntersectionObserver(function (entries) {
          try {
            entries.forEach(function (entry) {
              if (entry.isIntersecting || entry.intersectionRatio > 0) {
                entry.target.classList.add("in");
                if (observer) observer.unobserve(entry.target);
              }
            });
          } catch (_) { showAll(); }
        }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });
        reveals.forEach(function (item) { observer.observe(item); });
        // Only a fully initialized observer is allowed to opt content into hiding.
        root.classList.add("motion-ready");
      } catch (_) { showAll(); }
      motionSubscribers.push(function () { if (!motionEnabled) showAll(); });
    }

    function initPointerEffects() {
      if (!all("[data-tilt], [data-magnetic]").length) return;
      let tilt = null;
      let magnet = null;
      let pending = null;
      let frame = 0;
      function clearItem(item, kind) {
        if (!item) return;
        item.style.setProperty(kind === "tilt" ? "--tilt-x" : "--magnet-x", kind === "tilt" ? "0deg" : "0px");
        item.style.setProperty(kind === "tilt" ? "--tilt-y" : "--magnet-y", kind === "tilt" ? "0deg" : "0px");
      }
      function reset() {
        if (frame) win.cancelAnimationFrame(frame);
        frame = 0;
        pending = null;
        clearItem(tilt, "tilt");
        clearItem(magnet, "magnet");
        tilt = null;
        magnet = null;
      }
      function write() {
        frame = 0;
        if (!pending || !decorationsAllowed() || !pointerMedia.matches) return;
        pending.forEach(function (item) {
          item.node.style.setProperty(item.kind === "tilt" ? "--tilt-x" : "--magnet-x", item.x);
          item.node.style.setProperty(item.kind === "tilt" ? "--tilt-y" : "--magnet-y", item.y);
        });
        pending = null;
      }
      listen(doc, "pointermove", function (event) {
        if (!decorationsAllowed() || !pointerMedia.matches || event.pointerType === "touch") {
          reset();
          return;
        }
        const nextTilt = closest(event.target, "[data-tilt]");
        const nextMagnet = closest(event.target, "[data-magnetic]");
        if (tilt !== nextTilt) clearItem(tilt, "tilt");
        if (magnet !== nextMagnet) clearItem(magnet, "magnet");
        tilt = nextTilt;
        magnet = nextMagnet;
        pending = [];
        [{ node: tilt, kind: "tilt" }, { node: magnet, kind: "magnet" }].forEach(function (item) {
          if (!item.node) return;
          const rect = item.node.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const x = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
          const y = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
          pending.push({ node: item.node, kind: item.kind,
            x: (item.kind === "tilt" ? -y * 5 : x * 10).toFixed(2) + (item.kind === "tilt" ? "deg" : "px"),
            y: (item.kind === "tilt" ? x * 5 : y * 8).toFixed(2) + (item.kind === "tilt" ? "deg" : "px") });
        });
        if (!frame) {
          if (canFrame) frame = win.requestAnimationFrame(write);
          else write();
        }
      }, { passive: true });
      listen(doc, "pointerout", function (event) {
        if (!event.relatedTarget) reset();
        else {
          if (tilt && !tilt.contains(event.relatedTarget)) { clearItem(tilt, "tilt"); tilt = null; }
          if (magnet && !magnet.contains(event.relatedTarget)) { clearItem(magnet, "magnet"); magnet = null; }
          pending = null;
        }
      }, { passive: true });
      listen(doc, "pointercancel", reset);
      listen(win, "blur", reset);
      watchMedia(pointerMedia, reset);
      motionSubscribers.push(function () { if (!decorationsAllowed()) reset(); });
      layoutSubscribers.push(reset);
    }

    function initDialogs() {
      const available = [byId("projectDialog"), byId("commandDialog")].filter(Boolean);
      if (!available.length) return;
      let scrollState = null;

      function lockScroll() {
        if (scrollState) return;
        scrollState = {
          rootOverflow: root.style.overflow,
          rootPriority: root.style.getPropertyPriority("overflow"),
          bodyOverflow: doc.body ? doc.body.style.overflow : "",
          bodyPriority: doc.body ? doc.body.style.getPropertyPriority("overflow") : "",
          hadClass: root.classList.contains("dialog-open")
        };
        root.classList.add("dialog-open");
        root.style.overflow = "hidden";
        if (doc.body) doc.body.style.overflow = "hidden";
      }

      function unlockScroll() {
        if (!scrollState) return;
        root.style.setProperty("overflow", scrollState.rootOverflow, scrollState.rootPriority);
        if (doc.body) doc.body.style.setProperty("overflow", scrollState.bodyOverflow, scrollState.bodyPriority);
        if (!scrollState.hadClass) root.classList.remove("dialog-open");
        scrollState = null;
      }

      function focusable(dialog) {
        return all('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', dialog)
          .filter(function (node) {
            return !closest(node, "[hidden], [inert]") &&
              (typeof node.getClientRects !== "function" || node.getClientRects().length > 0);
          });
      }

      function focusInitial(state) {
        const target = state.initial || focusable(state.dialog)[0] || state.dialog;
        safeFocus(target);
      }

      function fallbackModal(state) {
        const dialog = state.dialog;
        if (!doc.body) throw new Error("No dialog host");
        state.fallback = true;
        state.inlineStyle = dialog.style.cssText;
        state.role = dialog.getAttribute("role");
        state.background = [];
        const backdrop = element("div", "dialog-backdrop");
        backdrop.setAttribute("aria-hidden", "true");
        backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:110";
        doc.body.appendChild(backdrop);
        state.backdrop = backdrop;
        state.removeBackdropListener = listen(backdrop, "click", function () { close(); });
        dialog.classList.add("dialog-fallback");
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("open", "");
        dialog.style.position = "fixed";
        dialog.style.left = "50%";
        dialog.style.top = "50%";
        dialog.style.bottom = "auto";
        dialog.style.right = "auto";
        dialog.style.transform = "translate(-50%, -50%)";
        dialog.style.margin = "0";
        dialog.style.zIndex = "111";
        dialog.style.maxHeight = "calc(100vh - 2rem)";
        dialog.style.overflowY = "auto";
        // Native showModal provides inertness. Its fallback must do so explicitly.
        let branch = dialog;
        while (branch && branch !== doc.body && branch.parentElement) {
          Array.from(branch.parentElement.children).forEach(function (sibling) {
            if (sibling === branch || sibling === backdrop || sibling.id === "toast" ||
                /^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) return;
            state.background.push({ node: sibling,
              inert: sibling.hasAttribute("inert"), hidden: sibling.getAttribute("aria-hidden") });
            sibling.setAttribute("inert", "");
            sibling.setAttribute("aria-hidden", "true");
          });
          branch = branch.parentElement;
        }
      }

      function restoreFallback(state) {
        if (!state.fallback) return;
        if (state.removeBackdropListener) state.removeBackdropListener();
        if (state.backdrop && state.backdrop.parentNode) state.backdrop.parentNode.removeChild(state.backdrop);
        state.dialog.style.cssText = state.inlineStyle || "";
        state.dialog.classList.remove("dialog-fallback");
        if (state.role === null) state.dialog.removeAttribute("role");
        else state.dialog.setAttribute("role", state.role);
        (state.background || []).forEach(function (item) {
          if (!item.inert) item.node.removeAttribute("inert");
          if (item.hidden === null) item.node.removeAttribute("aria-hidden");
          else item.node.setAttribute("aria-hidden", item.hidden);
        });
      }

      function close(restoreFocus) {
        const state = activeDialog;
        if (!state) return;
        activeDialog = null;
        try {
          if (!state.fallback && state.dialog.open && typeof state.dialog.close === "function") state.dialog.close();
        } catch (_) { /* Removing open is the safe non-native close path. */ }
        state.dialog.removeAttribute("open");
        restoreFallback(state);
        if (state.tabIndex === null) state.dialog.removeAttribute("tabindex");
        state.dialog.removeAttribute("aria-modal");
        unlockScroll();
        notify(motionSubscribers, motionEnabled);
        refreshLayout();
        if (restoreFocus !== false) {
          let target = state.trigger;
          const containingDialog = closest(target, "dialog");
          if (!target || target.isConnected === false || closest(target, "[hidden], [inert]") ||
              (containingDialog && !containingDialog.hasAttribute("open"))) {
            target = byId("commandTrigger") || byId("menuBtn");
          }
          safeFocus(target);
        }
      }

      function open(dialog, trigger, initial) {
        if (!dialog) return false;
        const returnTarget = trigger || (activeDialog && activeDialog.trigger) || doc.activeElement;
        if (activeDialog) close(false);
        closeMenu();
        const state = { dialog: dialog, trigger: returnTarget, initial: initial,
          tabIndex: dialog.getAttribute("tabindex"), fallback: false };
        activeDialog = state;
        dialog.hidden = false;
        dialog.setAttribute("aria-modal", "true");
        if (state.tabIndex === null) dialog.setAttribute("tabindex", "-1");
        try {
          let nativeOpened = false;
          if (typeof dialog.showModal === "function") {
            try {
              if (dialog.open && typeof dialog.close === "function") dialog.close();
              dialog.showModal();
              nativeOpened = dialog.open || dialog.hasAttribute("open");
            } catch (_) { nativeOpened = false; }
          }
          if (!nativeOpened) fallbackModal(state);
          lockScroll();
          notify(motionSubscribers, motionEnabled);
          focusInitial(state);
          return true;
        } catch (_) {
          close();
          showToast("This panel could not be opened. The page content remains available.");
          return false;
        }
      }

      available.forEach(function (dialog) {
        let pointerStartedOutside = null;
        function isBackdropPoint(event) {
          const rect = dialog.getBoundingClientRect();
          return event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom;
        }
        listen(dialog, "pointerdown", function (event) {
          pointerStartedOutside = event.target === dialog && isBackdropPoint(event);
        });
        listen(dialog, "click", function (event) {
          if (!activeDialog || activeDialog.dialog !== dialog) return;
          if (closest(event.target, "[data-close-dialog]")) {
            event.preventDefault();
            close();
          } else if (event.target === dialog && isBackdropPoint(event) && pointerStartedOutside !== false) close();
          pointerStartedOutside = null;
        });
        listen(dialog, "cancel", function (event) {
          if (activeDialog && activeDialog.dialog === dialog) {
            event.preventDefault();
            close();
          }
        });
        listen(dialog, "close", function () {
          // A queued native close event must not close a subsequent reopening.
          if (activeDialog && activeDialog.dialog === dialog && !dialog.hasAttribute("open")) close();
        });
      });
      listen(doc, "keydown", function (event) {
        if (!activeDialog || event.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        } else if (event.key === "Tab") {
          // Drive the trap explicitly from the current focusable set on every Tab
          // rather than relying on native sequential focus plus focusin recovery.
          // Native sequential navigation escapes a fallback dialog whose siblings
          // are only attribute-inert (observed in WebKit), so compute the target
          // here for every step, forward and backward, including middle elements.
          const items = focusable(activeDialog.dialog);
          const first = items[0];
          const last = items[items.length - 1];
          event.preventDefault();
          if (!first) {
            safeFocus(activeDialog.dialog);
            return;
          }
          const current = items.indexOf(doc.activeElement);
          let target;
          if (current === -1) {
            // Focus is outside the dialog (or on the dialog container itself):
            // re-enter at the appropriate edge for the travel direction.
            target = event.shiftKey ? last : first;
          } else if (event.shiftKey) {
            target = current === 0 ? last : items[current - 1];
          } else {
            target = current === items.length - 1 ? first : items[current + 1];
          }
          safeFocus(target);
        }
      });
      listen(doc, "focusin", function (event) {
        if (activeDialog && !activeDialog.dialog.contains(event.target)) focusInitial(activeDialog);
      });
      dialogs = { open: open, close: close };
    }

    function selectionCopy() {
      if (!doc.body || typeof doc.execCommand !== "function") return false;
      const previousFocus = doc.activeElement;
      const field = element("textarea", "copy-selection", PROFILE_URL);
      field.value = PROFILE_URL;
      field.readOnly = true;
      field.tabIndex = -1;
      field.setAttribute("aria-label", "GitHub profile URL");
      field.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;opacity:0;pointer-events:none";
      let selection = null;
      const ranges = [];
      let copied = false;
      try {
        selection = typeof doc.getSelection === "function" ? doc.getSelection() : null;
        if (selection) {
          for (let index = 0; index < selection.rangeCount; index += 1) ranges.push(selection.getRangeAt(index).cloneRange());
        }
        doc.body.appendChild(field);
        safeFocus(field);
        field.select();
        field.setSelectionRange(0, PROFILE_URL.length);
        copied = doc.execCommand("copy") === true;
      } catch (_) { copied = false; }
      finally {
        if (field.parentNode) field.parentNode.removeChild(field);
        safeFocus(previousFocus);
        try {
          if (selection && ranges.length) {
            selection.removeAllRanges();
            ranges.forEach(function (range) { selection.addRange(range); });
          }
        } catch (_) { /* A removed selection need not be restored. */ }
      }
      return copied;
    }

    async function copyProfile() {
      const generation = ++copyGeneration;
      let copied = false;
      try {
        if (win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === "function") {
          // Invoked only from click/keyboard actions, never during initialization.
          await win.navigator.clipboard.writeText(PROFILE_URL);
          copied = true;
        }
      } catch (_) { /* Permission and insecure-context failures use selection copying. */ }
      if (generation !== copyGeneration) return;
      if (!copied) copied = selectionCopy();
      showToast(copied ? "GitHub profile copied." : "Copy my GitHub profile: " + PROFILE_URL, copied ? 4500 : 12000);
    }

    function initCopyControls() {
      all("[data-copy-profile]").forEach(function (button) {
        if (button.hasAttribute("data-command")) return;
        listen(button, "click", function (event) { event.preventDefault(); copyProfile(); });
      });
    }

    function initContactForm() {
      const form = byId("contactForm");
      if (!form) return;
      const status = byId("contactFormStatus");
      const submitButton = query("button[type=\"submit\"]", form);
      const honeypot = byId("contactWebsite");
      const nameField = byId("contactName");
      const emailField = byId("contactEmail");
      const subjectField = byId("contactSubject");
      const messageField = byId("contactMessage");
      const publicKey = "f3B-QZIOmePSTEz9P";
      const serviceId = "portfolio_ahmadfarid";
      const templateId = "portfolio_email";
      const recipient = "ahmadfaridabbas@gmail.com";
      let isSending = false;
      let emailjsReady = false;
      let emailjsInitFailed = false;

      function setStatus(message, state) {
        if (!status) return;
        status.textContent = message;
        status.setAttribute("data-state", state || "idle");
      }

      function unavailableMessage() {
        setStatus("Email delivery is unavailable right now. Please email ahmadfaridabbas@gmail.com directly.", "error");
      }

      function getEmailjs() {
        const emailjs = win.emailjs;
        if (!emailjs || typeof emailjs.init !== "function" || typeof emailjs.send !== "function") {
          unavailableMessage();
          return null;
        }
        if (emailjsInitFailed) {
          unavailableMessage();
          return null;
        }
        if (!emailjsReady) {
          try {
            emailjs.init({ publicKey });
            emailjsReady = true;
          } catch (_) {
            emailjsInitFailed = true;
            unavailableMessage();
            return null;
          }
        }
        return emailjs;
      }

      function setPending(pending) {
        isSending = pending;
        if (submitButton) submitButton.disabled = pending;
        form.setAttribute("aria-busy", String(pending));
      }

      function sendFailed() {
        try {
          setPending(false);
          setStatus("I couldn't send your message right now. Your fields are still here; please try again or use the direct email fallback.", "error");
        } catch (_) { /* Keep a failed optional send from affecting the page. */ }
      }

      function handleSubmit(event) {
        try {
          if (event && typeof event.preventDefault === "function") event.preventDefault();
          if (isSending) return;
          const valid = typeof form.reportValidity === "function"
            ? form.reportValidity()
            : typeof form.checkValidity === "function" ? form.checkValidity() : true;
          if (!valid) {
            setStatus("Please complete the required fields before sending.", "error");
            return;
          }
          if (honeypot && String(honeypot.value || "").trim()) {
            setStatus("Your message could not be sent. Please use the direct email fallback.", "error");
            return;
          }
          const emailjs = getEmailjs();
          if (!emailjs) return;

          const fromName = nameField ? String(nameField.value || "").trim() : "";
          const fromEmail = emailField ? String(emailField.value || "").trim() : "";
          const subject = subjectField ? String(subjectField.value || "").trim() : "";
          const message = messageField ? String(messageField.value || "").trim() : "";
          setPending(true);
          setStatus("Sending your message…", "pending");

          let sendResult;
          try {
            sendResult = emailjs.send(serviceId, templateId, {
              from_name: fromName,
              from_email: fromEmail,
              reply_to: fromEmail,
              subject: subject,
              message: message,
              to_email: recipient
            });
          } catch (_) {
            sendFailed();
            return;
          }

          try {
            Promise.resolve(sendResult).then(function () {
              try {
                form.reset();
                setPending(false);
                setStatus("Thanks — your message was sent. I'll be in touch soon.", "success");
              } catch (_) { sendFailed(); }
            }, sendFailed);
          } catch (_) { sendFailed(); }
        } catch (_) {
          sendFailed();
        }
      }

      listen(form, "submit", handleSubmit);
      if (!win.emailjs || typeof win.emailjs.init !== "function" || typeof win.emailjs.send !== "function") {
        unavailableMessage();
      }
    }

    function initProjectFilters() {
      const buttons = all("[data-filter]");
      const cards = all("article.project-card[data-category]");
      if (!buttons.length || !cards.length) return;
      const counts = all("[data-project-count]");
      const validFilters = ["all", "native", "quality"];
      function selectFilter(filter) {
        if (validFilters.indexOf(filter) === -1) return;
        let visible = 0;
        cards.forEach(function (card) {
          const categories = (card.getAttribute("data-category") || "").split(/\s+/);
          card.hidden = filter !== "all" && categories.indexOf(filter) === -1;
          if (!card.hidden) visible += 1;
        });
        buttons.forEach(function (button) {
          const selected = button.getAttribute("data-filter") === filter;
          button.setAttribute("aria-pressed", String(selected));
          button.classList.toggle("is-active", selected);
        });
        counts.forEach(function (node) {
          node.textContent = "Showing " + visible + " of " + cards.length + " " + (cards.length === 1 ? "result" : "results") + ".";
        });
        refreshLayout();
      }
      buttons.forEach(function (button) {
        listen(button, "click", function (event) {
          event.preventDefault();
          selectFilter(button.getAttribute("data-filter"));
        });
      });
      selectFilter("all");
    }

    function initBauhausGallery() {
      const image = byId("bauhausPreview");
      const figure = closest(image, ".preview-bauhaus");
      if (!image || !figure) return;
      const label = byId("bauhausDialLabel");
      const status = byId("bauhausPreviewStatus");
      const dials = {
        noir: {
          src: "assets/bauhaus/noir.jpg", label: "Noir / Dauphine + Needle",
          alt: "Native offscreen render at 10:10:35 of the Noir cyan luminous near-black dial with Dauphine hour and minute hands and a Needle second hand."
        },
        ivory: {
          src: "assets/bauhaus/ivory.jpg", label: "Ivory / Leaf + Needle",
          alt: "Native offscreen render at 10:10:35 of the Ivory warm ivory Roman-numeral dial with Leaf hour and minute hands and a Needle second hand."
        },
        ocean: {
          src: "assets/bauhaus/ocean.jpg", label: "Ocean / Sword + Needle",
          alt: "Native offscreen render at 10:10:35 of the Ocean deep-blue quarter-hour dial with Sword hour and minute hands and a Needle second hand."
        }
      };
      function validDial(name) { return Object.prototype.hasOwnProperty.call(dials, name); }
      const buttons = all("[data-bauhaus-dial]", byId("project-bauhaus") || figure)
        .filter(function (button) { return validDial(button.getAttribute("data-bauhaus-dial")); });
      let current = figure.getAttribute("data-bauhaus-current") || "noir";
      if (!buttons.length || !validDial(current)) return;
      let loaded = Boolean(image.complete && image.naturalWidth > 0);
      let generation = 0;
      let pending = 0;

      function setState(state) {
        figure.setAttribute("data-bauhaus-state", state);
        figure.setAttribute("aria-busy", String(state === "loading"));
      }

      function announce(message) {
        if (status) status.textContent = message;
        else showToast(message);
      }

      function failureMessage(name) {
        return "Could not load " + dials[name].label + " preview. " + (loaded
          ? dials[current].label + " remains shown." : "Preview unavailable; retry or choose another dial.");
      }

      function preload(dial) {
        return new Promise(function (resolve, reject) {
          let candidate;
          try { candidate = typeof win.Image === "function" ? new win.Image() : doc.createElement("img"); }
          catch (_) { candidate = doc.createElement("img"); }
          let settled = false;
          let decoding = false;
          function finish(success) {
            if (settled) return;
            settled = true;
            candidate.onload = null;
            candidate.onerror = null;
            if (success && candidate.naturalWidth > 0) resolve();
            else reject(new Error("Dial preview unavailable"));
          }
          function onLoad() {
            if (settled || decoding) return;
            if (!(candidate.naturalWidth > 0)) { finish(false); return; }
            decoding = true;
            if (typeof candidate.decode !== "function") { finish(true); return; }
            try {
              Promise.resolve(candidate.decode()).then(function () { finish(true); }, function () { finish(false); });
            } catch (_) { finish(false); }
          }
          candidate.onload = onLoad;
          candidate.onerror = function () { finish(false); };
          try {
            candidate.src = dial.src;
            if (candidate.complete) onLoad();
          } catch (_) { finish(false); }
        });
      }

      async function selectDial(name) {
        if (!validDial(name)) return;
        const request = ++generation;
        // Selecting the visible dial also supersedes an older, still-loading choice.
        if (name === current && loaded) {
          pending = 0;
          setState("ready");
          announce(dials[current].label + " is already shown.");
          return;
        }
        pending = request;
        setState("loading");
        announce("Loading " + dials[name].label + " preview…");
        try {
          await preload(dials[name]);
          if (request !== generation) return;
          // Keep the existing render visible until its replacement has loaded and decoded.
          image.src = dials[name].src;
          image.alt = dials[name].alt;
          if (label) label.textContent = dials[name].label;
          current = name;
          loaded = true;
          pending = 0;
          figure.setAttribute("data-bauhaus-current", current);
          buttons.forEach(function (button) {
            button.setAttribute("aria-pressed", String(button.getAttribute("data-bauhaus-dial") === current));
          });
          setState("ready");
          announce(dials[current].label + " preview shown at 10:10:35.");
        } catch (_) {
          if (request !== generation) return;
          pending = 0;
          setState("error");
          announce(failureMessage(name));
        }
      }

      if (status) {
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        status.setAttribute("aria-atomic", "true");
      }
      listen(image, "load", function () {
        if (!(image.complete && image.naturalWidth > 0)) return;
        loaded = true;
        if (!pending) setState("ready");
      });
      listen(image, "error", function () {
        if (!image.complete || image.naturalWidth > 0) return;
        loaded = false;
        if (!pending) {
          setState("error");
          announce(failureMessage(current));
        }
      });
      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-bauhaus-dial") === current));
        listen(button, "click", function () { selectDial(button.getAttribute("data-bauhaus-dial")); });
      });
      setState(loaded ? "ready" : image.complete ? "error" : "loading");
      if (image.complete && !loaded) announce(failureMessage(current));
    }

    function initKegPilotGallery() {
      const image = byId("kegPreview");
      const figure = closest(image, ".preview-keg");
      if (!image || !figure) return;
      const label = byId("kegViewLabel");
      const status = byId("kegPreviewStatus");
      const fullImage = byId("kegFullImage");
      const views = {
        maintenance: {
          src: "assets/kegpilot/maintenance.png", label: "Maintenance",
          alt: "Supplied native UI artwork of KegPilot's Maintenance dashboard, with six Homebrew actions, Brewfile backup controls, and a command console."
        },
        installed: {
          src: "assets/kegpilot/installed.png", label: "Installed",
          alt: "Supplied native UI artwork of KegPilot's Installed view, showing package search and an installed package list; pictured versions are not live data."
        },
        updates: {
          src: "assets/kegpilot/updates.png", label: "Updates",
          alt: "Supplied native UI artwork of KegPilot's Updates view, showing per-package upgrade controls; pictured versions are not live data."
        },
        console: {
          src: "assets/kegpilot/console.png", label: "Console",
          alt: "Supplied native UI artwork of KegPilot's command console with output, progress, and Stop controls; separate from the website simulation."
        }
      };
      function validView(name) { return Object.prototype.hasOwnProperty.call(views, name); }
      const buttons = all("button[data-keg-view]", byId("project-kegpilot") || figure)
        .filter(function (button) { return validView(button.getAttribute("data-keg-view")); });
      let current = figure.getAttribute("data-keg-current") || "maintenance";
      if (!buttons.length || !validView(current)) return;
      let loaded = Boolean(image.complete && image.naturalWidth > 0);
      let generation = 0;
      let pending = 0;

      function setState(state) {
        figure.setAttribute("data-keg-state", state);
        figure.setAttribute("aria-busy", String(state === "loading"));
      }

      function announce(message) {
        if (status) status.textContent = message;
        else showToast(message);
      }

      function updateSize(candidate) {
        if (!(candidate.naturalWidth > 0 && candidate.naturalHeight > 0)) return;
        image.setAttribute("width", String(candidate.naturalWidth));
        image.setAttribute("height", String(candidate.naturalHeight));
      }

      function failureMessage(name) {
        return "Could not load " + views[name].label + " artwork. " + (loaded
          ? views[current].label + " remains shown. " : "The preview is unavailable. ") +
          "Select " + views[name].label + " again to retry, or choose another view.";
      }

      function preload(view) {
        return new Promise(function (resolve, reject) {
          let candidate;
          try { candidate = typeof win.Image === "function" ? new win.Image() : doc.createElement("img"); }
          catch (_) { candidate = doc.createElement("img"); }
          let settled = false;
          let decoding = false;
          // A stalled image or decoder must not leave the controls permanently busy.
          const timeout = win.setTimeout(function () { finish(false); }, 12000);
          function finish(success) {
            if (settled) return;
            settled = true;
            win.clearTimeout(timeout);
            candidate.onload = null;
            candidate.onerror = null;
            if (success && candidate.naturalWidth > 0) resolve(candidate);
            else reject(new Error("KegPilot artwork unavailable"));
          }
          function onLoad() {
            if (settled || decoding) return;
            if (!(candidate.naturalWidth > 0)) { finish(false); return; }
            decoding = true;
            if (typeof candidate.decode !== "function") { finish(true); return; }
            try {
              Promise.resolve(candidate.decode()).then(function () { finish(true); }, function () { finish(false); });
            } catch (_) { finish(false); }
          }
          candidate.onload = onLoad;
          candidate.onerror = function () { finish(false); };
          try {
            candidate.src = view.src;
            if (candidate.complete) onLoad();
          } catch (_) { finish(false); }
        });
      }

      async function selectView(name) {
        if (!validView(name)) return;
        const request = ++generation;
        // Choosing the shown view also invalidates any older replacement request.
        if (name === current && loaded) {
          pending = 0;
          setState("ready");
          announce(views[current].label + " artwork is already shown.");
          return;
        }
        pending = request;
        setState("loading");
        announce("Loading " + views[name].label + " artwork…");
        try {
          const candidate = await preload(views[name]);
          if (request !== generation) return;
          // Commit image, dimensions, caption, selection, and link together after decoding.
          updateSize(candidate);
          // WebKit retains a failed visible image when assigned the same URL,
          // even after a separate preload succeeds. Reset only that failed source.
          if (!loaded) image.removeAttribute("src");
          image.src = views[name].src;
          image.alt = views[name].alt;
          if (label) label.textContent = views[name].label;
          if (fullImage) fullImage.setAttribute("href", views[name].src);
          current = name;
          loaded = true;
          pending = 0;
          figure.setAttribute("data-keg-current", current);
          buttons.forEach(function (button) {
            button.setAttribute("aria-pressed", String(button.getAttribute("data-keg-view") === current));
          });
          setState("ready");
          announce(views[current].label + " native UI artwork shown; pictured versions are not live data.");
          refreshLayout();
        } catch (_) {
          if (request !== generation) return;
          pending = 0;
          setState("error");
          announce(failureMessage(name));
        }
      }

      if (status) {
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        status.setAttribute("aria-atomic", "true");
      }
      listen(image, "load", function () {
        if (!(image.complete && image.naturalWidth > 0)) return;
        const wasLoaded = loaded;
        loaded = true;
        updateSize(image);
        if (!pending) {
          setState("ready");
          if (!wasLoaded) announce(views[current].label + " native UI artwork shown; pictured versions are not live data.");
        }
      });
      listen(image, "error", function () {
        if (!image.complete || image.naturalWidth > 0) return;
        loaded = false;
        if (!pending) {
          setState("error");
          announce(failureMessage(current));
        }
      });
      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-keg-view") === current));
        listen(button, "click", function () { selectView(button.getAttribute("data-keg-view")); });
      });
      if (fullImage) {
        fullImage.setAttribute("href", views[current].src);
        fullImage.setAttribute("target", "_blank");
        fullImage.setAttribute("rel", "noopener noreferrer");
      }
      if (loaded) updateSize(image);
      setState(loaded ? "ready" : image.complete ? "error" : "loading");
      if (image.complete && !loaded) announce(failureMessage(current));
      else if (!loaded) announce("Loading " + views[current].label + " artwork…");
    }

    function initJotvellaGallery() {
      const image = byId("jotvellaPreview");
      const figure = closest(image, ".preview-jotvella");
      if (!image || !figure) return;
      const label = byId("jotvellaViewLabel");
      const status = byId("jotvellaPreviewStatus");
      const fullImage = byId("jotvellaFullImage");
      const views = {
        light: {
          src: "assets/jotvella/workspace-light.png", label: "Light workspace",
          alt: "Supplied Jotvella workspace screenshot in light mode, showing a notebook sidebar, page list, and free-canvas editor.",
          width: 2560, height: 1566
        },
        dark: {
          src: "assets/jotvella/workspace-dark.png", label: "Dark workspace",
          alt: "Supplied Jotvella workspace screenshot in dark mode, showing a notebook sidebar, page list, and free-canvas editor.",
          width: 2560, height: 1566
        }
      };
      function validView(name) { return Object.prototype.hasOwnProperty.call(views, name); }
      const buttons = all("button[data-jotvella-view]", byId("project-jotvella") || figure)
        .filter(function (button) { return validView(button.getAttribute("data-jotvella-view")); });
      let current = figure.getAttribute("data-jotvella-current") || "light";
      if (!buttons.length || !validView(current)) return;
      let loaded = Boolean(image.complete && image.naturalWidth > 0);
      let generation = 0;
      let pending = 0;

      function setState(state) {
        figure.setAttribute("data-jotvella-state", state);
        figure.setAttribute("aria-busy", String(state === "loading"));
      }

      function announce(message) {
        if (status) status.textContent = message;
        else showToast(message);
      }

      function updateSize(view) {
        image.setAttribute("width", String(view.width));
        image.setAttribute("height", String(view.height));
      }

      function failureMessage(name) {
        return "Could not load the " + views[name].label.toLowerCase() + ". " + (loaded
          ? views[current].label + " remains shown. " : "The workspace preview is unavailable. ") +
          "Select " + views[name].label.toLowerCase() + " again to retry, or choose another view.";
      }

      function preload(view) {
        return new Promise(function (resolve, reject) {
          let candidate;
          try { candidate = typeof win.Image === "function" ? new win.Image() : doc.createElement("img"); }
          catch (_) { candidate = doc.createElement("img"); }
          let settled = false;
          let decoding = false;
          const timeout = win.setTimeout(function () { finish(false); }, 12000);
          function finish(success) {
            if (settled) return;
            settled = true;
            win.clearTimeout(timeout);
            candidate.onload = null;
            candidate.onerror = null;
            if (success && candidate.naturalWidth > 0) resolve();
            else reject(new Error("Jotvella workspace unavailable"));
          }
          function onLoad() {
            if (settled || decoding) return;
            if (!(candidate.naturalWidth > 0)) { finish(false); return; }
            decoding = true;
            if (typeof candidate.decode !== "function") { finish(true); return; }
            try {
              Promise.resolve(candidate.decode()).then(function () { finish(true); }, function () { finish(false); });
            } catch (_) { finish(false); }
          }
          candidate.onload = onLoad;
          candidate.onerror = function () { finish(false); };
          try {
            candidate.src = view.src;
            if (candidate.complete) onLoad();
          } catch (_) { finish(false); }
        });
      }

      async function selectView(name) {
        if (!validView(name)) return;
        const request = ++generation;
        if (name === current && loaded) {
          pending = 0;
          setState("ready");
          announce(views[current].label + " is already shown.");
          return;
        }
        pending = request;
        setState("loading");
        announce("Loading " + views[name].label.toLowerCase() + "…");
        try {
          await preload(views[name]);
          if (request !== generation) return;
          updateSize(views[name]);
          // Keep the current workspace visible until the replacement has loaded and decoded.
          // Reset only a previously failed source before retrying that same URL.
          if (!loaded) image.removeAttribute("src");
          image.src = views[name].src;
          image.alt = views[name].alt;
          if (label) label.textContent = views[name].label;
          if (fullImage) fullImage.setAttribute("href", views[name].src);
          current = name;
          loaded = true;
          pending = 0;
          figure.setAttribute("data-jotvella-current", current);
          buttons.forEach(function (button) {
            button.setAttribute("aria-pressed", String(button.getAttribute("data-jotvella-view") === current));
          });
          setState("ready");
          announce(views[current].label + " shown.");
          refreshLayout();
        } catch (_) {
          if (request !== generation) return;
          pending = 0;
          setState("error");
          announce(failureMessage(name));
        }
      }

      listen(image, "load", function () {
        if (!(image.complete && image.naturalWidth > 0)) return;
        loaded = true;
        updateSize(views[current]);
        if (!pending) setState("ready");
      });
      listen(image, "error", function () {
        if (!image.complete || image.naturalWidth > 0) return;
        loaded = false;
        if (!pending) {
          setState("error");
          announce(failureMessage(current));
        }
      });
      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-jotvella-view") === current));
        listen(button, "click", function () { selectView(button.getAttribute("data-jotvella-view")); });
      });
      if (label) label.textContent = views[current].label;
      if (fullImage) {
        fullImage.setAttribute("href", views[current].src);
        fullImage.setAttribute("target", "_blank");
        fullImage.setAttribute("rel", "noopener noreferrer");
      }
      updateSize(views[current]);
      setState(loaded ? "ready" : image.complete ? "error" : "loading");
      if (image.complete && !loaded) announce(failureMessage(current));
      else if (!loaded) announce("Loading " + views[current].label.toLowerCase() + "…");
    }

    function initTaskZeroGallery() {
      const image = byId("taskzeroPreview");
      const figure = closest(image, ".preview-taskzero");
      if (!image || !figure) return;
      const label = byId("taskzeroViewLabel");
      const status = byId("taskzeroPreviewStatus");
      const fullImage = byId("taskzeroFullImage");
      const views = {
        panel: {
          src: "assets/taskzero/panel.png", label: "Overview panel",
          alt: "Supplied TaskZero screenshot of the menu-bar Overview panel: a Ready status card, System Overview tiles for applications, background processes, protected items, and exclusions, and a Review & Clean action.",
          width: 812, height: 1212
        },
        review: {
          src: "assets/taskzero/review.png", label: "Review cleanup",
          alt: "Supplied TaskZero screenshot of the Review cleanup sheet: applications and background processes grouped with per-item selection and search, and protected items that are never targeted.",
          width: 1524, height: 1464
        }
      };
      function validView(name) { return Object.prototype.hasOwnProperty.call(views, name); }
      const buttons = all("button[data-taskzero-view]", byId("project-taskzero") || figure)
        .filter(function (button) { return validView(button.getAttribute("data-taskzero-view")); });
      let current = figure.getAttribute("data-taskzero-current") || "panel";
      if (!buttons.length || !validView(current)) return;
      let loaded = Boolean(image.complete && image.naturalWidth > 0);
      let generation = 0;
      let pending = 0;

      function setState(state) {
        figure.setAttribute("data-taskzero-state", state);
        figure.setAttribute("aria-busy", String(state === "loading"));
      }

      function announce(message) {
        if (status) status.textContent = message;
        else showToast(message);
      }

      function updateSize(view) {
        image.setAttribute("width", String(view.width));
        image.setAttribute("height", String(view.height));
      }

      function failureMessage(name) {
        return "Could not load the " + views[name].label.toLowerCase() + ". " + (loaded
          ? views[current].label + " remains shown. " : "The panel preview is unavailable. ") +
          "Select " + views[name].label + " again to retry, or choose another view.";
      }

      function preload(view) {
        return new Promise(function (resolve, reject) {
          let candidate;
          try { candidate = typeof win.Image === "function" ? new win.Image() : doc.createElement("img"); }
          catch (_) { candidate = doc.createElement("img"); }
          let settled = false;
          let decoding = false;
          const timeout = win.setTimeout(function () { finish(false); }, 12000);
          function finish(success) {
            if (settled) return;
            settled = true;
            win.clearTimeout(timeout);
            candidate.onload = null;
            candidate.onerror = null;
            if (success && candidate.naturalWidth > 0) resolve();
            else reject(new Error("TaskZero panel unavailable"));
          }
          function onLoad() {
            if (settled || decoding) return;
            if (!(candidate.naturalWidth > 0)) { finish(false); return; }
            decoding = true;
            if (typeof candidate.decode !== "function") { finish(true); return; }
            try {
              Promise.resolve(candidate.decode()).then(function () { finish(true); }, function () { finish(false); });
            } catch (_) { finish(false); }
          }
          candidate.onload = onLoad;
          candidate.onerror = function () { finish(false); };
          try {
            candidate.src = view.src;
            if (candidate.complete) onLoad();
          } catch (_) { finish(false); }
        });
      }

      async function selectView(name) {
        if (!validView(name)) return;
        const request = ++generation;
        if (name === current && loaded) {
          pending = 0;
          setState("ready");
          announce(views[current].label + " is already shown.");
          return;
        }
        pending = request;
        setState("loading");
        announce("Loading " + views[name].label.toLowerCase() + "…");
        try {
          await preload(views[name]);
          if (request !== generation) return;
          updateSize(views[name]);
          // Keep the current panel visible until the replacement has loaded and decoded.
          // Reset only a previously failed source before retrying that same URL.
          if (!loaded) image.removeAttribute("src");
          image.src = views[name].src;
          image.alt = views[name].alt;
          if (label) label.textContent = views[name].label;
          if (fullImage) fullImage.setAttribute("href", views[name].src);
          current = name;
          loaded = true;
          pending = 0;
          figure.setAttribute("data-taskzero-current", current);
          buttons.forEach(function (button) {
            button.setAttribute("aria-pressed", String(button.getAttribute("data-taskzero-view") === current));
          });
          setState("ready");
          announce(views[current].label + " shown.");
          refreshLayout();
        } catch (_) {
          if (request !== generation) return;
          pending = 0;
          setState("error");
          announce(failureMessage(name));
        }
      }

      listen(image, "load", function () {
        if (!(image.complete && image.naturalWidth > 0)) return;
        loaded = true;
        updateSize(views[current]);
        if (!pending) setState("ready");
      });
      listen(image, "error", function () {
        if (!image.complete || image.naturalWidth > 0) return;
        loaded = false;
        if (!pending) {
          setState("error");
          announce(failureMessage(current));
        }
      });
      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-taskzero-view") === current));
        listen(button, "click", function () { selectView(button.getAttribute("data-taskzero-view")); });
      });
      if (label) label.textContent = views[current].label;
      if (fullImage) {
        fullImage.setAttribute("href", views[current].src);
        fullImage.setAttribute("target", "_blank");
        fullImage.setAttribute("rel", "noopener noreferrer");
      }
      updateSize(views[current]);
      setState(loaded ? "ready" : image.complete ? "error" : "loading");
      if (image.complete && !loaded) announce(failureMessage(current));
      else if (!loaded) announce("Loading " + views[current].label.toLowerCase() + "…");
    }

    function initKegPilotDemo() {
      const demo = byId("kegDemo");
      if (!demo) return;
      const toggle = byId("kegDemoToggle");
      const panel = byId("kegDemoPanel");
      const toggleNote = byId("kegDemoToggleNote");
      const commands = {
        update: "Update", outdated: "Outdated", upgrade: "Upgrade",
        cleanup: "Cleanup", autoremove: "Autoremove", doctor: "Doctor"
      };
      function validCommand(name) { return Object.prototype.hasOwnProperty.call(commands, name); }
      const buttons = all("button[data-keg-command]", demo)
        .filter(function (button) { return validCommand(button.getAttribute("data-keg-command")); });
      const stop = byId("kegStop");
      const resetButton = byId("kegReset");
      const clear = byId("kegClear");
      if (!buttons.length || !stop || !resetButton || !toggle || !panel) return;
      const commandLabel = byId("kegCommandLabel");
      const status = byId("kegStatus");
      const progress = byId("kegProgress");
      const log = byId("kegLog");
      const updateCount = byId("kegUpdateCount");
      const cacheSize = byId("kegCacheSize");
      const unusedCount = byId("kegUnusedCount");
      const packageList = byId("kegPackageList");
      // Fixed illustrative versions, not claims about current Homebrew releases.
      const samplePackages = [
        { name: "git", version: "2.47.0", latest: "2.48.1", unused: false },
        { name: "node", version: "22.11.0", latest: "22.12.0", unused: false },
        { name: "python@3.12", version: "3.12.7", latest: "3.12.7", unused: false },
        { name: "tree", version: "2.1.1", latest: "2.1.1", unused: true }
      ];
      const timers = new Set();
      const logLimit = 60;
      let generation = 0;
      let running = false;
      let lastTrigger = buttons[0];
      let packages = freshPackages();
      let cacheMB = 96;
      let expanded = false;

      function freshPackages() {
        return samplePackages.map(function (pkg) {
          return { name: pkg.name, version: pkg.version, latest: pkg.latest, unused: pkg.unused };
        });
      }

      function pendingUpgrades() {
        return packages.filter(function (pkg) { return pkg.version !== pkg.latest; });
      }

      function unusedPackages() {
        return packages.filter(function (pkg) { return pkg.unused; });
      }

      function announce(message) {
        if (status) status.textContent = message;
      }

      function setExpanded(next) {
        if (!next && running) return;
        const focusWasInside = Boolean(closest(doc.activeElement, "#kegDemoPanel"));
        expanded = Boolean(next);
        demo.setAttribute("data-keg-open", String(expanded));
        toggle.setAttribute("aria-expanded", String(expanded));
        // State is conveyed by aria-expanded and the visible note below. An
        // overriding aria-label is intentionally avoided here: it would not
        // contain the button's visible text and trips WCAG 2.5.3 (Label in Name).
        if (toggleNote) toggleNote.textContent = expanded
          ? "Close the sample-data panel when you are done."
          : "Open the sample-data panel to run a scripted maintenance check.";
        panel.hidden = !expanded;
        if (!expanded && focusWasInside) safeFocus(toggle);
        refreshLayout();
      }

      function appendLog(message, command) {
        if (!log) return;
        log.appendChild(element("p", "keg-log-line", "[simulation" + (command ? " / " + command : "") + "] " + message));
        while (log.children.length > logLimit) log.removeChild(log.firstChild);
        log.scrollTop = log.scrollHeight;
      }

      function setProgress(value) {
        if (!progress) return;
        progress.max = 100;
        progress.value = value;
        progress.textContent = value + "%";
        progress.setAttribute("aria-valuetext", value + "% of the simulated command");
      }

      function renderPackages() {
        if (updateCount) updateCount.textContent = String(pendingUpgrades().length);
        if (cacheSize) cacheSize.textContent = cacheMB + " MB";
        if (unusedCount) unusedCount.textContent = String(unusedPackages().length);
        if (!packageList) return;
        replaceContent(packageList);
        packages.forEach(function (pkg) {
          const outdated = pkg.version !== pkg.latest;
          const row = element("li", "keg-package-row");
          row.setAttribute("data-keg-package", pkg.name);
          row.appendChild(element("strong", "", pkg.name));
          row.appendChild(element("span", "keg-package-version", pkg.version + (outdated ? " → " + pkg.latest : "")));
          row.appendChild(element("span", "keg-package-state", pkg.unused ? "Unused dependency" : outdated ? "Update available" : "Current"));
          packageList.appendChild(row);
        });
      }

      function setState(state, restoreFocus) {
        const focused = doc.activeElement;
        const busy = state === "running";
        demo.setAttribute("data-keg-state", state);
        buttons.forEach(function (button) { button.disabled = busy; });
        if (clear) clear.disabled = busy;
        stop.disabled = !busy;
        resetButton.disabled = false;
        toggle.disabled = busy;
        if (restoreFocus === false) return;
        if (busy && (buttons.indexOf(focused) !== -1 || focused === clear)) safeFocus(stop);
        else if (!busy && focused === stop) safeFocus(lastTrigger || buttons[0] || resetButton);
      }

      function cancel() {
        generation += 1;
        timers.forEach(function (timer) { win.clearTimeout(timer); });
        timers.clear();
        running = false;
      }

      function resetSimulation() {
        cancel();
        packages = freshPackages();
        cacheMB = 96;
        renderPackages();
        setProgress(0);
        if (commandLabel) commandLabel.textContent = "Choose a command · simulation";
        if (log) replaceContent(log);
        appendLog("Browser-only scripted example. Sample versions are illustrative; no native command is run.");
        setState("idle");
        announce("Simulation ready — choose one of the six sample commands. Reset restores this sample data.");
        refreshLayout();
      }

      function commandPlan(name) {
        const pending = pendingUpgrades();
        const unused = unusedPackages();
        const versions = pending.map(function (pkg) { return pkg.name + " " + pkg.version + " → " + pkg.latest; }).join("; ");
        if (name === "update") return {
          steps: [
            "Reading the bundled sample definitions.",
            "Sample targets: git 2.48.1 and node 22.12.0.",
            "Installed sample versions stay unchanged; Update is not an Upgrade.",
            "Sample definitions refreshed; " + pending.length + " pending sample upgrades."
          ],
          commit: function () {
            packages.forEach(function (pkg) {
              const definition = samplePackages.find(function (sample) { return sample.name === pkg.name; });
              if (definition) pkg.latest = definition.latest;
            });
          }
        };
        if (name === "outdated") return {
          steps: [
            "Comparing installed and target sample versions.",
            pending.length ? versions + " (sample versions)." : "All sample packages are already current.",
            "Read-only report; sample package versions remain unchanged.",
            pending.length ? pending.length + " pending sample upgrades." : "No pending sample upgrades."
          ],
          commit: noop
        };
        if (name === "upgrade") return {
          steps: [
            pending.length ? "Preparing sample upgrades: " + pending.map(function (pkg) { return pkg.name; }).join(", ") + "." : "Checking the sample installed versions.",
            pending.length ? "Staging " + versions + " in memory; no changes applied yet." : "Sample git and node versions are already current.",
            pending.length ? "Ready to apply " + pending.length + " sample upgrades on completion." : "No sample upgrades to apply.",
            pending.length ? "Upgraded " + pending.length + " sample packages; no pending sample upgrades." : "Nothing to upgrade; sample package versions are unchanged."
          ],
          commit: function () { pending.forEach(function (pkg) { pkg.version = pkg.latest; }); }
        };
        if (name === "cleanup") return {
          steps: [
            "Inspecting simulated cached artifacts.",
            cacheMB ? "Found " + cacheMB + " MB of sample cache." : "Sample cache is already 0 MB.",
            cacheMB ? "Preparing to clear the sample cache on completion." : "No cached sample artifacts to remove.",
            cacheMB ? "Sample cache cleared: 0 MB." : "Nothing to clean; sample cache remains 0 MB."
          ],
          commit: function () { cacheMB = 0; }
        };
        if (name === "autoremove") return {
          steps: [
            "Checking the sample dependency list.",
            unused.length ? "Unused sample dependency: tree 2.1.1." : "No unused sample dependencies found.",
            unused.length ? "Preparing to remove the unused sample dependency on completion." : "No sample packages selected for removal.",
            unused.length ? "Removed " + unused.length + " unused sample dependency; other sample packages are unchanged." : "Nothing to autoremove; the sample package list is unchanged."
          ],
          commit: function () { packages = packages.filter(function (pkg) { return !pkg.unused; }); }
        };
        return {
          steps: [
            "Inspecting only the browser's sample dataset.",
            "Sample inventory: " + packages.length + " packages, " + pending.length + " pending upgrades.",
            "Sample maintenance: " + cacheMB + " MB cache; " + unused.length + " unused dependencies.",
            "Sample state is coherent; no host or Homebrew health check was performed."
          ],
          commit: noop
        };
      }

      function runCommand(name, trigger) {
        // Guard launches independently of the buttons' disabled state.
        if (running || !validCommand(name) || !expanded || panel.hidden) return;
        cancel();
        const token = generation;
        const plan = commandPlan(name);
        lastTrigger = trigger || buttons[0];
        running = true;
        setProgress(0);
        if (commandLabel) commandLabel.textContent = "brew " + name + " · simulation";
        setState("running");
        announce("Simulation running — " + commands[name] + ". Only the sample data is used.");
        appendLog("Selected brew " + name + "; scripted output follows.", name);

        function advance(index) {
          const timer = win.setTimeout(function () {
            timers.delete(timer);
            if (token !== generation || !running) return;
            const complete = index === plan.steps.length - 1;
            // All package/cache mutations are deferred to the final successful stage.
            if (complete) {
              plan.commit();
              renderPackages();
            }
            setProgress((index + 1) * 25);
            appendLog(plan.steps[index], name);
            if (complete) {
              running = false;
              setState("success");
              appendLog("Completed · simulated exit 0. No native command was executed.", name);
              announce("Simulation complete — " + plan.steps[index]);
              refreshLayout();
            } else {
              announce("Simulation " + commands[name] + " — stage " + (index + 1) + "/4. " + plan.steps[index]);
              advance(index + 1);
            }
          }, 360);
          timers.add(timer);
        }
        advance(0);
      }

      function stopSimulation(restoreFocus) {
        if (!running) return;
        cancel();
        setState("stopped", restoreFocus);
        // WebKit can blur Stop on pointer-down before its click handler runs.
        // An explicit Stop action still returns focus to an enabled command.
        if (restoreFocus !== false) safeFocus(lastTrigger || buttons[0] || resetButton);
        appendLog("Stopped; no pending changes applied. The pre-command sample state is unchanged.");
        announce("Simulation stopped — sample packages and cache are unchanged. Choose a command or Reset.");
        refreshLayout();
      }

      if (status) {
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        status.setAttribute("aria-atomic", "true");
      }
      if (log) {
        log.setAttribute("role", "log");
        // The concise status announces progress; avoid announcing the same output twice.
        log.setAttribute("aria-live", "off");
        log.setAttribute("aria-atomic", "false");
      }
      listen(toggle, "click", function () { setExpanded(!expanded); });
      all("[data-keg-demo-open]").forEach(function (link) {
        listen(link, "click", function () { setExpanded(true); });
      });
      listen(win, "hashchange", function () {
        if (win.location.hash === "#kegDemo") setExpanded(true);
      });
      buttons.forEach(function (button) {
        listen(button, "click", function () { runCommand(button.getAttribute("data-keg-command"), button); });
      });
      listen(stop, "click", function () { stopSimulation(); });
      listen(resetButton, "click", resetSimulation);
      listen(clear, "click", function () {
        if (running) return;
        if (log) replaceContent(log);
        announce("Simulation log cleared — sample package and cache state is unchanged.");
        refreshLayout();
      });
      listen(win, "pagehide", function () { stopSimulation(false); });
      setExpanded(win.location.hash === "#kegDemo");
      resetSimulation();
    }

    function initGuideExplorer() {
      const figure = query("figure.preview-quality.preview-qa-guide");
      const tablist = byId("guideChapterTabs");
      const panel = byId("guideChapterPanel");
      if (!figure || !tablist || !panel) return;

      // Local summaries of the supplied guide README; chapter selection never fetches content.
      const chapters = [
        {
          key: "strategy", number: 1, title: "Test Strategy & Planning", count: 25,
          summary: "Turn ambiguity into testable plans, estimate QA effort, prioritize risk, decide release readiness, and communicate tradeoffs.",
          points: [
            "Turn ambiguous requirements into testable plans.",
            "Prioritize risk, estimate QA effort, and make release-readiness decisions.",
            "Communicate tradeoffs and quality risk to stakeholders."
          ],
          week: "Week 1", track: "Foundation"
        },
        {
          key: "design", number: 2, title: "Test Design Techniques", count: 25,
          summary: "Choose and combine systematic techniques such as BVA, equivalence partitioning, decision tables, state transitions, and pairwise testing.",
          points: [
            "Apply boundary value analysis and equivalence partitioning.",
            "Use decision tables, state transitions, and pairwise testing for efficient coverage.",
            "Select techniques by risk and explain their coverage limits."
          ],
          week: "Week 1", track: "Foundation"
        },
        {
          key: "web-mobile", number: 3, title: "Web & Mobile Testing", count: 30,
          summary: "Use the CROSS framework to structure scenario-based web and mobile test answers across platforms, devices, and non-functional risks.",
          points: [
            "Use the CROSS framework: Clarify, Risk, Outline, Specify, Summarize.",
            "Design scenarios across web, iOS, Android, devices, and network conditions.",
            "Cover functional, security, performance, and accessibility risks."
          ],
          week: "Week 2", track: "Scenarios"
        },
        {
          key: "api", number: 4, title: "API & Integration Testing", count: 30,
          summary: "Cover contracts, idempotency, resilience, security, asynchronous APIs, and observability across integrations and microservices.",
          points: [
            "Test idempotency, contracts, authentication, and authorization.",
            "Exercise retries, timeouts, circuit breakers, and asynchronous APIs.",
            "Debug integrations with observability across microservices."
          ],
          week: "Week 2", track: "Scenarios"
        },
        {
          key: "automation", number: 5, title: "Automation Engineering", count: 25,
          summary: "Design maintainable automation frameworks, control flakiness, integrate CI/CD, and plan migrations.",
          points: [
            "Design maintainable frameworks with page objects, fixtures, and layered abstractions.",
            "Stabilize selectors, waits, test data, parallelism, and flaky tests.",
            "Connect automation to CI/CD, reporting, and migration strategy."
          ],
          week: "Week 3", track: "Technical"
        },
        {
          key: "java", number: 6, title: "Java Coding", count: 25,
          summary: "Practice Java coding with edge cases, optimized solutions, complexity analysis, and JUnit 5 tests.",
          points: [
            "Solve 25 Java problems with defensive, testable code.",
            "Handle edge cases and explain time/space complexity.",
            "Use JUnit 5 tests and narrate the reasoning."
          ],
          week: "Week 3", track: "Technical"
        },
        {
          key: "leadership", number: 7, title: "Behavioral & Leadership", count: 25,
          summary: "Use STAR + Learning to explain influence, conflict resolution, mentorship, and ownership of quality outcomes.",
          points: [
            "Structure stories with STAR + Learning.",
            "Influence without authority, resolve conflict, and mentor teammates.",
            "Own quality outcomes and communicate across technical and business levels."
          ],
          week: "Week 4", track: "Leadership"
        },
        {
          key: "system-design", number: 8, title: "System Design for QA", count: 30,
          summary: "Reason about distributed systems, failure modes, testing layers, chaos engineering, and observability.",
          points: [
            "Decompose distributed systems into testable components and failure modes.",
            "Layer unit, integration, contract, E2E, load, and chaos testing.",
            "Use CAP, observability, resilience, and contract testing at scale."
          ],
          week: "Week 4", track: "Leadership"
        }
      ];
      const byKey = Object.create(null);
      chapters.forEach(function (chapter) { byKey[chapter.key] = chapter; });
      const allTabs = all("button[data-guide-chapter]", tablist);
      const tabs = chapters.map(function (chapter) {
        return allTabs.find(function (button) { return button.getAttribute("data-guide-chapter") === chapter.key; });
      }).filter(Boolean);
      const progressLabel = byId("guideProgressLabel");
      const questionCount = byId("guideQuestionCount");
      const chapterTitle = byId("guideChapterTitle");
      const chapterSummary = byId("guideChapterSummary");
      const chapterPoints = byId("guideChapterPoints");
      const progress = byId("guideProgress");
      const status = byId("guideStatus");
      if (!tabs.length) return;
      const routePosition = query(".guide-progress-label span:last-child", figure);
      const weeks = all(".guide-week", figure);

      function selectChapter(key, moveFocus) {
        const chapter = byKey[key];
        if (!chapter) return false;
        const activeTab = tabs.find(function (button) { return button.getAttribute("data-guide-chapter") === key; });
        if (!activeTab) return false;
        const position = "0" + chapter.number + " / 0" + chapters.length;
        figure.setAttribute("data-guide-current", chapter.key);
        figure.setAttribute("data-guide-track", chapter.track);
        figure.setAttribute("data-guide-week", chapter.week);
        if (progressLabel) progressLabel.textContent = position;
        if (routePosition) routePosition.textContent = position;
        if (questionCount) {
          questionCount.textContent = chapter.count + " questions";
          questionCount.setAttribute("data-guide-count", String(chapter.count));
        }
        if (chapterTitle) chapterTitle.textContent = chapter.title;
        if (chapterSummary) chapterSummary.textContent = chapter.summary;
        if (chapterPoints) {
          replaceContent(chapterPoints);
          chapter.points.forEach(function (point) { chapterPoints.appendChild(element("li", "", point)); });
        }
        if (progress) {
          progress.max = chapters.length;
          progress.value = chapter.number;
          progress.textContent = "Chapter " + chapter.number + " of " + chapters.length;
          progress.setAttribute("aria-valuetext", "Chapter " + chapter.number + " of " + chapters.length + " · " + chapter.count + " questions");
        }
        panel.setAttribute("data-guide-current", chapter.key);
        panel.setAttribute("data-guide-track", chapter.track);
        panel.setAttribute("data-guide-week", chapter.week);
        allTabs.forEach(function (button) {
          const selected = button === activeTab;
          button.setAttribute("role", "tab");
          button.setAttribute("aria-selected", String(selected));
          button.setAttribute("tabindex", selected ? "0" : "-1");
          button.classList.toggle("is-active", selected);
          if (selected) {
            if (!button.id) button.id = "guide-tab-" + chapter.key;
            button.setAttribute("aria-controls", panel.id);
            panel.setAttribute("aria-labelledby", button.id);
          }
        });
        weeks.forEach(function (week, index) {
          const selected = chapter.week === "Week " + (index + 1);
          week.classList.toggle("is-current", selected);
          if (selected) week.setAttribute("aria-current", "step");
          else week.removeAttribute("aria-current");
        });
        if (status) status.textContent = "Showing chapter " + chapter.number + " of " + chapters.length + ": " + chapter.title +
          ", with " + chapter.count + " questions. Week " + chapter.week.replace("Week ", "") + " · " + chapter.track + ".";
        if (moveFocus) safeFocus(activeTab);
        refreshLayout();
        return true;
      }

      allTabs.forEach(function (button) {
        const key = button.getAttribute("data-guide-chapter");
        const chapter = byKey[key];
        button.setAttribute("role", "tab");
        button.setAttribute("aria-controls", panel.id);
        if (!button.id && chapter) button.id = "guide-tab-" + chapter.key;
        listen(button, "click", function (event) {
          event.preventDefault();
          selectChapter(button.getAttribute("data-guide-chapter"), true);
        });
        listen(button, "keydown", function (event) {
          if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
          const currentTabIndex = tabs.indexOf(button);
          if (currentTabIndex < 0) return;
          let nextIndex = -1;
          if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentTabIndex + 1) % tabs.length;
          else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentTabIndex - 1 + tabs.length) % tabs.length;
          else if (event.key === "Home") nextIndex = 0;
          else if (event.key === "End") nextIndex = tabs.length - 1;
          if (nextIndex < 0) return;
          event.preventDefault();
          selectChapter(tabs[nextIndex].getAttribute("data-guide-chapter"), true);
        });
      });

      tablist.setAttribute("role", "tablist");
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("tabindex", "0");
      if (status) {
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        status.setAttribute("aria-atomic", "true");
      }
      if (!selectChapter(figure.getAttribute("data-guide-current"), false)) {
        selectChapter(tabs[0].getAttribute("data-guide-chapter"), false);
      }
    }

    function initProjects() {
      const dialog = byId("projectDialog");
      const title = byId("projectDialogTitle");
      const body = byId("projectDialogBody");
      if (!dialog || !title || !body) return;
      const studies = {
        kegpilot: {
          title: "KegPilot", kind: "Native macOS / menu-bar companion",
          overview: "A native SwiftUI menu-bar app for Homebrew on Apple Silicon, requiring macOS 13 Ventura or newer. Maintenance, installed packages, updates, and a live command console share one MenuBarExtra panel.",
          tags: ["Swift", "SwiftUI", "macOS 13+", "Apple Silicon", "Homebrew"],
          problem: "Make routine package maintenance and its outcomes easier to follow from the menu bar, while using the Mac's existing Homebrew installation.",
          approach: ["Expose Update, Outdated, Upgrade, Cleanup, Autoremove, and Doctor as the six Maintenance actions.", "Browse and search installed formulae and casks, search Homebrew, and install or uninstall with confirmations.", "Offer per-package or all-package upgrades and pin labels, with streaming native console output, progress, Stop, duration, and exit codes."],
          toolkit: "Swift, SwiftUI, and the existing brew binary. The supplied native UI artwork may show versions predating the current release; its embedded output is not live data. The browser-only scripted maintenance demo uses memory-only sample data; this portfolio integration does not verify native app behavior.",
          constraints: "Requires existing Homebrew at /opt/homebrew. Distributed builds are locally ad-hoc signed, not Apple-notarized. KegPilot is independent and is not affiliated with or endorsed by Homebrew; native installation and command execution are outside this website demonstration.",
          website: "https://kegpilot.pages.dev/"
        },
        jotvella: {
          title: "Jotvella", kind: "Native macOS / note-taking workspace",
          overview: "A native SwiftUI and AppKit knowledge-base for macOS 13 or newer. Jotvella organizes notes into notebooks, sections, and pages, then gives each page a free-canvas workspace for writing and arranging ideas.",
          tags: ["SwiftUI", "AppKit", "macOS 13+", "Local-first", "OneNote import"],
          problem: "Give personal knowledge a familiar home without making the structure compete with the act of thinking, writing, and returning to an idea.",
          approach: ["Use a notebook → section → page hierarchy so notes have a natural place without forcing a single linear document model.", "Support rich text, tables, images, attachments, drawings, tags, and inter-page links on a free-canvas page.", "Keep the file-package model and local notebook store close to the source of truth, with OneNote section import and section-to-PDF export in the current macOS app."],
          toolkit: "SwiftUI with AppKit where needed, FileWrapper-backed notebook packages, TextKit/WebKit and PDFKit editor support, and a bundled Rust OneNote importer built from the public format specifications. The portfolio shows supplied workspace artwork only; it does not run or verify the native app.",
          constraints: "The working product name and .jotpkg, .jottoc, and .jotdoc extensions are provisional. The supplied README describes the build as locally signed and not Apple-notarized. The local sources establish macOS 13 support; architecture, encryption, cloud sync, and other roadmap items are not asserted here as independently verified shipped behavior.",
          website: "https://ahmadfaridabbas.github.io/jotvella/"
        },
        taskzero: {
          title: "TaskZero", kind: "Native macOS / menu-bar utility",
          overview: "A native SwiftUI menu-bar utility for macOS 13 Ventura or newer, built as a universal Apple Silicon and Intel binary. TaskZero reviews running applications and verified third-party background processes, then closes the ones you choose—using Apple's process and application APIs entirely on the Mac.",
          tags: ["Swift", "SwiftUI", "macOS 13+", "Apple Silicon + Intel", "Local-first"],
          problem: "Clearing out open apps and stray background processes usually means Activity Monitor or the terminal. TaskZero makes that a reviewed, one-click action from the menu bar without putting the system at risk.",
          approach: ["Inspect processes with libproc and discover regular apps through NSWorkspace, sorting each into eligible, protected, or excluded.", "Ask applications to quit gracefully first and send SIGTERM to background processes; force-quit is a last resort, user-owned only, and opt-in.", "Re-validate executable path, start time, and code signature immediately before any force action so a recycled PID is skipped, and let a cleanup be cancelled mid-run."],
          toolkit: "SwiftUI with MenuBarExtra, libproc for the process snapshot, NSWorkspace and NSRunningApplication for app discovery and termination, the Security framework for code-signature checks, and local UserDefaults for preferences and history. This portfolio shows supplied product screenshots only; it does not run or verify the native app.",
          constraints: "TaskZero is not sandboxed and is not a Mac App Store app—a process manager must enumerate and signal the user's own processes, which the App Sandbox forbids. It builds with the hardened runtime for Developer ID signing and notarization; distributed builds here are locally signed, so macOS may ask you to approve the app on first launch. It never uses sudo, changes SIP or Gatekeeper, or unloads launch agents and daemons.",
          website: "https://ahmadfaridabbas.github.io/TaskZero/"
        },
        bauhaus: {
          title: "Bauhaus Hands", kind: "Native macOS / independent customization",
          overview: "A native Objective-C clock screensaver for macOS 15.5+, with a universal Intel and Apple Silicon build. An independent customization of BauhausScreensaver, it brings independently selectable hands and a wider range of appearance controls to the clock. These previews are native offscreen renders fixed at 10:10:35, rather than photographs or System Settings screenshots.",
          tags: ["Objective-C", "macOS 15.5+", "Universal", "6 hand styles", "11 dials"],
          problem: "A clock's character depends on its hands, dial, typography, and movement together. The customization makes those choices independent while keeping their combined effect visible in the native Options preview.",
          approach: ["Choose Original, Baton, Dauphine, Leaf, Sword, or Needle independently for the hour, minute, and second hands. The default combines Dauphine hour and minute hands with a Needle second hand.", "Offer 11 dials with Day, Night, or System appearance and Quartz, Mechanical (eight steps per second), or Smooth movement.", "Combine numeral choices, custom colors, paper texture, glow, and typography with a live Options preview and Save, Cancel, and Reset controls."],
          toolkit: "Objective-C, native macOS screensaver rendering and settings, universal Intel/Apple Silicon compilation, and local code signing. The project README reports checks of native rendering, settings behavior, universal compilation, and signature verification; this portfolio integration does not test the native app.",
          constraints: "Requires macOS 15.5+. The build is locally signed, not Apple-notarized; installation and System Settings hosting have not been fully validated. On Tahoe, Options may stop reopening after Done: quit and reopen System Settings, then try Options again. Next steps include installation/host validation and resolving that reopening issue.",
          website: "https://ahmadfaridabbas.github.io/bauhaus-clock/",
          credit: {
            text: "An independent customization of BauhausScreensaver, created by Aryan Randeriya. Original author notices are retained. No explicit upstream license file was found, so no upstream license is confirmed.",
            label: "BauhausScreensaver by Aryan Randeriya ↗",
            url: "https://github.com/aryanranderiya/BauhausScreensaver"
          }
        },
        keepawake: {
          title: "KeepAwake", kind: "Native macOS / menu-bar utility",
          overview: "A native SwiftUI menu-bar app for macOS 26.0 Tahoe or later on Intel and Apple silicon. It wraps /usr/bin/caffeinate for one-click indefinite awake or 30m, 1h, 2h, 4h, 8h, and custom timers, with live countdown and progress, moon inactive, sun always-on, and timer-active icons.",
          tags: ["SwiftUI", "macOS 26.0 / Tahoe+", "Intel + Apple silicon", "caffeinate", "Menu bar"],
          problem: "Make it simple to keep a Mac awake for a defined period or indefinitely, while making the current sleep-prevention mode and remaining time clear from the menu bar.",
          approach: ["Offer one-click indefinite awake alongside 30-minute, 1-hour, 2-hour, 4-hour, 8-hour, and custom timers.", "Show live countdown and progress, with moon inactive, sun always-on, and timer-active icon states.", "Provide global shortcuts, configurable display versus system idle sleep, and launch at login through SMAppService."],
          toolkit: "SwiftUI, /usr/bin/caffeinate, SMAppService, and the macOS shortcut and notification capabilities. Accessibility is required for the global shortcut engine; Notifications are optional. This portfolio shows supplied product screenshots only; it does not run caffeinate or verify native runtime permissions.",
          constraints: "Requires macOS 26.0 Tahoe or later and supports Intel and Apple silicon. The app uses no third-party background daemons. The distributed app is unsigned and not notarized; native runtime behavior, permissions, and launch-at-login behavior are outside this website demonstration.",
          website: "https://github.com/ahmadfaridabbas/KeepAwake"
        },
        quality: {
          title: "Quality Engineering", kind: "Engineering practice / professional overview",
          overview: "My quality-engineering practice across SaaS products, web, mobile, APIs, AI integrations, and CI/CD. This case study represents professional practice, not a separate software product. The Senior QA Interview Master Guide is a separate public interview-preparation resource with 8 chapters and 200+ questions; this portfolio presents it as a companion resource, not as the guide itself.",
          tags: ["SaaS", "Web & mobile", "APIs", "AI integrations", "CI/CD", "8 chapters", "200+ questions"],
          problem: "Reliable products depend on behavior across layers: user workflows, access controls, integrations, backend services, and release pipelines. Coverage needs to follow those risks.",
          approach: ["Validate REST and WebSocket APIs, webhooks, integrations, and multi-tenant access controls.", "Build regression coverage with Postman and Pytest, and connect tests to GitHub Actions or Jenkins workflows.", "Examine AI response quality, consistency, and context retention alongside web and mobile scenarios.", "Work with product and engineering teams on release strategies, reproducible findings, and environment-specific coverage.", "Use the guide's four-week plan as a companion study path: Foundation, Scenarios, Technical, and Leadership."],
          toolkit: "Postman, Pytest, Python, JMeter, k6, Jira, TestRail, WebdriverIO, Virtuoso, GitHub Actions, and Jenkins, as reflected in the experience and toolkit sections. The guide adds full model answers, step-by-step frameworks, real-world examples, code examples in Java, TypeScript, and bash, follow-up questions, Senior vs. Junior distinctions, diagrams, and tables.",
          constraints: "Test evidence depends on realistic environments, representative data, and clearly defined release criteria. The Quality Lab on this page is a local illustrative simulation; real release decisions require actual checks and team review. The Senior QA Interview Master Guide is licensed CC BY-NC-SA 4.0 and is available at https://github.com/ahmadfaridabbas/Senior-QA-Interview-Master-Guide. This portfolio's chapter explorer is local and does not fetch or execute the remote guide.",
          website: "https://github.com/ahmadfaridabbas/Senior-QA-Interview-Master-Guide"
        }
      };

      function studySection(heading, content) {
        const section = element("section", "dialog-section");
        section.appendChild(element("h3", "dialog-section-title", heading));
        if (Array.isArray(content)) {
          const list = element("ul", "dialog-list");
          content.forEach(function (line) { list.appendChild(element("li", "", line)); });
          section.appendChild(list);
        } else section.appendChild(element("p", "", content));
        return section;
      }

      function populate(study) {
        title.textContent = study.title;
        const content = element("div", "project-dialog-content");
        content.appendChild(element("p", "dialog-eyebrow mono-label", study.kind));
        content.appendChild(studySection("Overview", study.overview));
        const tags = element("ul", "dialog-tags");
        study.tags.forEach(function (tag) { tags.appendChild(element("li", "", tag)); });
        content.appendChild(tags);
        const sections = element("div", "dialog-section-grid");
        sections.appendChild(studySection("The problem", study.problem));
        sections.appendChild(studySection("The approach", study.approach));
        sections.appendChild(studySection("Toolkit", study.toolkit));
        sections.appendChild(studySection("Constraints / next steps", study.constraints));
        content.appendChild(sections);
        if (study.credit) {
          const attribution = studySection("Origins / attribution", study.credit.text);
          const creditLink = element("a", "", study.credit.label);
          creditLink.href = study.credit.url;
          creditLink.target = "_blank";
          creditLink.rel = "noopener noreferrer";
          attribution.appendChild(creditLink);
          content.appendChild(attribution);
        }
        const actions = element("div", "dialog-actions");
        const projectLink = element("a", "button button-primary", study.website ? "Visit project website ↗" : "Explore my GitHub ↗");
        projectLink.href = study.website || PROFILE_URL;
        projectLink.target = "_blank";
        projectLink.rel = "noopener noreferrer";
        actions.appendChild(projectLink);
        content.appendChild(actions);
        replaceContent(body, content);
        body.scrollTop = 0;
      }

      all("[data-project]").forEach(function (trigger) {
        const name = trigger.getAttribute("data-project");
        if (!Object.prototype.hasOwnProperty.call(studies, name)) return;
        const study = studies[name];
        trigger.setAttribute("aria-haspopup", "dialog");
        trigger.setAttribute("aria-controls", dialog.id);
        listen(trigger, "click", function (event) {
          event.preventDefault();
          populate(study);
          dialogs.open(dialog, trigger);
          dialog.scrollTop = 0;
        });
      });
    }

    function initCommands() {
      const dialog = byId("commandDialog");
      const search = byId("commandSearch");
      const results = byId("commandResults");
      const trigger = byId("commandTrigger");
      if (!dialog || !search || !results) return;
      const names = ["experience", "work", "lab", "about", "contact", "theme", "motion", "copy"];
      const buttons = all("button[data-command]", results).filter(function (button) {
        return names.indexOf(button.getAttribute("data-command")) !== -1;
      });
      let visible = buttons.slice();
      let activeIndex = -1;
      let empty = query(".command-empty", results);
      if (!empty) {
        empty = element(/^(UL|OL)$/.test(results.tagName) ? "li" : "p", "command-empty", "No matching actions. Try “work”, “theme”, or “copy”.");
        empty.setAttribute("role", "status");
        empty.hidden = true;
        results.appendChild(empty);
      }
      search.setAttribute("aria-controls", results.id);
      if (trigger) {
        trigger.setAttribute("aria-haspopup", "dialog");
        trigger.setAttribute("aria-controls", dialog.id);
      }

      function setActive(index, moveFocus, scroll) {
        activeIndex = visible.length ? (index + visible.length) % visible.length : -1;
        const active = visible[activeIndex];
        buttons.forEach(function (button) {
          button.classList.toggle("is-active", button === active);
          // These are ordinary action buttons, not listbox options or tabs.
          if (button === active) button.setAttribute("aria-current", "true");
          else button.removeAttribute("aria-current");
        });
        if (active && moveFocus) safeFocus(active);
        if (active && scroll && typeof active.scrollIntoView === "function") {
          try { active.scrollIntoView({ block: "nearest", behavior: "auto" }); } catch (_) { /* Focus remains usable. */ }
        }
      }

      function filterSearch() {
        const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        buttons.forEach(function (button) {
          const text = [button.textContent, button.getAttribute("data-description"), button.getAttribute("aria-label")]
            .filter(Boolean).join(" ").toLocaleLowerCase();
          button.hidden = !words.every(function (word) { return text.indexOf(word) !== -1; });
          const listItem = closest(button, "li");
          if (listItem && listItem.parentElement === results) listItem.hidden = button.hidden;
        });
        visible = buttons.filter(function (button) { return !button.hidden; });
        empty.hidden = visible.length !== 0;
        setActive(0, false, false);
      }

      function updateSettingLabels() {
        buttons.forEach(function (button) {
          const command = button.getAttribute("data-command");
          const description = query(".command-description", button) || query(".command-desc", button);
          if (command === "theme") {
            // Let the accessible name come from the button's own visible text so it
            // can never mismatch (WCAG 2.5.3). State is carried in the visible note.
            button.removeAttribute("aria-label");
            if (description) description.textContent = "Currently " + theme + " — switch to " + (theme === "dark" ? "light" : "dark");
          } else if (command === "motion") {
            button.removeAttribute("aria-label");
            button.setAttribute("aria-pressed", String(motionEnabled));
            if (description) description.textContent = reducedMedia.matches
              ? "Off — respecting system reduced motion" : motionEnabled ? "Pause decorative motion" : "Enable decorative motion";
          }
        });
        if (activeDialog && activeDialog.dialog === dialog) filterSearch();
      }

      function openCommands(returnTarget) {
        search.value = "";
        updateSettingLabels();
        filterSearch();
        dialogs.open(dialog, returnTarget || trigger || doc.activeElement, search);
      }

      function execute(button) {
        if (!button || button.hidden) return;
        const action = button.getAttribute("data-command");
        dialogs.close();
        if (action === "theme") toggleTheme();
        else if (action === "motion") toggleMotion();
        else if (action === "copy") copyProfile();
        else if (["experience", "work", "lab", "about", "contact"].indexOf(action) !== -1) navigateTo(action);
      }

      buttons.forEach(function (button) {
        button.classList.add("command-item");
        button.removeAttribute("aria-selected");
        listen(button, "click", function (event) { event.preventDefault(); execute(button); });
        listen(button, "focus", function () { setActive(visible.indexOf(button), false, false); });
        listen(button, "pointerenter", function () {
          if (!button.hidden) setActive(visible.indexOf(button), false, false);
        });
      });
      listen(trigger, "click", function (event) { event.preventDefault(); openCommands(trigger); });
      listen(search, "input", filterSearch);
      listen(dialog, "keydown", function (event) {
        if (!activeDialog || activeDialog.dialog !== dialog || event.isComposing || event.altKey || event.metaKey || event.ctrlKey) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const index = event.target === search
            ? (event.key === "ArrowDown" ? 0 : visible.length - 1)
            : activeIndex + (event.key === "ArrowDown" ? 1 : -1);
          setActive(index, true, true);
        } else if (event.key === "Enter" && event.target === search) {
          event.preventDefault();
          execute(visible[activeIndex]);
        } else if (closest(event.target, "button[data-command]") && event.key.length === 1 && !event.defaultPrevented) {
          // Typing after arrow navigation returns naturally to the search field.
          if (event.key === " ") return; // Keep the normal Space-to-activate button behavior.
          event.preventDefault();
          safeFocus(search);
          const from = typeof search.selectionStart === "number" ? search.selectionStart : search.value.length;
          const to = typeof search.selectionEnd === "number" ? search.selectionEnd : from;
          search.value = search.value.slice(0, from) + event.key + search.value.slice(to);
          try { search.setSelectionRange(from + 1, from + 1); } catch (_) { /* Search still filters. */ }
          filterSearch();
        }
      });
      listen(doc, "keydown", function (event) {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          if (activeDialog && activeDialog.dialog === dialog) dialogs.close();
          else openCommands(activeDialog ? activeDialog.trigger : doc.activeElement);
        }
      });
      themeSubscribers.push(updateSettingLabels);
      motionSubscribers.push(updateSettingLabels);
      updateSettingLabels();
      filterSearch();
    }

    function initLab() {
      const run = byId("labRun");
      const resetButton = byId("labReset");
      const progress = byId("labProgress");
      const status = byId("labStatus");
      const log = byId("labLog");
      const consolePanel = query(".lab-console") || (log && log.parentElement);
      if (!run || !resetButton) return;
      const steps = [
        { key: "request", label: "Request validation", message: "Example request: required fields accepted; malformed input rejected." },
        { key: "schema", label: "Schema check", message: "Example response: required properties and field types match the sample schema." },
        { key: "security", label: "Security negative case", message: "Unauthorized example denied — an illustrative access-control negative case." },
        { key: "release", label: "Release gate", message: "Sample gates satisfied. A real release needs actual test evidence and team review." }
      ];
      const timers = new Set();
      let generation = 0;
      let running = false;
      if (status) {
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
      }
      if (progress) progress.max = 100;

      function appendLog(message, key) {
        if (!log) return;
        const text = (key ? "[" + key + "] " : "") + message;
        if (log.tagName === "PRE" || log.tagName === "TEXTAREA") log.textContent += text + "\n";
        else {
          const line = element(/^(UL|OL)$/.test(log.tagName) ? "li" : "p", "lab-log-line", text);
          log.appendChild(line);
        }
        log.scrollTop = log.scrollHeight;
      }

      function setProgress(value) {
        if (!progress) return;
        progress.value = value;
        progress.textContent = value + "%";
      }

      function setStep(step, state) {
        const node = query('[data-lab-step="' + step.key + '"]');
        if (!node) return;
        node.setAttribute("data-state", state);
        const label = query(".lab-step-status", node);
        if (label) label.textContent = state === "pass" ? "Pass" : state === "running" ? "Checking…" : "Idle";
      }

      function cancel() {
        generation += 1;
        timers.forEach(function (timer) { win.clearTimeout(timer); });
        timers.clear();
        running = false;
      }

      function resetView(message) {
        run.disabled = false;
        resetButton.disabled = false;
        setProgress(0);
        steps.forEach(function (step) { setStep(step, "idle"); });
        if (status) status.textContent = message;
        if (consolePanel) consolePanel.setAttribute("aria-busy", "false");
        if (log) replaceContent(log);
        appendLog("Local illustrative simulation. Press Run to walk through four example checks.", "demo");
        refreshLayout();
      }

      function reset() {
        cancel();
        resetView("Reset — ready to run the simulation again.");
      }

      function runSimulation() {
        if (running) return;
        cancel();
        const token = generation;
        resetView("Simulation running — four illustrative checks.");
        running = true;
        run.disabled = true;
        if (consolePanel) consolePanel.setAttribute("aria-busy", "true");
        if (log) replaceContent(log);
        appendLog("Illustrative checks only; this demo sends no network requests.", "demo");
        function advance(index) {
          if (token !== generation) return;
          const step = steps[index];
          setStep(step, "running");
          if (status) status.textContent = "Simulation " + (index + 1) + "/4 — " + step.label.toLowerCase() + ".";
          const timer = win.setTimeout(function () {
            timers.delete(timer);
            if (token !== generation) return;
            setStep(step, "pass");
            setProgress((index + 1) * 25);
            appendLog(step.message, step.key);
            if (index < steps.length - 1) advance(index + 1);
            else {
              running = false;
              run.disabled = false;
              if (consolePanel) consolePanel.setAttribute("aria-busy", "false");
              if (status) status.textContent = "Simulation complete — four illustrative checks passed. Run again or reset.";
              refreshLayout();
            }
          }, 520);
          timers.add(timer);
        }
        advance(0);
      }

      listen(run, "click", runSimulation);
      listen(resetButton, "click", reset);
      listen(win, "pagehide", reset);
      resetView("Ready — run the illustrative quality simulation.");
    }

    function initProcess() {
      const buttons = all("[data-process]");
      const title = byId("processTitle");
      const description = byId("processDescription");
      const code = byId("processCode");
      if (!buttons.length) return;
      const workflow = {
        understand: {
          title: "Understand the real problem.",
          description: "Identify the need, the surrounding system, and what a useful outcome would look like. Define success before choosing a solution.",
          code: "problem = clarify(user_need)\nsuccess = define(observable_outcome)\nconstraints = map(system_context)"
        },
        design: {
          title: "Design around the workflow.",
          description: "Create a simple solution around the actual workflow. Make the important decisions and constraints visible before committing to implementation.",
          code: "workflow = sketch(problem)\nsolution = simplify(workflow)\nreview(solution, constraints)"
        },
        build: {
          title: "Build with purpose.",
          description: "Turn the idea into working software with focused changes. Use practical tools, APIs, and automation where they make the workflow simpler.",
          code: "product = implement(solution)\nautomate(repetitive_work)\nkeep_changes(focused = true)"
        },
        test: {
          title: "Challenge the solution.",
          description: "Validate the expected path, boundaries, and failure cases. Systematic testing and reproducible findings provide evidence for the next decision.",
          code: "scenarios = cover(paths, edges, failures)\nevidence = validate(product, scenarios)\nrecord(reproducible_findings)"
        },
        improve: {
          title: "Refine from evidence.",
          description: "Review the results, listen to feedback, and improve the details that matter. Iterate deliberately so the product becomes more useful and reliable.",
          code: "feedback = review(evidence, user_needs)\nrefine(product, feedback)\nrepeat_with_intent()"
        }
      };
      function select(name) {
        if (!Object.prototype.hasOwnProperty.call(workflow, name)) return;
        const step = workflow[name];
        buttons.forEach(function (button) {
          const selected = button.getAttribute("data-process") === name;
          button.setAttribute("aria-pressed", String(selected));
          button.classList.toggle("is-active", selected);
        });
        if (title) title.textContent = step.title;
        if (description) description.textContent = step.description;
        if (code) {
          const target = query("code", code) || code;
          target.textContent = "// Illustrative workflow\n" + step.code;
        }
      }
      buttons.forEach(function (button) {
        listen(button, "click", function () { select(button.getAttribute("data-process")); });
      });
      select("understand");
    }

    function initOrbitalCanvas() {
      const canvas = byId("heroCanvas");
      if (!canvas || typeof canvas.getContext !== "function") return;
      const art = closest(canvas, ".hero-art") || canvas.parentElement;
      const stage = closest(canvas, ".art-stage") || art;
      if (!art || !stage) return;
      let ctx = null;
      try { ctx = canvas.getContext("2d", { alpha: true }); } catch (_) { return; }
      if (!ctx) return; // The HTML's static composition remains the accessible fallback.

      const TAU = Math.PI * 2;
      const orbitModels = [
        [1.49, 1.14, 0.86, -0.36, 0.36],
        [1.64, 1.12, -0.56, 0.68, -0.45],
        [1.35, 1.22, 1.26, 0.42, 0.10]
      ].map(function (model) {
        return { major: model[0], minor: model[1],
          cosX: Math.cos(model[2]), sinX: Math.sin(model[2]),
          cosY: Math.cos(model[3]), sinY: Math.sin(model[3]),
          cosZ: Math.cos(model[4]), sinZ: Math.sin(model[4]) };
      });
      const curves = [];
      const orbitalCurves = [];
      const sphereDots = [];
      const axes = [];
      const disposers = [];
      let viewportObserver = null;
      let sizeObserver = null;
      let width = 0;
      let height = 0;
      let dpr = 1;
      let frame = 0;
      let lastPaint = 0;
      let lastTick = 0;
      let elapsed = 0;
      let failed = false;
      let needsRender = true;
      let sceneVisible = false;
      let targetX = 0;
      let targetY = 0;
      let pointerX = 0;
      let pointerY = 0;
      let colors = null;
      let darkScene = true;
      let centerX = 0;
      let centerY = 0;
      let radius = 0;
      let cosYaw = 1;
      let sinYaw = 0;
      let cosPitch = 1;
      let sinPitch = 0;
      const cosRoll = Math.cos(-0.24);
      const sinRoll = Math.sin(-0.24);

      function color(ink, alpha) {
        return "rgba(" + colors[ink] + "," + alpha + ")";
      }

      function updateColors() {
        darkScene = theme === "dark";
        // A light page may intentionally keep its art panel dark. Read its actual
        // CSS surface so transparent canvas strokes keep their intended contrast.
        try {
          if (typeof win.getComputedStyle === "function") {
            const rgb = win.getComputedStyle(art).backgroundColor.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
            if (rgb) darkScene = Number(rgb[1]) * 0.2126 + Number(rgb[2]) * 0.7152 + Number(rgb[3]) * 0.0722 < 145;
          }
        } catch (_) { /* The root theme provides a sensible palette fallback. */ }
        colors = !darkScene
          ? { emerald: "24,112,78", lime: "104,129,40", white: "18,62,45", muted: "73,112,92" }
          : { emerald: theme === "light" ? "148,226,191" : "123,220,181",
            lime: "214,249,133", white: "242,241,232", muted: "144,179,161" };
      }

      function modelOrbit(index, angle) {
        const model = orbitModels[index];
        const x = Math.cos(angle) * model.major;
        const y = Math.sin(angle) * model.minor;
        const y1 = y * model.cosX;
        const z1 = y * model.sinX;
        const x2 = x * model.cosY + z1 * model.sinY;
        const z2 = -x * model.sinY + z1 * model.cosY;
        return [x2 * model.cosZ - y1 * model.sinZ, x2 * model.sinZ + y1 * model.cosZ, z2];
      }

      function sampleCurve(sample, segments, ink) {
        const points = new Float32Array((segments + 1) * 3);
        for (let index = 0; index <= segments; index += 1) {
          const point = sample(index / segments * TAU);
          points[index * 3] = point[0];
          points[index * 3 + 1] = point[1];
          points[index * 3 + 2] = point[2];
        }
        return { points: points, projected: new Float32Array(points.length), segments: segments, ink: ink };
      }

      // Fixed, sampled geometry: a spherical lattice and three inclined elliptical orbits.
      // No particle population growth, pairwise connections, or per-frame geometry rebuilding.
      for (let meridian = 0; meridian < 12; meridian += 1) {
        const longitude = meridian / 12 * Math.PI;
        curves.push(sampleCurve(function (angle) {
          return [Math.sin(angle) * Math.cos(longitude), Math.cos(angle), Math.sin(angle) * Math.sin(longitude)];
        }, 96, meridian % 4 === 0 ? "lime" : "emerald"));
      }
      [-65, -45, -25, -12, 12, 25, 45, 65].forEach(function (degrees) {
        const latitude = degrees * Math.PI / 180;
        const ringRadius = Math.cos(latitude);
        curves.push(sampleCurve(function (angle) {
          return [Math.cos(angle) * ringRadius, Math.sin(latitude), Math.sin(angle) * ringRadius];
        }, 112, "emerald"));
      });
      for (let orbit = 0; orbit < 3; orbit += 1) {
        orbitalCurves.push(sampleCurve(function (angle) { return modelOrbit(orbit, angle); }, 160, orbit === 1 ? "emerald" : "lime"));
      }
      const equator = sampleCurve(function (angle) { return [Math.cos(angle) * 1.015, 0, Math.sin(angle) * 1.015]; }, 128, "lime");
      for (let axis = 0; axis < 3; axis += 1) {
        const startPoint = [0, 0, 0];
        const endPoint = [0, 0, 0];
        startPoint[axis] = -1.20;
        endPoint[axis] = 1.20;
        axes.push({ start: startPoint, end: endPoint });
      }
      for (let dot = 0; dot < 12; dot += 1) {
        const y = 1 - 2 * (dot + 0.5) / 12;
        const ringRadius = Math.sqrt(1 - y * y) * 1.006;
        const longitude = dot * 2.3999632297;
        sphereDots.push([Math.cos(longitude) * ringRadius, y, Math.sin(longitude) * ringRadius]);
      }

      function project(x, y, z, destination, index) {
        const x1 = x * cosYaw + z * sinYaw;
        const z1 = -x * sinYaw + z * cosYaw;
        const y2 = y * cosPitch - z1 * sinPitch;
        const z2 = y * sinPitch + z1 * cosPitch;
        const x3 = x1 * cosRoll - y2 * sinRoll;
        const y3 = x1 * sinRoll + y2 * cosRoll;
        const perspective = 4.8 / (4.8 - z2);
        destination[index] = centerX + x3 * radius * perspective;
        destination[index + 1] = centerY + y3 * radius * perspective;
        destination[index + 2] = z2;
      }

      function projectPoint(point) {
        const projected = [0, 0, 0];
        project(point[0], point[1], point[2], projected, 0);
        return projected;
      }

      function projectCurve(curve) {
        for (let index = 0; index < curve.points.length; index += 3) {
          project(curve.points[index], curve.points[index + 1], curve.points[index + 2], curve.projected, index);
        }
      }

      function strokeCurve(curve, front, alpha, lineWidth, dotted) {
        ctx.beginPath();
        let previousEnd = -1;
        const points = curve.projected;
        for (let index = 3; index < points.length; index += 3) {
          if ((points[index - 1] + points[index + 2] >= 0) !== front) continue;
          if (previousEnd !== index - 3) ctx.moveTo(points[index - 3], points[index - 2]);
          ctx.lineTo(points[index], points[index + 1]);
          previousEnd = index;
        }
        ctx.strokeStyle = color(curve.ink, alpha);
        ctx.lineWidth = lineWidth;
        if (dotted) ctx.setLineDash([1, 5.4]);
        ctx.stroke();
        if (dotted) ctx.setLineDash([]);
      }

      function paintDot(point, size, ink, alpha, glow) {
        const depth = clamp((point[2] + 1.7) / 3.4, 0, 1);
        const scaledSize = size * (4.8 / (4.8 - point[2]));
        const opacity = alpha * (0.26 + depth * 0.74);
        if (glow && point[2] > -0.2) {
          ctx.beginPath();
          ctx.arc(point[0], point[1], scaledSize * 2.7, 0, TAU);
          ctx.fillStyle = color(ink, opacity * 0.10);
          ctx.fill();
          ctx.shadowColor = color(ink, opacity * 0.85);
          ctx.shadowBlur = 12;
        }
        ctx.beginPath();
        ctx.arc(point[0], point[1], scaledSize, 0, TAU);
        ctx.fillStyle = color(ink, opacity);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (glow && point[2] > 0) {
          ctx.beginPath();
          ctx.arc(point[0], point[1], scaledSize * 0.35, 0, TAU);
          ctx.fillStyle = color("white", opacity);
          ctx.fill();
        }
      }

      function drawScene() {
        if (!width || !height) return;
        const time = motionEnabled ? elapsed : 0;
        const parallaxX = decorationsAllowed() ? pointerX : 0;
        const parallaxY = decorationsAllowed() ? pointerY : 0;
        centerX = width * 0.50 + parallaxX * 5;
        centerY = height * 0.50 + parallaxY * 4;
        radius = Math.min(width * 0.275, height * 0.31);
        const yaw = 0.57 + time * 0.045 + parallaxX * 0.10;
        const pitch = -0.30 + parallaxY * 0.075;
        cosYaw = Math.cos(yaw);
        sinYaw = Math.sin(yaw);
        cosPitch = Math.cos(pitch);
        sinPitch = Math.sin(pitch);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = 1;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);

        const halo = ctx.createRadialGradient(centerX - radius * 0.18, centerY - radius * 0.15, radius * 0.1,
          centerX, centerY, radius * 1.8);
        halo.addColorStop(0, color("emerald", darkScene ? 0.06 : 0.04));
        halo.addColorStop(0.65, color("emerald", 0.014));
        halo.addColorStop(1, color("emerald", 0));
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, width, height);

        curves.forEach(projectCurve);
        orbitalCurves.forEach(projectCurve);
        projectCurve(equator);
        orbitalCurves.forEach(function (curve) { strokeCurve(curve, false, 0.19, 0.8, false); });
        curves.forEach(function (curve) { strokeCurve(curve, false, darkScene ? 0.11 : 0.15, 0.65, false); });
        strokeCurve(equator, false, 0.22, 1, true);

        ctx.setLineDash([1.2, 7]);
        ctx.strokeStyle = color("muted", 0.24);
        ctx.lineWidth = 0.75;
        axes.forEach(function (axis) {
          const from = projectPoint(axis.start);
          const to = projectPoint(axis.end);
          ctx.beginPath();
          ctx.moveTo(from[0], from[1]);
          ctx.lineTo(to[0], to[1]);
          ctx.stroke();
        });
        ctx.setLineDash([]);
        curves.forEach(function (curve) { strokeCurve(curve, true, darkScene ? 0.34 : 0.38, 0.8, false); });
        strokeCurve(equator, true, 0.74, 1.2, true);
        orbitalCurves.forEach(function (curve, index) { strokeCurve(curve, true, index === 0 ? 0.82 : 0.60, index === 0 ? 1.2 : 1, false); });

        sphereDots.forEach(function (point, index) {
          paintDot(projectPoint(point), index % 3 === 0 ? 2.0 : 1.3, index % 3 === 0 ? "lime" : "emerald", 0.84, index % 3 === 0);
        });
        axes.forEach(function (axis) {
          paintDot(projectPoint(axis.start), 1.25, "muted", 0.60, false);
          paintDot(projectPoint(axis.end), 1.25, "muted", 0.60, false);
        });
        for (let orbit = 0; orbit < 3; orbit += 1) {
          const direction = orbit === 1 ? -1 : 1;
          for (let node = 0; node < 2; node += 1) {
            const angle = orbit * 0.91 + node * Math.PI + direction * time * 0.075;
            const ink = orbit === 1 ? "emerald" : "lime";
            for (let trail = 5; trail >= 1; trail -= 1) {
              const point = projectPoint(modelOrbit(orbit, angle - direction * trail * 0.065));
              paintDot(point, 0.75, ink, (6 - trail) * 0.085, false);
            }
            paintDot(projectPoint(modelOrbit(orbit, angle)), orbit === 0 ? 3.2 : 2.4, ink, 0.97, true);
          }
        }
        art.classList.add("canvas-ready");
        needsRender = false;
      }

      function stop() {
        if (frame && canFrame) win.cancelAnimationFrame(frame);
        frame = 0;
        lastPaint = 0;
        lastTick = 0;
      }

      function failCanvas() {
        failed = true;
        stop();
        art.classList.remove("canvas-ready");
        if (viewportObserver) viewportObserver.disconnect();
        if (sizeObserver) sizeObserver.disconnect();
        disposers.forEach(function (dispose) { dispose(); });
      }

      function render() {
        try { drawScene(); } catch (_) { failCanvas(); }
      }

      function mayAnimate() {
        return !failed && canFrame && decorationsAllowed() && sceneVisible &&
          doc.visibilityState !== "hidden" && width > 0 && height > 0;
      }

      function tick(timestamp) {
        frame = 0;
        if (!mayAnimate()) { stop(); return; }
        // Bound paint work to about 30fps; paused time never accumulates.
        if (!lastPaint || timestamp - lastPaint >= 32) {
          elapsed += lastTick ? clamp((timestamp - lastTick) / 1000, 0, 0.08) : 0;
          lastTick = timestamp;
          lastPaint = timestamp;
          pointerX += (targetX - pointerX) * 0.12;
          pointerY += (targetY - pointerY) * 0.12;
          render();
        }
        if (mayAnimate()) frame = win.requestAnimationFrame(tick);
      }

      function inViewport() {
        const rect = stage.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
          rect.top < (win.innerHeight || root.clientHeight) && rect.left < (win.innerWidth || root.clientWidth);
      }

      function measure() {
        if (failed) return;
        const rect = stage.getBoundingClientRect();
        const nextWidth = Math.round(rect.width);
        const nextHeight = Math.round(rect.height);
        const nextDpr = clamp(win.devicePixelRatio || 1, 1, 2);
        if (!nextWidth || !nextHeight) {
          width = nextWidth;
          height = nextHeight;
          needsRender = true;
          stop();
          return;
        }
        if (width !== nextWidth || height !== nextHeight || dpr !== nextDpr) {
          width = nextWidth;
          height = nextHeight;
          dpr = nextDpr;
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
          needsRender = true;
        }
      }

      function synchronize() {
        if (failed) return;
        if (!mayAnimate()) stop();
        if (pageVisible && sceneVisible && needsRender) render();
        if (mayAnimate() && !frame) frame = win.requestAnimationFrame(tick);
      }

      function resetPointer() {
        targetX = 0;
        targetY = 0;
        pointerX = 0;
        pointerY = 0;
        needsRender = true;
        synchronize();
      }

      updateColors();
      try {
        measure();
        sceneVisible = inViewport();
        if (pageVisible && width && height) render();
        if (failed) return;
        if (typeof win.IntersectionObserver === "function") {
          try {
            viewportObserver = new win.IntersectionObserver(function (entries) {
              if (failed) return;
              entries.forEach(function (entry) {
                if (entry.target !== stage) return;
                sceneVisible = entry.isIntersecting || entry.intersectionRatio > 0;
                if (sceneVisible) needsRender = true;
              });
              synchronize();
            }, { threshold: 0.01 });
            viewportObserver.observe(stage);
          } catch (_) {
            if (viewportObserver) viewportObserver.disconnect();
            viewportObserver = null;
          }
        }
        if (typeof win.ResizeObserver === "function") {
          try {
            sizeObserver = new win.ResizeObserver(function () {
              if (failed) return;
              try {
                measure();
                if (!viewportObserver) sceneVisible = inViewport();
                synchronize();
              } catch (_) { failCanvas(); }
            });
            sizeObserver.observe(stage);
          } catch (_) {
            if (sizeObserver) sizeObserver.disconnect();
            sizeObserver = null;
          }
        }
        disposers.push(listen(stage, "pointermove", function (event) {
          if (!decorationsAllowed() || !pointerMedia.matches || event.pointerType === "touch") return;
          const rect = stage.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          targetX = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5) * 2;
          targetY = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5) * 2;
        }, { passive: true }));
        disposers.push(listen(stage, "pointerleave", function () { targetX = 0; targetY = 0; }));
        disposers.push(listen(win, "blur", resetPointer));
        watchMedia(pointerMedia, resetPointer);
        themeSubscribers.push(function () {
          if (failed) return;
          updateColors();
          needsRender = true;
          synchronize();
        });
        motionSubscribers.push(function () {
          if (failed) return;
          if (!decorationsAllowed()) targetX = targetY = pointerX = pointerY = 0;
          needsRender = true;
          synchronize();
        });
        layoutSubscribers.push(function (reason) {
          if (failed) return;
          try {
            if (reason !== "scroll") measure();
            if (!viewportObserver) sceneVisible = inViewport();
            synchronize();
          } catch (_) { failCanvas(); }
        });
        synchronize();
      } catch (_) { failCanvas(); }
    }

    /* Optional enhancements are initialized independently. */
    root.classList.add("js");
    safely(initPreferences);
    safely(initNavigation);
    safely(initScroll);
    safely(initReveals);
    safely(initPointerEffects);
    safely(initDialogs);
    safely(initCopyControls);
    safely(initContactForm);
    safely(initProjectFilters);
    safely(initBauhausGallery);
    safely(initKegPilotGallery);
    safely(initJotvellaGallery);
    safely(initTaskZeroGallery);
    safely(initKegPilotDemo);
    safely(initGuideExplorer);
    safely(initProjects);
    safely(initCommands);
    safely(initLab);
    safely(initProcess);
    safely(initOrbitalCanvas);
    all("[data-year]").forEach(function (node) { node.textContent = String(new Date().getFullYear()); });
  }

  if (doc.readyState === "loading" && typeof doc.addEventListener === "function") {
    doc.addEventListener("DOMContentLoaded", start, { once: true });
  } else start();
})();
