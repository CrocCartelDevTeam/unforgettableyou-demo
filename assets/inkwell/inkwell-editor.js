/* =========================================================
   Inkwell inline editor  (inkwell-editor.js)
   The self-service editing UI for INLINE mode:
     - a friendly "Edit this page" launch button
     - click any text to type; swap/replace photos with one button
     - Publish (sign in if needed) -> server commits -> site updates
   Also exposes setBridgeEditing() so the STUDIO app can drive editing
   over postMessage without shipping this toolbar to the public site.

   Depends on inkwell-runtime.js (window.Inkwell) and, ideally,
   inkwell-protocol.js. Client-side sanitization uses DOMPurify if present;
   either way the server re-sanitizes authoritatively before publishing.
   ========================================================= */
(function () {
  "use strict";
  var LE = window.Inkwell;
  if (!LE || !LE._runtime) { console.warn("Inkwell: runtime not loaded before editor."); return; }
  var P = window.InkwellProtocol || null;
  var ED = window.InkwellEditor = window.InkwellEditor || {};

  function cfg() { return LE.config || {}; }
  function api() { return (cfg().apiBase || "/api").replace(/\/+$/, ""); }
  function brand() { return cfg().brandName || "your website"; }
  function lang() { return LE.currentLang(); }
  function editAttr() { return cfg().editAttribute || "data-edit"; }
  function photoAttr() { return cfg().photoAttribute || "data-photo"; }
  function editSel() { return "[" + editAttr() + "]"; }
  function photoSel() { return "[" + photoAttr() + "]"; }

  var ALLOWED = (P && P.ALLOWED_TAGS) || ["b", "strong", "i", "em", "u", "s", "br", "a", "span"];
  var ALLOWED_PROTO = (P && P.ALLOWED_HREF_PROTOCOLS) || ["http:", "https:", "mailto:", "tel:"];
  var LS_KEY = "inkwell_draft:" + (location.host + location.pathname);

  /* ---------------- persistence ---------------- */
  function saveDraft() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ text: LE.draft, photos: LE.draftPhotos }));
    } catch (e) {}
  }
  function loadDraft() {
    try {
      var d = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (d) { LE.draft = d.text || {}; LE.draftPhotos = d.photos || {}; }
    } catch (e) {}
  }
  function clearDraft() {
    LE.draft = {}; LE.draftPhotos = {};
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  /* ---------------- client-side sanitize (UX only) ---------------- */
  function sanitizeInline(html) {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(html, { ALLOWED_TAGS: ALLOWED, ALLOWED_ATTR: ["href", "target", "rel"] });
    }
    var tpl = document.createElement("div");
    tpl.innerHTML = html;
    walkClean(tpl);
    return tpl.innerHTML;
  }
  function walkClean(node) {
    var children = Array.prototype.slice.call(node.childNodes);
    children.forEach(function (child) {
      if (child.nodeType === 1) {
        var tag = child.tagName.toLowerCase();
        if (ALLOWED.indexOf(tag) === -1) {
          // unwrap: replace element with its (cleaned) children
          walkClean(child);
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        } else {
          // strip attributes
          Array.prototype.slice.call(child.attributes).forEach(function (a) {
            if (tag === "a" && a.name === "href") {
              if (!safeHref(a.value)) child.removeAttribute("href");
            } else if (tag === "a" && (a.name === "target" || a.name === "rel")) {
              /* keep */
            } else {
              child.removeAttribute(a.name);
            }
          });
          if (tag === "a") { child.setAttribute("rel", "noopener noreferrer nofollow"); }
          walkClean(child);
        }
      } else if (child.nodeType !== 3) {
        node.removeChild(child); // drop comments etc.
      }
    });
  }
  function safeHref(v) {
    try {
      var u = new URL(v, location.href);
      return ALLOWED_PROTO.indexOf(u.protocol) !== -1;
    } catch (e) { return false; }
  }

  /* ---------------- UI elements ---------------- */
  var launchBtn, bar, modal, toast, fileInput, toastTimer;

  function buildUI() {
    launchBtn = el("button", "ink-launch");
    launchBtn.type = "button";
    launchBtn.innerHTML = '<span class="ink-launch__icon">\u270E</span><span>' +
      esc(cfg().launchLabel || "Edit this page") + "</span>";

    bar = el("div", "ink-bar");
    bar.innerHTML =
      '<div class="ink-bar__msg" id="leMsg"></div>' +
      '<div class="ink-bar__actions">' +
        '<button type="button" class="ink-btn" id="leReset">Undo all</button>' +
        '<button type="button" class="ink-btn" id="leDone">Done</button>' +
        '<button type="button" class="ink-btn ink-btn--primary" id="lePublish">Publish</button>' +
      "</div>";

    fileInput = el("input", "");
    fileInput.type = "file"; fileInput.accept = "image/png,image/jpeg,image/webp,image/gif,image/avif";
    fileInput.style.display = "none";

    toast = el("div", "ink-toast"); toast.hidden = true;

    modal = el("div", "ink-modal"); modal.hidden = true;
    modal.innerHTML =
      '<div class="ink-modal__box" role="dialog" aria-modal="true" aria-labelledby="leModalTitle">' +
        '<button class="ink-modal__close" id="leModalClose" aria-label="Close">\u00D7</button>' +
        '<h2 class="ink-modal__title" id="leModalTitle">Sign in to publish</h2>' +
        '<p class="ink-modal__sub">Publishing makes your changes live on ' + esc(brand()) + '.</p>' +
        '<div class="ink-modal__err" id="leErr" hidden></div>' +
        '<label class="ink-field"><span>Username</span><input id="leUser" type="text" autocomplete="username"></label>' +
        '<label class="ink-field"><span>Password</span><input id="lePass" type="password" autocomplete="current-password"></label>' +
        '<button class="ink-modal__btn ink-modal__btn--primary" id="leDoLogin">Sign in &amp; publish</button>' +
        '<div class="ink-modal__or"><span>or</span></div>' +
        '<label class="ink-field"><span>Email me a sign-in link</span><input id="leEmail" type="email" autocomplete="email" placeholder="your email"></label>' +
        '<button class="ink-modal__btn" id="leDoMagic">Email me a link</button>' +
        '<p class="ink-modal__note" id="leMagicNote" hidden>Check your email for a sign-in link, then come back and press Publish.</p>' +
      "</div>";

    [launchBtn, bar, fileInput, toast, modal].forEach(function (n) { document.body.appendChild(n); });
  }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function showToast(msg, ms) {
    toast.textContent = msg; toast.hidden = false; toast.classList.add("is-on");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-on");
      setTimeout(function () { toast.hidden = true; }, 400);
    }, ms || 4500);
  }
  function updateMsg() {
    var m = document.getElementById("leMsg");
    if (m) m.innerHTML = "<strong>Editing</strong> \u00B7 Click any text to type. Use <strong>Replace photo</strong> on an image. Then press <strong>Publish</strong>.";
  }

  /* ---------------- text editing ---------------- */
  var editing = false;
  function onInput(e) {
    var elx = e.currentTarget;
    var key = elx.getAttribute(editAttr());
    var l = lang();
    LE.draft[l] = LE.draft[l] || {};
    LE.draft[l][key] = sanitizeInline(elx.innerHTML);
    saveDraft();
    if (bridge.on) bridge.send(P.MSG.EDIT, { key: key, lang: l, html: LE.draft[l][key] });
  }
  function onPaste(e) {
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  function setTextEditable(on) {
    Array.prototype.forEach.call(document.querySelectorAll(editSel()), function (elx) {
      if (on) {
        elx.setAttribute("contenteditable", "true");
        elx.setAttribute("spellcheck", "false");
        elx.classList.add("ink-editable");
        elx.addEventListener("input", onInput);
        elx.addEventListener("paste", onPaste);
      } else {
        elx.removeAttribute("contenteditable");
        elx.classList.remove("ink-editable");
        elx.removeEventListener("input", onInput);
        elx.removeEventListener("paste", onPaste);
      }
    });
  }

  /* ---------------- photo editing ---------------- */
  var photoTarget = null;
  function addPhotoControls() {
    document.querySelectorAll(photoSel()).forEach(function (elx) {
      if (elx.querySelector(".ink-photo-tools")) return;
      var tools = el("div", "ink-photo-tools");
      var rep = el("button", "ink-photo-btn"); rep.type = "button"; rep.textContent = "\u2934 Replace photo";
      rep.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        photoTarget = elx.getAttribute(photoAttr()); fileInput.value = ""; fileInput.click();
      });
      var rem = el("button", "ink-photo-btn ink-photo-btn--ghost"); rem.type = "button"; rem.textContent = "Remove";
      rem.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        delete LE.draftPhotos[elx.getAttribute(photoAttr())]; saveDraft(); LE.applyPhotos();
      });
      tools.appendChild(rep); tools.appendChild(rem); elx.appendChild(tools);
    });
  }
  function removePhotoControls() {
    document.querySelectorAll(".ink-photo-tools").forEach(function (t) { t.remove(); });
  }
  function wireFileInput() {
    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f || !photoTarget) return;
      if (P && f.size > P.LIMITS.imageBytes) { showToast("That image is too large. Please choose one under 4 MB.", 6000); return; }
      var reader = new FileReader();
      reader.onload = function () {
        LE.draftPhotos[photoTarget] = reader.result; saveDraft(); LE.applyPhotos();
        if (bridge.on) bridge.send(P.MSG.PHOTO, { key: photoTarget, dataUrl: reader.result });
        photoTarget = null;
      };
      reader.readAsDataURL(f);
    });
  }

  /* ---------------- toggle ---------------- */
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("ink-editing", on);
    setTextEditable(on);
    if (on) { addPhotoControls(); updateMsg(); } else { removePhotoControls(); }
    launchBtn.style.display = on ? "none" : "";
    bar.classList.toggle("is-on", on);
  }
  ED.setEditing = setEditing;

  /* ---------------- publish ---------------- */
  function setBusy(on) {
    var b = document.getElementById("lePublish");
    if (b) { b.disabled = on; b.textContent = on ? "Publishing\u2026" : "Publish"; }
  }
  async function checkMe() {
    try {
      var r = await fetch(api() + "/me", { credentials: "same-origin" });
      if (r.status === 404 || r.status === 405) return { hasApi: false };
      var j = await r.json();
      return { hasApi: true, authed: !!j.authenticated, configured: j.configured !== false };
    } catch (e) { return { hasApi: false }; }
  }
  async function publish() {
    var s = await checkMe();
    if (!s.hasApi || !s.configured) {
      showToast("Publishing turns on once this site is connected to its hosting. Your changes are saved in this browser for now.", 7000);
      return;
    }
    if (s.authed) doPublish(); else showLogin();
  }
  async function doPublish() {
    setBusy(true);
    try {
      var r = await fetch(api() + "/publish", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Inkwell": "1" },
        body: JSON.stringify({ text: LE.draft, photos: LE.draftPhotos })
      });
      if (r.status === 401 || r.status === 403) { setBusy(false); showLogin(); return; }
      var j = {}; try { j = await r.json(); } catch (e) {}
      if (!r.ok) throw new Error(j.error || ("Error " + r.status));
      onPublished(j.text);
      showToast("Published! Your changes will be live in about a minute.", 6500);
    } catch (e) {
      showToast("Could not publish: " + (e.message || e), 7000);
    }
    setBusy(false);
  }
  function onPublished(serverText) {
    // Promote draft to the published baseline for an instant local preview.
    LE.published.text = mergeText(LE.published.text, serverText || LE.draft);
    LE.published.photos = Object.assign({}, LE.published.photos);
    Object.keys(LE.draftPhotos).forEach(function (k) { /* server has authoritative URL on next load */ });
    clearDraft();
    LE.apply();
  }
  function mergeText(base, add) {
    var out = JSON.parse(JSON.stringify(base || {}));
    Object.keys(add || {}).forEach(function (l) {
      out[l] = Object.assign({}, out[l], add[l]);
    });
    return out;
  }

  /* ---------------- login modal ---------------- */
  function setErr(m) { var e = document.getElementById("leErr"); if (e) { e.textContent = m || ""; e.hidden = !m; } }
  function showLogin() {
    setErr(""); var n = document.getElementById("leMagicNote"); if (n) n.hidden = true;
    modal.hidden = false; var u = document.getElementById("leUser"); if (u) u.focus();
  }
  function hideLogin() { modal.hidden = true; }
  async function doLogin() {
    setErr("");
    try {
      var r = await fetch(api() + "/login", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Inkwell": "1" },
        body: JSON.stringify({
          username: document.getElementById("leUser").value,
          password: document.getElementById("lePass").value
        })
      });
      var j = {}; try { j = await r.json(); } catch (e) {}
      if (!r.ok) { setErr(j.error || "Sign in failed."); return; }
      hideLogin(); doPublish();
    } catch (e) { setErr("Network error. Please try again."); }
  }
  async function doMagic() {
    setErr("");
    try {
      await fetch(api() + "/magic-request", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Inkwell": "1" },
        body: JSON.stringify({ email: document.getElementById("leEmail").value })
      });
      document.getElementById("leMagicNote").hidden = false;
    } catch (e) { setErr("Could not send the link. Please try again."); }
  }

  /* ---------------- reset ---------------- */
  function resetAll() {
    if (!window.confirm("Undo all your unpublished changes on this page?")) return;
    clearDraft(); LE.apply();
    if (editing) { setEditing(false); setEditing(true); }
  }

  /* ---------------- studio bridge editing ---------------- */
  var bridge = { on: false, send: function () {} };
  /* Driven by the studio app over postMessage. Text is edited directly in the
     framed page; photos are handled studio-side (via SET_PHOTO), so we do NOT
     mount the on-page photo toolbar (and don't need the inline file input). */
  ED.setBridgeEditing = function (on, send, proto) {
    bridge.on = on; bridge.send = send || function () {};
    if (proto) P = proto;
    setTextEditable(on);
    document.body.classList.toggle("ink-editing", on);
  };

  /* ---------------- init ---------------- */
  function init() {
    loadDraft();
    buildUI();
    wireFileInput();
    LE.apply();
    launchBtn.addEventListener("click", function () { setEditing(true); });
    document.getElementById("leDone").addEventListener("click", function () { setEditing(false); });
    document.getElementById("leReset").addEventListener("click", resetAll);
    document.getElementById("lePublish").addEventListener("click", publish);
    document.getElementById("leModalClose").addEventListener("click", hideLogin);
    document.getElementById("leDoLogin").addEventListener("click", doLogin);
    document.getElementById("leDoMagic").addEventListener("click", doMagic);
    modal.addEventListener("click", function (e) { if (e.target === modal) hideLogin(); });

    if (/[?&]le=signedin/.test(location.search)) {
      setEditing(true);
      showToast("You're signed in. Make your edits, then press Publish.", 6500);
    }
  }

  if (cfg().inline === false) return; // studio-only target site: skip the toolbar
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
