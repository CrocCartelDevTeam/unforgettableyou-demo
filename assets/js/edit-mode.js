/* =========================================================
   Unforgettable You — Edit Mode (inline, friendly for 80+)
     • Click any text and type
     • Replace photos with one button
     • English AND Hebrew (use the EN/עב toggle)
     • Save in browser, Export, or PUBLISH live
   Publishing posts edits to /api/publish (a serverless function
   that commits to the repo → auto-deploy). On hosts without the
   API (e.g. the GitHub Pages preview) it degrades gracefully.
   ========================================================= */
(function () {
  "use strict";

  var OV_KEY = "uy_overrides";
  var PH_KEY = "uy_photos";
  var editing = false;

  function lang() { return window.UY_LANG || "en"; }
  function saveOverrides() { try { localStorage.setItem(OV_KEY, JSON.stringify(window.UY_OVERRIDES || {})); } catch (e) {} }
  function savePhotos() { try { localStorage.setItem(PH_KEY, JSON.stringify(window.UY_PHOTOS || {})); } catch (e) {} }

  function editableEls() {
    return Array.prototype.filter.call(
      document.querySelectorAll("[data-i18n]"),
      function (el) {
        if (el.tagName === "A") return false;
        if (el.closest(".nav") || el.closest(".footer")) return false;
        return true;
      }
    );
  }

  /* ---------- UI elements ---------- */
  var launchBtn = document.createElement("button");
  launchBtn.className = "uy-edit-launch";
  launchBtn.type = "button";
  launchBtn.innerHTML = '<span class="uy-edit-launch__icon">\u270E</span><span class="uy-edit-launch__label">Try editing this site</span>';

  var bar = document.createElement("div");
  bar.className = "uy-edit-bar";
  bar.innerHTML =
    '<div class="uy-edit-bar__msg" id="uyEditMsg"></div>' +
    '<div class="uy-edit-bar__actions">' +
      '<button type="button" class="uy-edit-btn" id="uyEditReset">Reset</button>' +
      '<button type="button" class="uy-edit-btn" id="uyEditExport">Export</button>' +
      '<button type="button" class="uy-edit-btn" id="uyEditDone">Done</button>' +
      '<button type="button" class="uy-edit-btn uy-edit-btn--primary" id="uyEditPublish">Publish changes</button>' +
    '</div>';

  var fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";

  var toast = document.createElement("div");
  toast.className = "uy-toast";
  toast.hidden = true;

  var modal = document.createElement("div");
  modal.className = "uy-modal";
  modal.id = "uyModal";
  modal.hidden = true;
  modal.innerHTML =
    '<div class="uy-modal__box" role="dialog" aria-modal="true" aria-labelledby="uyModalTitle">' +
      '<button class="uy-modal__close" id="uyModalClose" aria-label="Close">\u00D7</button>' +
      '<h2 class="uy-modal__title" id="uyModalTitle">Sign in to publish</h2>' +
      '<p class="uy-modal__sub">Publishing makes your changes live for everyone who visits your website.</p>' +
      '<div class="uy-modal__err" id="uyModalErr" hidden></div>' +
      '<label class="uy-field"><span>Username</span><input id="uyUser" type="text" autocomplete="username"></label>' +
      '<label class="uy-field"><span>Password</span><input id="uyPass" type="password" autocomplete="current-password"></label>' +
      '<button class="uy-modal__btn uy-modal__btn--primary" id="uyDoLogin">Sign in &amp; publish</button>' +
      '<div class="uy-modal__or"><span>or</span></div>' +
      '<label class="uy-field"><span>Email me a sign-in link instead</span><input id="uyEmail" type="email" autocomplete="email" placeholder="your email address"></label>' +
      '<button class="uy-modal__btn" id="uyDoMagic">Email me a link</button>' +
      '<p class="uy-modal__note" id="uyMagicNote" hidden>Check your email for a sign-in link, then come back and press Publish.</p>' +
    '</div>';

  function mount() {
    document.body.appendChild(launchBtn);
    document.body.appendChild(bar);
    document.body.appendChild(fileInput);
    document.body.appendChild(toast);
    document.body.appendChild(modal);
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function showToast(msg, ms) {
    toast.textContent = msg;
    toast.hidden = false;
    toast.classList.add("is-on");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-on");
      setTimeout(function () { toast.hidden = true; }, 400);
    }, ms || 4500);
  }

  /* ---------- Instruction banner ---------- */
  function updateMsg() {
    var msg = document.getElementById("uyEditMsg");
    if (!msg) return;
    var which = lang() === "he" ? "\u05E2\u05D1\u05E8\u05D9\u05EA (Hebrew)" : "English";
    msg.innerHTML =
      '<strong>Edit mode on</strong> \u00B7 You are editing <strong>' + which + '</strong>. ' +
      'Click any text and type. Use the <strong>EN / \u05E2\u05D1</strong> switch (top) to edit the other language. ' +
      'Click <strong>Replace photo</strong> on any image. When ready, press <strong>Publish changes</strong>.';
  }

  /* ---------- Text editing ---------- */
  function onTextInput(e) {
    var el = e.currentTarget;
    var key = el.getAttribute("data-i18n");
    var l = lang();
    window.UY_OVERRIDES = window.UY_OVERRIDES || {};
    window.UY_OVERRIDES[l] = window.UY_OVERRIDES[l] || {};
    window.UY_OVERRIDES[l][key] = el.innerHTML;
    saveOverrides();
  }

  /* ---------- Photo editing ---------- */
  var photoTarget = null;
  function addPhotoControls() {
    document.querySelectorAll("[data-photo]").forEach(function (el) {
      if (el.querySelector(".uy-photo-tools")) return;
      var tools = document.createElement("div");
      tools.className = "uy-photo-tools";

      var replace = document.createElement("button");
      replace.type = "button";
      replace.className = "uy-photo-btn";
      replace.textContent = "\u2934 Replace photo";
      replace.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        photoTarget = el.getAttribute("data-photo");
        fileInput.value = "";
        fileInput.click();
      });
      tools.appendChild(replace);

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "uy-photo-btn uy-photo-btn--ghost";
      remove.textContent = "Remove";
      remove.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var k = el.getAttribute("data-photo");
        if (window.UY_PHOTOS) delete window.UY_PHOTOS[k];
        savePhotos();
        if (window.UY_I18N) window.UY_I18N.applyPhotos();
      });
      tools.appendChild(remove);
      el.appendChild(tools);
    });
  }
  function removePhotoControls() {
    document.querySelectorAll(".uy-photo-tools").forEach(function (t) { t.remove(); });
  }

  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f || !photoTarget) return;
    var reader = new FileReader();
    reader.onload = function () {
      window.UY_PHOTOS = window.UY_PHOTOS || {};
      window.UY_PHOTOS[photoTarget] = reader.result;
      savePhotos();
      if (window.UY_I18N) window.UY_I18N.applyPhotos();
      photoTarget = null;
    };
    reader.readAsDataURL(f);
  });

  /* ---------- Toggle edit mode ---------- */
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("uy-editing", on);
    editableEls().forEach(function (el) {
      if (on) {
        el.setAttribute("contenteditable", "true");
        el.setAttribute("spellcheck", "false");
        el.addEventListener("input", onTextInput);
      } else {
        el.removeAttribute("contenteditable");
        el.removeEventListener("input", onTextInput);
      }
    });
    if (on) { addPhotoControls(); updateMsg(); } else { removePhotoControls(); }
    launchBtn.style.display = on ? "none" : "";
  }

  /* ---------- Reset / Export ---------- */
  function resetAll() {
    if (!window.confirm("Reset all your unsaved edits and photos back to the published version?")) return;
    window.UY_OVERRIDES = {};
    window.UY_PHOTOS = {};
    try { localStorage.removeItem(OV_KEY); localStorage.removeItem(PH_KEY); } catch (e) {}
    if (window.UY_I18N) window.UY_I18N.apply(lang());
  }
  function exportChanges() {
    var data = { exportedAt: new Date().toISOString(), text: window.UY_OVERRIDES || {}, photos: window.UY_PHOTOS || {} };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "unforgettableyou-edits.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- Login modal ---------- */
  function setErr(msg) {
    var el = document.getElementById("uyModalErr");
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }
  function showLogin() {
    setErr(""); 
    var note = document.getElementById("uyMagicNote"); if (note) note.hidden = true;
    modal.hidden = false;
    var u = document.getElementById("uyUser"); if (u) u.focus();
  }
  function hideLogin() { modal.hidden = true; }

  async function doLogin() {
    var u = document.getElementById("uyUser").value;
    var p = document.getElementById("uyPass").value;
    setErr("");
    try {
      var res = await fetch("/api/login", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      var j = {}; try { j = await res.json(); } catch (e) {}
      if (!res.ok) { setErr(j.error || "Sign in failed."); return; }
      hideLogin();
      doPublish();
    } catch (e) { setErr("Network error. Please try again."); }
  }
  async function doMagic() {
    var email = document.getElementById("uyEmail").value;
    setErr("");
    try {
      await fetch("/api/magic-request", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email }),
      });
      document.getElementById("uyMagicNote").hidden = false;
    } catch (e) { setErr("Could not send the link. Please try again."); }
  }

  /* ---------- Publish ---------- */
  function setBusy(on) {
    var btn = document.getElementById("uyEditPublish");
    if (!btn) return;
    btn.disabled = on;
    btn.textContent = on ? "Publishing\u2026" : "Publish changes";
  }
  async function publish() {
    var me;
    try { me = await fetch("/api/me", { credentials: "same-origin" }); }
    catch (e) { me = null; }
    if (!me || me.status === 404 || me.status === 405) {
      showToast("Publishing turns on once the site is live on its hosting. For now your changes are saved in this browser \u2014 use Export to send them over.", 6500);
      return;
    }
    if (me.status === 200) { doPublish(); }
    else { showLogin(); }
  }
  async function doPublish() {
    setBusy(true);
    try {
      var res = await fetch("/api/publish", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: window.UY_OVERRIDES || {}, photos: window.UY_PHOTOS || {} }),
      });
      if (res.status === 401) { setBusy(false); showLogin(); return; }
      var j = {}; try { j = await res.json(); } catch (e) {}
      if (!res.ok) throw new Error(j.error || ("Error " + res.status));
      onPublished();
      showToast("Published! Your changes will be live in about a minute.", 6500);
    } catch (e) {
      showToast("Could not publish: " + (e.message || e), 7000);
    }
    setBusy(false);
  }
  function onPublished() {
    // Promote the just-saved local copy to the published baseline for an instant
    // in-page preview; the server holds the authoritative copy for future loads.
    window.UY_PUBLISHED_TEXT = JSON.parse(JSON.stringify(window.UY_OVERRIDES || {}));
    window.UY_PUBLISHED_PHOTOS = Object.assign({}, window.UY_PUBLISHED_PHOTOS || {}, window.UY_PHOTOS || {});
    window.UY_OVERRIDES = {};
    window.UY_PHOTOS = {};
    try { localStorage.removeItem(OV_KEY); localStorage.removeItem(PH_KEY); } catch (e) {}
    if (window.UY_I18N) window.UY_I18N.apply(lang());
  }

  /* ---------- Init ---------- */
  function init() {
    mount();
    launchBtn.addEventListener("click", function () { setEditing(true); });
    document.getElementById("uyEditDone").addEventListener("click", function () { setEditing(false); });
    document.getElementById("uyEditReset").addEventListener("click", resetAll);
    document.getElementById("uyEditExport").addEventListener("click", exportChanges);
    document.getElementById("uyEditPublish").addEventListener("click", publish);
    document.getElementById("uyModalClose").addEventListener("click", hideLogin);
    document.getElementById("uyDoLogin").addEventListener("click", doLogin);
    document.getElementById("uyDoMagic").addEventListener("click", doMagic);
    modal.addEventListener("click", function (e) { if (e.target === modal) hideLogin(); });

    document.addEventListener("uy:langchange", function () {
      if (editing) { setEditing(false); setEditing(true); }
    });

    // Arrived from a magic-link sign-in
    if (/[?&]signedin=1/.test(location.search)) {
      setEditing(true);
      showToast("You're signed in. Make your edits, then press Publish changes.", 6500);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
