/* =========================================================
   Unforgettable You — Edit Mode (demo)
   A friendly, no-dashboard way to edit the site, designed
   for non-technical (80+) users:
     • Click any text on the page and type
     • Replace photos with one button
     • Works in English AND Hebrew (use the EN/עב toggle)
     • Changes are saved in the browser (localStorage) and
       can be exported as a file for the developer to publish.
   This is a front-end demo of the real self-editing backend.
   ========================================================= */
(function () {
  "use strict";

  var OV_KEY = "uy_overrides";
  var PH_KEY = "uy_photos";
  var editing = false;

  function lang() { return window.UY_LANG || "en"; }
  function saveOverrides() { try { localStorage.setItem(OV_KEY, JSON.stringify(window.UY_OVERRIDES || {})); } catch (e) {} }
  function savePhotos() { try { localStorage.setItem(PH_KEY, JSON.stringify(window.UY_PHOTOS || {})); } catch (e) {} }

  /* ---- Which text elements are editable ---- */
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

  /* ---- UI: launch button + toolbar ---- */
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
      '<button type="button" class="uy-edit-btn" id="uyEditExport">Export changes</button>' +
      '<button type="button" class="uy-edit-btn uy-edit-btn--primary" id="uyEditDone">Done</button>' +
    '</div>';

  var fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";

  function mount() {
    document.body.appendChild(launchBtn);
    document.body.appendChild(bar);
    document.body.appendChild(fileInput);
  }

  /* ---- Banner text reflects current language ---- */
  function updateMsg() {
    var msg = document.getElementById("uyEditMsg");
    if (!msg) return;
    var l = lang();
    var which = l === "he" ? "\u05E2\u05D1\u05E8\u05D9\u05EA (Hebrew)" : "English";
    msg.innerHTML =
      '<strong>Edit mode on</strong> \u00B7 You are editing <strong>' + which + '</strong>. ' +
      'Click any text and type. Use the <strong>EN / \u05E2\u05D1</strong> switch (top right) to edit the other language. ' +
      'Click <strong>Replace photo</strong> on any image to change it.';
  }

  /* ---- Text editing ---- */
  function onTextInput(e) {
    var el = e.currentTarget;
    var key = el.getAttribute("data-i18n");
    var l = lang();
    window.UY_OVERRIDES = window.UY_OVERRIDES || {};
    window.UY_OVERRIDES[l] = window.UY_OVERRIDES[l] || {};
    window.UY_OVERRIDES[l][key] = el.innerHTML;
    saveOverrides();
  }

  /* ---- Photo editing ---- */
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

  /* ---- Toggle edit mode ---- */
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("uy-editing", on);
    var els = editableEls();
    els.forEach(function (el) {
      if (on) {
        el.setAttribute("contenteditable", "true");
        el.setAttribute("spellcheck", "false");
        el.addEventListener("input", onTextInput);
      } else {
        el.removeAttribute("contenteditable");
        el.removeEventListener("input", onTextInput);
      }
    });
    if (on) { addPhotoControls(); updateMsg(); }
    else { removePhotoControls(); }
    launchBtn.style.display = on ? "none" : "";
  }

  /* ---- Reset / Export ---- */
  function resetAll() {
    if (!window.confirm("Reset all your edits and photos back to the original demo?")) return;
    window.UY_OVERRIDES = {};
    window.UY_PHOTOS = {};
    try { localStorage.removeItem(OV_KEY); localStorage.removeItem(PH_KEY); } catch (e) {}
    if (window.UY_I18N) window.UY_I18N.apply(lang());
  }

  function exportChanges() {
    var data = {
      exportedAt: new Date().toISOString(),
      text: window.UY_OVERRIDES || {},
      photos: window.UY_PHOTOS || {}
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "unforgettableyou-edits.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---- Wire up ---- */
  function init() {
    mount();
    launchBtn.addEventListener("click", function () { setEditing(true); });
    document.getElementById("uyEditDone").addEventListener("click", function () { setEditing(false); });
    document.getElementById("uyEditReset").addEventListener("click", resetAll);
    document.getElementById("uyEditExport").addEventListener("click", exportChanges);

    // Keep editable bindings and banner correct across language switches
    document.addEventListener("uy:langchange", function () {
      if (editing) {
        // re-bind to freshly rendered nodes
        setEditing(false);
        setEditing(true);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
