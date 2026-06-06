/* =========================================================
   Inkwell runtime  (inkwell-runtime.js)
   Loaded by EVERY visitor. Tiny + safe. It:
     1. fetches the published content (overrides + photos)
     2. applies it to elements marked with data-edit / data-photo
     3. exposes window.Inkwell so the editor (inline or studio) can
        live-preview a working "draft" on top of the published content.
   Precedence per element:  draft (while editing) > published > original DOM.

   For studio (subdomain) mode this same file is the "stub": it listens for
   postMessage commands, but ONLY from an explicit origin allowlist, and only
   after a handshake. It never trusts an inbound string as code.
   ========================================================= */
(function () {
  "use strict";
  if (window.Inkwell && window.Inkwell._runtime) return;

  var P = window.InkwellProtocol || null;

  var LE = window.Inkwell = window.Inkwell || {};
  LE._runtime = true;
  LE.config = LE.config || {};
  LE.published = { text: {}, photos: {} };
  LE.draft = { text: {}, photos: {} };       // editor working copy (per lang)
  LE.draftPhotos = {};                        // key -> dataURL (working copy)
  LE._originals = {};                          // key+lang -> original innerHTML

  function cfg() { return LE.config; }
  function currentLang() {
    var c = cfg();
    if (c.langAttribute) {
      var v = document.documentElement.getAttribute(c.langAttribute);
      if (v) return v;
    }
    if (typeof c.getLang === "function") { try { return c.getLang() || c.lang; } catch (e) {} }
    return c.lang || "default";
  }
  LE.currentLang = currentLang;

  // Which attribute marks editable text / photos. Defaults to data-edit / data-photo,
  // but can target a host site's existing attribute (e.g. data-i18n) via config.
  function editAttr() { return cfg().editAttribute || "data-edit"; }
  function photoAttr() { return cfg().photoAttribute || "data-photo"; }
  function editEls() { return document.querySelectorAll("[" + editAttr() + "]"); }
  function photoEls() { return document.querySelectorAll("[" + photoAttr() + "]"); }

  function originalKey(key, lang) { return lang + "\u0000" + key; }

  function rememberOriginals() {
    var lang = currentLang();
    Array.prototype.forEach.call(editEls(), function (el) {
      var key = el.getAttribute(editAttr());
      var ok = originalKey(key, lang);
      if (LE._originals[ok] === undefined) LE._originals[ok] = el.innerHTML;
    });
  }

  function pick(maps, lang, key) {
    for (var i = 0; i < maps.length; i++) {
      var m = maps[i] && maps[i][lang];
      if (m && m[key] != null) return m[key];
    }
    return undefined;
  }

  var ALLOWED = (P && P.ALLOWED_TAGS) || ["b", "strong", "i", "em", "u", "s", "br", "a", "span"];
  var ALLOWED_PROTO = (P && P.ALLOWED_HREF_PROTOCOLS) || ["http:", "https:", "mailto:", "tel:"];

  /* Published content is already sanitized server-side; this is defense in
     depth and also guards the studio live-preview (SET_TEXT) path. Uses
     DOMPurify when available, else a conservative allowlist walk. */
  function maybeSanitize(html) {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(html, { ALLOWED_TAGS: ALLOWED, ALLOWED_ATTR: ["href", "target", "rel"] });
    }
    var tpl = document.createElement("div");
    tpl.innerHTML = String(html == null ? "" : html);
    walkClean(tpl);
    return tpl.innerHTML;
  }
  function walkClean(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 1) {
        var tag = child.tagName.toLowerCase();
        if (ALLOWED.indexOf(tag) === -1) {
          walkClean(child);
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        } else {
          Array.prototype.slice.call(child.attributes).forEach(function (a) {
            var keep = tag === "a" && (a.name === "href" || a.name === "target" || a.name === "rel");
            if (a.name === "href") { if (!safeHref(a.value)) child.removeAttribute("href"); }
            else if (!keep) child.removeAttribute(a.name);
          });
          if (tag === "a") child.setAttribute("rel", "noopener noreferrer nofollow");
          walkClean(child);
        }
      } else if (child.nodeType !== 3) {
        node.removeChild(child);
      }
    });
  }
  function safeHref(v) {
    try { return ALLOWED_PROTO.indexOf(new URL(v, location.href).protocol) !== -1; }
    catch (e) { return false; }
  }

  function applyText() {
    var lang = currentLang();
    Array.prototype.forEach.call(editEls(), function (el) {
      var key = el.getAttribute(editAttr());
      var val = pick([LE.draft, LE.published.text], lang, key);
      if (val != null) {
        el.innerHTML = maybeSanitize(val);
      } else {
        var ok = originalKey(key, lang);
        if (LE._originals[ok] != null && el.innerHTML !== LE._originals[ok]) {
          el.innerHTML = LE._originals[ok];
        }
      }
    });
  }

  function applyPhotos() {
    // When the host site renders its own published content (manageContent:false),
    // only touch photos that the editor is actively drafting; leave the rest alone.
    var hostManaged = cfg().manageContent === false;
    var local = LE.draftPhotos || {};
    var pub = LE.published.photos || {};
    Array.prototype.forEach.call(photoEls(), function (el) {
      var k = el.getAttribute(photoAttr());
      var src = local[k] != null ? local[k] : pub[k];
      if (src) {
        if (el.tagName === "IMG") { el.src = src; }
        else { el.style.backgroundImage = "url(" + cssUrl(src) + ")"; }
        el.classList.add("ink-has-photo");
      } else if (!hostManaged) {
        if (el.tagName === "IMG") { el.removeAttribute("src"); }
        else { el.style.backgroundImage = ""; }
        el.classList.remove("ink-has-photo");
      }
    });
  }
  function cssUrl(s) { return String(s).replace(/["'()\\]/g, "\\$&"); }

  function apply() { applyText(); applyPhotos(); }
  LE.apply = apply;
  LE.applyText = applyText;
  LE.applyPhotos = applyPhotos;

  function loadPublished(done) {
    var base = cfg().contentUrl || "/content";
    var pending = 2;
    function fin() { if (--pending <= 0 && done) done(); }
    function get(url, set) {
      fetch(url, { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j) set(j); })
        .catch(function () {})
        .then(fin, fin);
    }
    get(base + "/overrides.json", function (j) { LE.published.text = j || {}; });
    get(base + "/photos.json", function (j) { LE.published.photos = j || {}; });
  }
  LE.loadPublished = loadPublished;

  /* ---------------- studio (subdomain) bridge ---------------- */
  /* Enabled only when this page is framed and config.studioBridge is on.
     Real framing protection is the site's CSP frame-ancestors header; here we
     enforce the message-origin allowlist and a strict schema. */
  function startStudioBridge() {
    var allow = cfg().editorOrigins || [];
    if (!allow.length) return;
    var armed = false;

    window.addEventListener("message", function (ev) {
      if (allow.indexOf(ev.origin) === -1) return;       // origin allowlist
      var msg = ev.data;
      if (!msg || typeof msg !== "object" || !P || msg.v !== P.VERSION) return; // schema/version
      var send = function (type, payload) {
        ev.source.postMessage(Object.assign({ v: P.VERSION, type: type }, payload), ev.origin);
      };

      switch (msg.type) {
        case P.MSG.HELLO:
          armed = true;
          send(P.MSG.READY, { keys: collectKeys(), lang: currentLang(), brand: cfg().brandName });
          break;
        case P.MSG.ENABLE:
          if (!armed) return;
          if (window.InkwellEditor && window.InkwellEditor.setBridgeEditing) {
            window.InkwellEditor.setBridgeEditing(!!msg.on, send, P);
          }
          break;
        case P.MSG.SET_TEXT:
          if (!armed || !P.validKey(msg.key) || !P.validLang(msg.lang)) return;
          setDraftText(msg.lang, msg.key, String(msg.html || ""));
          break;
        case P.MSG.SET_PHOTO:
          if (!armed || !P.validKey(msg.key)) return;
          LE.draftPhotos[msg.key] = String(msg.dataUrl || "");
          applyPhotos();
          break;
        case P.MSG.REMOVE_PHOTO:
          if (!armed || !P.validKey(msg.key)) return;
          delete LE.draftPhotos[msg.key];
          applyPhotos();
          break;
        case P.MSG.REQUEST_DRAFT:
          if (!armed) return;
          send(P.MSG.DRAFT, { text: LE.draft, photos: LE.draftPhotos });
          break;
      }
    }, false);
  }

  function collectKeys() {
    var out = [];
    Array.prototype.forEach.call(editEls(), function (el) {
      out.push({ key: el.getAttribute(editAttr()), kind: "text" });
    });
    Array.prototype.forEach.call(photoEls(), function (el) {
      out.push({ key: el.getAttribute(photoAttr()), kind: "photo" });
    });
    return out;
  }

  function setDraftText(lang, key, html) {
    LE.draft[lang] = LE.draft[lang] || {};
    LE.draft[lang][key] = maybeSanitize(html);
    applyText();
  }
  LE.setDraftText = setDraftText;

  /* ---------------- init ---------------- */
  LE.init = function (options) {
    LE.config = Object.assign({}, LE.config, options || {});
    rememberOriginals();
    apply();
    // manageContent:false -> the host site (its own i18n/render layer) already
    // fetches & applies published content, so Inkwell only provides editing.
    if (LE.config.manageContent !== false) {
      loadPublished(function () { rememberOriginals(); apply(); });
    }
    if (LE.config.studioBridge) startStudioBridge();
    document.dispatchEvent(new CustomEvent("inkwell:ready"));
  };

  // Auto-init if a config was provided before this script loaded.
  if (LE.config && LE.config.autoInit !== false && document.querySelector("[data-inkwell-auto]")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { LE.init(LE.config); });
    } else { LE.init(LE.config); }
  }
})();
