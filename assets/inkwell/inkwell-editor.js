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
  function pdfAttr() { return cfg().pdfAttribute || "data-pdf"; }
  function videoAttr() { return cfg().videoAttribute || "data-video"; }
  function audioAttr() { return cfg().audioAttribute || "data-audio"; }
  function embedAttr() { return cfg().embedAttribute || "data-embed"; }
  function linkAttr() { return cfg().linkAttribute || "data-link"; }
  function iconAttr() { return cfg().iconAttribute || "data-icon"; }
  function styleAttr() { return cfg().styleAttribute || "data-style"; }
  function editSel() { return "[" + editAttr() + "]"; }
  function photoSel() { return "[" + photoAttr() + "]"; }
  function pdfSel() { return "[" + pdfAttr() + "]"; }
  function videoSel() { return "[" + videoAttr() + "]"; }
  function audioSel() { return "[" + audioAttr() + "]"; }
  function embedSel() { return "[" + embedAttr() + "]"; }
  function linkSel() { return "[" + linkAttr() + "]"; }
  function iconSel() { return "[" + iconAttr() + "]"; }
  function styleSel() { return "[" + styleAttr() + "]"; }
  function listAttr() { return cfg().listAttribute || "data-list"; }
  function itemAttr() { return cfg().itemAttribute || "data-item"; }
  // Optional CSS selector for regions that should NOT become editable/selectable
  // (e.g. ".nav, .footer"). Keeps menus, links and chrome safe from edits.
  function isExcluded(el) {
    var s = cfg().excludeSelector;
    try { return !!(s && el && el.closest && el.closest(s)); } catch (e) { return false; }
  }
  // previewOnly: a fully open "try it" experience. Editing works with no login;
  // Publish is replaced by an explainer of the real, secured publish flow.
  function previewOnly() { return cfg().previewOnly === true; }

  var ALLOWED = (P && P.ALLOWED_TAGS) || ["b", "strong", "i", "em", "u", "s", "br", "a", "span"];
  var ALLOWED_PROTO = (P && P.ALLOWED_HREF_PROTOCOLS) || ["http:", "https:", "mailto:", "tel:"];
  var LS_KEY = "inkwell_draft:" + (location.host + location.pathname);

  // Friendly labels for the animation presets the protocol allows.
  var ANIM_LABELS = {
    "none": "No animation", "fade": "Fade in", "fade-up": "Fade up",
    "fade-down": "Fade down", "zoom": "Zoom in",
    "slide-left": "Slide from right", "slide-right": "Slide from left"
  };
  var ANIM_IDS = (P && P.ANIMATION_PRESETS) || ["none", "fade", "fade-up", "fade-down", "zoom", "slide-left", "slide-right"];

  /* ---------------- persistence ---------------- */
  function saveDraft() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        text: LE.draft, photos: LE.draftPhotos, pdfs: LE.draftPdfs, pages: LE.draftPages,
        animations: LE.draftAnimations, links: LE.draftLinks, icons: LE.draftIcons, styles: LE.draftStyles,
        structure: LE.draftStructure, seo: LE.draftSeo, alts: LE.draftAlts,
        videos: LE.draftVideos, audios: LE.draftAudios, embeds: LE.draftEmbeds
      }));
    } catch (e) {}
  }
  function loadDraft() {
    try {
      var d = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (d) {
        LE.draft = d.text || {}; LE.draftPhotos = d.photos || {}; LE.draftPdfs = d.pdfs || {};
        LE.draftPages = d.pages || {}; LE.draftAnimations = d.animations || {};
        LE.draftLinks = d.links || {}; LE.draftIcons = d.icons || {}; LE.draftStyles = d.styles || {};
        LE.draftStructure = d.structure || {}; LE.draftSeo = d.seo || {}; LE.draftAlts = d.alts || {};
        LE.draftVideos = d.videos || {}; LE.draftAudios = d.audios || {}; LE.draftEmbeds = d.embeds || {};
      }
    } catch (e) {}
  }
  function clearDraft() {
    LE.draft = {}; LE.draftPhotos = {}; LE.draftPdfs = {}; LE.draftPages = {}; LE.draftAnimations = {};
    LE.draftLinks = {}; LE.draftIcons = {}; LE.draftStyles = {}; LE.draftStructure = {};
    LE.draftSeo = {}; LE.draftAlts = {};
    LE.draftVideos = {}; LE.draftAudios = {}; LE.draftEmbeds = {};
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  /* ---------------- undo / redo history ---------------- */
  var history = [];
  var future = [];
  var HISTORY_MAX = 60;
  function snapshot() {
    return JSON.stringify({
      text: LE.draft, photos: LE.draftPhotos, pdfs: LE.draftPdfs, pages: LE.draftPages,
      animations: LE.draftAnimations, links: LE.draftLinks, icons: LE.draftIcons,
      styles: LE.draftStyles, structure: LE.draftStructure, seo: LE.draftSeo, alts: LE.draftAlts,
      videos: LE.draftVideos, audios: LE.draftAudios, embeds: LE.draftEmbeds
    });
  }
  function restoreSnapshot(s) {
    var d; try { d = JSON.parse(s); } catch (e) { return; }
    LE.draft = d.text || {}; LE.draftPhotos = d.photos || {}; LE.draftPdfs = d.pdfs || {};
    LE.draftPages = d.pages || {}; LE.draftAnimations = d.animations || {};
    LE.draftLinks = d.links || {}; LE.draftIcons = d.icons || {}; LE.draftStyles = d.styles || {};
    LE.draftStructure = d.structure || {}; LE.draftSeo = d.seo || {}; LE.draftAlts = d.alts || {};
    LE.draftVideos = d.videos || {}; LE.draftAudios = d.audios || {}; LE.draftEmbeds = d.embeds || {};
  }
  var pendingSnap = null;
  function pushSnap(snap) {
    if (history.length && history[history.length - 1] === snap) return;
    history.push(snap);
    if (history.length > HISTORY_MAX) history.shift();
    future.length = 0;
    updateUndoButtons();
  }
  // Direct actions (structure, photo) snapshot the current pre-mutation state.
  function pushHistory() { pushSnap(snapshot()); }
  // Selection-based edits: remember the pre-edit state when an element is picked,
  // but only commit it to history once an actual change happens (so merely
  // clicking around doesn't create empty undo steps).
  function markPending() { pendingSnap = snapshot(); }
  function commitPending() {
    if (pendingSnap == null) return;
    var s = pendingSnap; pendingSnap = null;
    pushSnap(s);
  }
  function undo() {
    if (!history.length) return;
    future.push(snapshot());
    restoreSnapshot(history.pop());
    afterTimeTravel();
  }
  function redo() {
    if (!future.length) return;
    history.push(snapshot());
    restoreSnapshot(future.pop());
    afterTimeTravel();
  }
  function afterTimeTravel() {
    pendingSnap = null;
    saveDraft();
    LE.apply();
    if (editing) refreshEditingBindings();
    updateUndoButtons();
  }
  function updateUndoButtons() {
    var u = document.getElementById("leUndo"), r = document.getElementById("leRedo");
    if (u) u.disabled = !history.length;
    if (r) r.disabled = !future.length;
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
  var launchBtn, bar, modal, previewModal, toast, fileInput, pdfInput, videoInput, audioInput, mdInput, toastTimer, styleModal, emojiPop, infoModal, seoModal, historyModal;
  LE.draftPages = LE.draftPages || {};
  LE.draftLinks = LE.draftLinks || {};
  LE.draftIcons = LE.draftIcons || {};
  LE.draftStyles = LE.draftStyles || {};
  LE.draftStructure = LE.draftStructure || {};
  LE.draftSeo = LE.draftSeo || {};
  LE.draftAlts = LE.draftAlts || {};
  LE.draftVideos = LE.draftVideos || {};
  LE.draftAudios = LE.draftAudios || {};
  LE.draftEmbeds = LE.draftEmbeds || {};

  function buildUI() {
    launchBtn = el("button", "ink-launch");
    launchBtn.type = "button";
    launchBtn.innerHTML = '<span class="ink-launch__icon">\u270E</span><span>' +
      esc(cfg().launchLabel || "Edit this page") + "</span>";

    bar = el("div", "ink-bar");
    bar.innerHTML =
      '<div class="ink-bar__msg" id="leMsg"></div>' +
      '<div class="ink-bar__sel" id="leSelWrap" hidden>' +
        '<span class="ink-bar__sellbl" id="leSelKey">\u2014</span>' +
        '<span class="ink-bar__field" id="leAnimWrap" hidden>' +
          '<span class="ink-bar__fl">Animate</span>' +
          '<select class="ink-bar__animsel" id="leAnimSel" aria-label="Animation preset"></select>' +
        "</span>" +
        '<span class="ink-bar__field" id="leLinkWrap" hidden>' +
          '<span class="ink-bar__fl">Link</span>' +
          '<input class="ink-bar__input" id="leLinkInput" type="text" placeholder="https:// or /page or #section" aria-label="Link URL">' +
        "</span>" +
        '<span class="ink-bar__field" id="leIconWrap" hidden>' +
          '<span class="ink-bar__fl">Icon</span>' +
          '<input class="ink-bar__input ink-bar__input--icon" id="leIconInput" type="text" maxlength="24" aria-label="Icon or emoji">' +
          '<button type="button" class="ink-btn ink-btn--sm" id="leIconPick">\u{1F600}</button>' +
        "</span>" +
        '<span class="ink-bar__field" id="leAltWrap" hidden>' +
          '<span class="ink-bar__fl">Alt text</span>' +
          '<input class="ink-bar__input" id="leAltInput" type="text" maxlength="250" placeholder="Describe this image (for SEO & screen readers)" aria-label="Image alt text">' +
        "</span>" +
        '<button type="button" class="ink-btn ink-btn--sm" id="leStyleBtn" hidden>\u{1F3A8} Style</button>' +
      "</div>" +
      '<div class="ink-bar__actions">' +
        '<button type="button" class="ink-btn" id="leNewPage" hidden>+ New page (.md)</button>' +
        '<button type="button" class="ink-btn ink-btn--sm" id="leSeo">\u{1F50E} SEO</button>' +
        '<button type="button" class="ink-btn ink-btn--sm" id="leHistory" hidden>\u{1F551} History</button>' +
        '<button type="button" class="ink-btn ink-btn--sm" id="leUndo" title="Undo" disabled>\u21B6</button>' +
        '<button type="button" class="ink-btn ink-btn--sm" id="leRedo" title="Redo" disabled>\u21B7</button>' +
        '<button type="button" class="ink-btn" id="leReset">Reset</button>' +
        '<button type="button" class="ink-btn" id="leDone">Done</button>' +
        '<button type="button" class="ink-btn ink-btn--primary" id="lePublish">Publish</button>' +
      "</div>";

    fileInput = el("input", "");
    fileInput.type = "file"; fileInput.accept = "image/png,image/jpeg,image/webp,image/gif,image/avif";
    fileInput.style.display = "none";

    pdfInput = el("input", "");
    pdfInput.type = "file"; pdfInput.accept = "application/pdf";
    pdfInput.style.display = "none";

    videoInput = el("input", "");
    videoInput.type = "file"; videoInput.accept = "video/mp4,video/webm";
    videoInput.style.display = "none";

    audioInput = el("input", "");
    audioInput.type = "file"; audioInput.accept = "audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav";
    audioInput.style.display = "none";

    mdInput = el("input", "");
    mdInput.type = "file"; mdInput.accept = ".md,.markdown,text/markdown,text/plain";
    mdInput.style.display = "none";

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

    // Preview-mode modal: instead of a login wall, explain the real secured flow.
    previewModal = el("div", "ink-modal ink-modal--preview"); previewModal.hidden = true;
    previewModal.innerHTML =
      '<div class="ink-modal__box" role="dialog" aria-modal="true" aria-labelledby="lePvTitle">' +
        '<button class="ink-modal__close" id="lePvClose" aria-label="Close">\u00D7</button>' +
        '<h2 class="ink-modal__title" id="lePvTitle">You\u2019re editing the live page</h2>' +
        '<p class="ink-modal__sub">This is a real, hands-on preview. Here\u2019s what <strong>Publish</strong> does in the real product:</p>' +
        '<ul class="ink-feature">' +
          '<li><span class="ink-feature__i">\u2713</span> Commits your changes straight to your site\u2019s <strong>Git repo</strong> \u2014 live in about a minute.</li>' +
          '<li><span class="ink-feature__i">\u2713</span> Locked behind <strong>email + password</strong> sign-in, or a one-time <strong>magic link</strong>.</li>' +
          '<li><span class="ink-feature__i">\u2713</span> The Git token <strong>never touches the browser</strong> \u2014 it lives only on the server.</li>' +
          '<li><span class="ink-feature__i">\u2713</span> Every change is <strong>sanitized server-side</strong> before it\u2019s saved.</li>' +
        '</ul>' +
        '<a class="ink-modal__btn ink-modal__btn--primary" id="lePvCta" href="' + esc(cfg().demoHref || "/demo") + '">See the real Publish flow \u2192</a>' +
        '<button type="button" class="ink-modal__btn" id="lePvKeep">Keep editing</button>' +
      "</div>";

    // Style popover: a small allowlisted style panel for [data-style] elements.
    styleModal = el("div", "ink-modal ink-modal--style"); styleModal.hidden = true;
    styleModal.innerHTML =
      '<div class="ink-modal__box ink-style" role="dialog" aria-modal="true" aria-labelledby="leStyTitle">' +
        '<button class="ink-modal__close" id="leStyClose" aria-label="Close">\u00D7</button>' +
        '<h2 class="ink-modal__title" id="leStyTitle">Style this element</h2>' +
        '<p class="ink-modal__sub" id="leStySub">\u2014</p>' +
        '<div class="ink-style__grid">' +
          '<label class="ink-style__row"><span>Text color</span><input type="color" id="leStyColor"></label>' +
          '<label class="ink-style__row"><span>Background</span><input type="color" id="leStyBg"></label>' +
          '<label class="ink-style__row"><span>Font size</span><span class="ink-style__rng"><input type="range" id="leStyFs" min="10" max="80" step="1"><b id="leStyFsV">\u2014</b></span></label>' +
          '<label class="ink-style__row"><span>Weight</span><select id="leStyWeight"><option value="">\u2014</option><option value="400">Normal</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></select></label>' +
          '<div class="ink-style__row"><span>Align</span><span class="ink-style__btns" id="leStyAlign">' +
            '<button type="button" data-v="left">L</button><button type="button" data-v="center">C</button><button type="button" data-v="right">R</button><button type="button" data-v="justify">J</button>' +
          "</span></div>" +
          '<label class="ink-style__row"><span>Padding</span><span class="ink-style__rng"><input type="range" id="leStyPad" min="0" max="80" step="2"><b id="leStyPadV">\u2014</b></span></label>' +
          '<label class="ink-style__row"><span>Corner radius</span><span class="ink-style__rng"><input type="range" id="leStyRad" min="0" max="60" step="1"><b id="leStyRadV">\u2014</b></span></label>' +
          '<label class="ink-style__row"><span>Width</span><span class="ink-style__rng"><input type="range" id="leStyW" min="10" max="100" step="1"><b id="leStyWV">auto</b></span></label>' +
        "</div>" +
        '<button type="button" class="ink-modal__btn" id="leStyClear">Clear styles</button>' +
      "</div>";

    // Emoji picker popover (anchored over the bar).
    emojiPop = el("div", "ink-emoji"); emojiPop.hidden = true;
    var EMOJIS = [
      // status / emphasis
      "\u2705","\u2714\uFE0F","\u2B50","\u{1F31F}","\u{1F525}","\u{1F680}","\u{1F4A1}","\u26A1","\u2728","\u{1F389}","\u{1F38A}","\u2757","\u2753","\u2139\uFE0F","\u26A0\uFE0F","\u{1F6A7}",
      // communication / contact
      "\u{1F4AC}","\u{1F4DE}","\u260E\uFE0F","\u{1F4F1}","\u{1F4E7}","\u2709\uFE0F","\u{1F4CD}","\u{1F5FA}\uFE0F","\u{1F4C5}","\u23F0","\u{1F514}","\u{1F4E3}",
      // trades / tools / construction
      "\u{1F6E0}\uFE0F","\u{1F527}","\u{1F528}","\u{1F529}","\u2699\uFE0F","\u{1F4CF}","\u{1F4D0}","\u{1F9F0}","\u{1F9F1}","\u{1FA9C}","\u{1FAA0}","\u{1FAA3}","\u{1F9F9}","\u{1F9FD}","\u{1F6BF}","\u{1F6C1}","\u{1F6BD}","\u{1F4A7}","\u2744\uFE0F","\u{1F321}\uFE0F","\u{1F50C}","\u{1F50B}",
      // home / building / business
      "\u{1F3E0}","\u{1F3E1}","\u{1F3D7}\uFE0F","\u{1F3E2}","\u{1F6AA}","\u{1FA9F}","\u{1F511}","\u{1F510}","\u{1F512}","\u{1F6E1}\uFE0F","\u{1F4BC}","\u{1F4CB}","\u{1F4C8}","\u{1F4B0}","\u{1F4B3}","\u{1F9FE}",
      // design / media
      "\u{1F3A8}","\u{1F58C}\uFE0F","\u{1F4F8}","\u{1F5BC}\uFE0F","\u{1F50D}","\u{1F517}","\u{1F4CE}","\u{1F4C4}","\u{1F4C1}","\u{1F4CC}",
      // people / trust
      "\u{1F44D}","\u{1F44B}","\u{1F91D}","\u{1F4AA}","\u2764\uFE0F","\u{1F3C6}","\u{1F396}\uFE0F","\u{1F5D3}\uFE0F","\u{1F381}","\u2702\uFE0F",
      // delivery / outdoors
      "\u{1F69A}","\u{1F4E6}","\u{1F697}","\u2708\uFE0F","\u{1F33F}","\u{1F333}","\u2600\uFE0F","\u267B\uFE0F","\u{1F6A9}"
    ];
    emojiPop.innerHTML = EMOJIS.map(function (e) { return '<button type="button" class="ink-emoji__b">' + e + "</button>"; }).join("");

    // Generic info modal (first-run tour + "your change is live" confirmation).
    infoModal = el("div", "ink-modal ink-modal--info"); infoModal.hidden = true;
    infoModal.innerHTML =
      '<div class="ink-modal__box" role="dialog" aria-modal="true" aria-labelledby="leInfoTitle">' +
        '<button class="ink-modal__close" id="leInfoClose" aria-label="Close">\u00D7</button>' +
        '<h2 class="ink-modal__title" id="leInfoTitle">\u2014</h2>' +
        '<div class="ink-modal__body" id="leInfoBody"></div>' +
        '<div class="ink-modal__foot" id="leInfoFoot"></div>' +
      "</div>";

    // SEO modal: edit the page's search-result title + description.
    seoModal = el("div", "ink-modal ink-modal--seo"); seoModal.hidden = true;
    seoModal.innerHTML =
      '<div class="ink-modal__box" role="dialog" aria-modal="true" aria-labelledby="leSeoTitle">' +
        '<button class="ink-modal__close" id="leSeoClose" aria-label="Close">\u00D7</button>' +
        '<h2 class="ink-modal__title" id="leSeoTitle">Search &amp; social</h2>' +
        '<p class="ink-modal__sub">How this page looks in Google and when shared.</p>' +
        '<label class="ink-field"><span>Page title <b id="leSeoTV" class="ink-count"></b></span><input id="leSeoTitleI" type="text" maxlength="70" placeholder="e.g. Bay Area General Contractor | OCD Plan &amp; Build"></label>' +
        '<label class="ink-field"><span>Description <b id="leSeoDV" class="ink-count"></b></span><textarea id="leSeoDescI" rows="3" maxlength="320" placeholder="One or two sentences describing this page."></textarea></label>' +
        '<div class="ink-seo__preview"><span class="ink-seo__url" id="leSeoUrl"></span><span class="ink-seo__t" id="leSeoPT">\u2014</span><span class="ink-seo__d" id="leSeoPD">\u2014</span></div>' +
        '<button type="button" class="ink-modal__btn ink-modal__btn--primary" id="leSeoSave">Done</button>' +
      "</div>";

    // Version history modal.
    historyModal = el("div", "ink-modal ink-modal--history"); historyModal.hidden = true;
    historyModal.innerHTML =
      '<div class="ink-modal__box" role="dialog" aria-modal="true" aria-labelledby="leHistTitle">' +
        '<button class="ink-modal__close" id="leHistClose" aria-label="Close">\u00D7</button>' +
        '<h2 class="ink-modal__title" id="leHistTitle">Version history</h2>' +
        '<p class="ink-modal__sub">Restore your site\u2019s content to an earlier published version. This creates a new version, so it\u2019s itself undoable.</p>' +
        '<div class="ink-hist" id="leHistList">Loading\u2026</div>' +
      "</div>";

    [launchBtn, bar, fileInput, pdfInput, videoInput, audioInput, mdInput, toast, modal, previewModal, styleModal, emojiPop, infoModal, seoModal, historyModal].forEach(function (n) { document.body.appendChild(n); });
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
    if (!m) return;
    if (previewOnly()) {
      m.innerHTML = "<strong>Live preview</strong> \u00B7 Click any text to edit and swap photos \u2014 changes apply instantly. Your edits stay in this browser.";
    } else {
      m.innerHTML = "<strong>Editing</strong> \u00B7 Click any text to type. Use <strong>Replace photo</strong> on an image. Then press <strong>Publish</strong>.";
    }
  }

  /* ---------------- text editing ---------------- */
  var editing = false;
  function onInput(e) {
    commitPending();
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
      if (isExcluded(elx)) return;
      if (on) {
        if (elx.__inkBound) return; // idempotent: don't double-bind (e.g. after re-render)
        elx.__inkBound = true;
        elx.setAttribute("contenteditable", "true");
        elx.setAttribute("spellcheck", "false");
        elx.classList.add("ink-editable");
        elx.addEventListener("input", onInput);
        elx.addEventListener("paste", onPaste);
      } else {
        elx.__inkBound = false;
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
      if (isExcluded(elx)) return;
      if (elx.querySelector(".ink-photo-tools")) return;
      var tools = el("div", "ink-photo-tools");
      var rep = el("button", "ink-photo-btn"); rep.type = "button"; rep.textContent = "\u2934 Replace photo";
      rep.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        photoTarget = elx.getAttribute(photoAttr()); fileInput.value = ""; fileInput.click();
      });
      var rem = el("button", "ink-photo-btn ink-photo-btn--ghost"); rem.type = "button"; rem.textContent = "Remove photo";
      rem.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var k = elx.getAttribute(photoAttr());
        var hasOverride = (LE.draftPhotos && LE.draftPhotos[k] != null) ||
                          (LE.published && LE.published.photos && LE.published.photos[k] != null);
        if (!hasOverride) { showToast("Nothing to remove \u2014 this card has no replaced photo. Use \u201cReplace photo\u201d to set one.", 5000); return; }
        pushHistory();
        delete LE.draftPhotos[k]; saveDraft(); LE.applyPhotos();
        showToast("Photo removed \u2014 back to the original.", 3000);
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
        pushHistory();
        LE.draftPhotos[photoTarget] = reader.result; saveDraft(); LE.applyPhotos();
        if (bridge.on) bridge.send(P.MSG.PHOTO, { key: photoTarget, dataUrl: reader.result });
        photoTarget = null;
      };
      reader.readAsDataURL(f);
    });
  }

  /* ---------------- PDF editing ---------------- */
  var pdfTarget = null;
  function addPdfControls() {
    document.querySelectorAll(pdfSel()).forEach(function (elx) {
      if (elx.querySelector(".ink-pdf-tools")) return;
      var tools = el("div", "ink-pdf-tools");
      var up = el("button", "ink-photo-btn"); up.type = "button"; up.textContent = "\uD83D\uDCCE Upload PDF";
      up.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        pdfTarget = elx.getAttribute(pdfAttr()); pdfInput.value = ""; pdfInput.click();
      });
      var rem = el("button", "ink-photo-btn ink-photo-btn--ghost"); rem.type = "button"; rem.textContent = "Remove";
      rem.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var key = elx.getAttribute(pdfAttr());
        delete LE.draftPdfs[key]; saveDraft();
        if (LE.published.pdfs) delete LE.published.pdfs[key];
        elx.classList.remove("ink-has-pdf");
        var card = elx.querySelector(".ink-pdf"); if (card) card.remove();
        if (bridge.on) bridge.send(P.MSG.PHOTO, { key: key, dataUrl: null }); // studio handles its own pdf state
      });
      tools.appendChild(up); tools.appendChild(rem); elx.appendChild(tools);
    });
  }
  function removePdfControls() {
    document.querySelectorAll(".ink-pdf-tools").forEach(function (t) { t.remove(); });
  }
  function wirePdfInput() {
    pdfInput.addEventListener("change", function () {
      var f = pdfInput.files && pdfInput.files[0];
      if (!f || !pdfTarget) return;
      if (P && f.size > P.LIMITS.pdfBytes) { showToast("That PDF is too large. Please choose one under 8 MB.", 6000); return; }
      var reader = new FileReader();
      reader.onload = function () {
        LE.draftPdfs[pdfTarget] = reader.result; saveDraft(); LE.applyPdfs();
        pdfTarget = null;
      };
      reader.readAsDataURL(f);
    });
  }

  /* ---------------- self-hosted video / audio ---------------- */
  var videoTarget = null, audioTarget = null;
  function addMediaControls(sel, toolsClass, attrGetter, uploadLabel, draftMap, applyFn, setTargetFn, msgType, removeMsgType) {
    document.querySelectorAll(sel).forEach(function (elx) {
      if (elx.querySelector("." + toolsClass)) return;
      var tools = el("div", toolsClass + " ink-media-tools");
      var up = el("button", "ink-photo-btn"); up.type = "button"; up.textContent = uploadLabel;
      up.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        setTargetFn(elx.getAttribute(attrGetter()));
      });
      var rem = el("button", "ink-photo-btn ink-photo-btn--ghost"); rem.type = "button"; rem.textContent = "Remove";
      rem.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var key = elx.getAttribute(attrGetter());
        var had = (draftMap()[key] != null) ||
                  (LE.published && LE.published[msgType] && LE.published[msgType][key] != null);
        if (!had) { showToast("Nothing to remove here yet.", 3500); return; }
        pushHistory();
        delete draftMap()[key];
        if (LE.published && LE.published[msgType]) delete LE.published[msgType][key];
        saveDraft(); applyFn();
        if (bridge.on && removeMsgType) bridge.send(removeMsgType, { key: key });
        showToast("Removed.", 2500);
      });
      tools.appendChild(up); tools.appendChild(rem); elx.appendChild(tools);
    });
  }
  function addVideoControls() {
    addMediaControls(videoSel(), "ink-video-tools", videoAttr, "\uD83C\uDFAC Upload video",
      function () { return LE.draftVideos; }, function () { LE.applyVideos(); },
      function (k) { videoTarget = k; videoInput.value = ""; videoInput.click(); },
      "videos", P.MSG.REMOVE_VIDEO);
  }
  function addAudioControls() {
    addMediaControls(audioSel(), "ink-audio-tools", audioAttr, "\uD83C\uDFB5 Upload audio",
      function () { return LE.draftAudios; }, function () { LE.applyAudios(); },
      function (k) { audioTarget = k; audioInput.value = ""; audioInput.click(); },
      "audios", P.MSG.REMOVE_AUDIO);
  }
  function removeMediaControls() {
    document.querySelectorAll(".ink-media-tools").forEach(function (t) { t.remove(); });
  }
  function wireMediaInput(input, getTarget, clearTarget, draftMap, applyFn, limitKey, tooBigMsg, msgType) {
    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      var key = getTarget();
      if (!f || !key) return;
      if (P && P.LIMITS[limitKey] && f.size > P.LIMITS[limitKey]) { showToast(tooBigMsg, 6000); return; }
      var reader = new FileReader();
      reader.onload = function () {
        pushHistory();
        draftMap()[key] = reader.result; saveDraft(); applyFn();
        if (bridge.on && msgType) bridge.send(msgType, { key: key, dataUrl: reader.result });
        clearTarget();
      };
      reader.readAsDataURL(f);
    });
  }
  function wireVideoInput() {
    wireMediaInput(videoInput, function () { return videoTarget; }, function () { videoTarget = null; },
      function () { return LE.draftVideos; }, function () { LE.applyVideos(); },
      "videoBytes", "That video is too large. Please choose one under 16 MB, or use \u201cEmbed a video\u201d for YouTube/Vimeo.", P.MSG.SET_VIDEO);
  }
  function wireAudioInput() {
    wireMediaInput(audioInput, function () { return audioTarget; }, function () { audioTarget = null; },
      function () { return LE.draftAudios; }, function () { LE.applyAudios(); },
      "audioBytes", "That audio file is too large. Please choose one under 10 MB.", P.MSG.SET_AUDIO);
  }

  /* ---------------- video embeds (YouTube / Vimeo) ---------------- */
  function addEmbedControls() {
    document.querySelectorAll(embedSel()).forEach(function (elx) {
      if (elx.querySelector(".ink-embed-tools")) return;
      var tools = el("div", "ink-embed-tools ink-media-tools");
      var setb = el("button", "ink-photo-btn"); setb.type = "button"; setb.textContent = "\uD83D\uDCFA Embed a video";
      setb.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var key = elx.getAttribute(embedAttr());
        var cur = (LE.draftEmbeds && LE.draftEmbeds[key]) ||
                  (LE.published && LE.published.embeds && LE.published.embeds[key]) || "";
        var url = window.prompt("Paste a YouTube or Vimeo link:", cur);
        if (url == null) return;
        url = String(url).trim();
        if (url === "") { return; }
        if (!P || !P.validEmbedUrl(url)) { showToast("That link isn't a supported YouTube or Vimeo video URL.", 6000); return; }
        pushHistory();
        LE.draftEmbeds[key] = url; saveDraft(); LE.applyEmbeds();
        if (bridge.on) bridge.send(P.MSG.SET_EMBED, { key: key, url: url });
        showToast("Video embedded.", 2500);
      });
      var rem = el("button", "ink-photo-btn ink-photo-btn--ghost"); rem.type = "button"; rem.textContent = "Remove";
      rem.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var key = elx.getAttribute(embedAttr());
        var had = (LE.draftEmbeds && LE.draftEmbeds[key] != null) ||
                  (LE.published && LE.published.embeds && LE.published.embeds[key] != null);
        if (!had) { showToast("No video here yet.", 3500); return; }
        pushHistory();
        delete LE.draftEmbeds[key];
        if (LE.published && LE.published.embeds) delete LE.published.embeds[key];
        elx.classList.remove("ink-has-embed");
        var w = elx.querySelector(".ink-embed"); if (w) w.remove();
        saveDraft();
        showToast("Removed.", 2500);
      });
      tools.appendChild(setb); tools.appendChild(rem); elx.appendChild(tools);
    });
  }

  /* ---------------- new page from .md ---------------- */
  function slugify(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  }
  function wireMdInput() {
    mdInput.addEventListener("change", function () {
      var f = mdInput.files && mdInput.files[0];
      if (!f) return;
      var maxMd = (P && P.PAGE_LIMITS) ? P.PAGE_LIMITS.markdownMax : 200000;
      if (f.size > maxMd) { showToast("That markdown file is too large.", 6000); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var md = String(reader.result || "");
        var defTitle = f.name.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]+/g, " ").trim() || "New page";
        var title = window.prompt("Page title:", defTitle);
        if (title == null) return;
        title = (title.trim() || defTitle).slice(0, 200);
        var slug = window.prompt("Page address (lowercase letters, numbers, hyphens):", slugify(title));
        if (slug == null) return;
        slug = slugify(slug);
        if (!slug || (P && P.validSlug && !P.validSlug(slug))) { showToast("That page address isn't valid. Use lowercase letters, numbers and hyphens.", 7000); return; }
        LE.draftPages = LE.draftPages || {};
        LE.draftPages[slug] = { title: title, markdown: md };
        saveDraft();
        showToast("Page \u201C" + title + "\u201D is ready. Press Publish, then open /p?p=" + slug, 8000);
      };
      reader.readAsText(f);
    });
  }

  /* ---------------- selection panel (animate / link / icon / style) ---------------- */
  /* Controls live in the bottom bar (never inside a contenteditable element,
     which would corrupt the saved HTML). Clicking or focusing an editable element
     reveals the controls that match the attributes it carries. */
  var selKeys = { anim: null, link: null, icon: null, style: null, alt: null };
  var selEl = null;

  function currentAnim(key) {
    return (LE.draftAnimations && LE.draftAnimations[key]) ||
      (LE.published.animations && LE.published.animations[key]) || "none";
  }
  function currentLink(key) {
    if (LE.draftLinks && LE.draftLinks[key] != null) return LE.draftLinks[key];
    if (LE.published.links && LE.published.links[key] != null) return LE.published.links[key];
    return "";
  }
  function currentIcon(key) {
    if (LE.draftIcons && LE.draftIcons[key] != null) return LE.draftIcons[key];
    if (LE.published.icons && LE.published.icons[key] != null) return LE.published.icons[key];
    return "";
  }
  function currentStyle(key) {
    var base = (LE.published.styles && LE.published.styles[key]) || {};
    var d = (LE.draftStyles && LE.draftStyles[key]) || {};
    return Object.assign({}, base, d);
  }
  function fillAnimSelect() {
    var sel = document.getElementById("leAnimSel");
    if (!sel || sel.options.length) return;
    ANIM_IDS.forEach(function (id) {
      var o = document.createElement("option");
      o.value = id; o.textContent = ANIM_LABELS[id] || id;
      sel.appendChild(o);
    });
  }
  function showEl(id, on) { var n = document.getElementById(id); if (n) n.hidden = !on; }
  function selectableSel() {
    return [editSel(), photoSel(), pdfSel(), linkSel(), iconSel(), styleSel()].join(",");
  }
  function selectTarget(elx) {
    if (!elx || isExcluded(elx)) return;
    var anim = elx.getAttribute(photoAttr()) || elx.getAttribute(editAttr());
    var link = elx.getAttribute(linkAttr());
    var icon = elx.getAttribute(iconAttr());
    var styl = elx.getAttribute(styleAttr());
    if (!anim && !link && !icon && !styl) return;
    if (emojiPop) emojiPop.hidden = true; // close the icon picker when selection changes
    markPending(); // remember pre-edit state; committed on first actual change
    selEl = elx;
    // Alt text only applies to real <img> elements that carry a photo key.
    var photoKey = elx.getAttribute(photoAttr());
    var alt = (photoKey && elx.tagName === "IMG") ? photoKey : null;
    selKeys = { anim: anim || null, link: link || null, icon: icon || null, style: styl || null, alt: alt || null };

    var kEl = document.getElementById("leSelKey");
    if (kEl) kEl.textContent = styl || link || icon || anim;

    showEl("leAnimWrap", !!anim);
    var asel = document.getElementById("leAnimSel"); if (asel && anim) asel.value = currentAnim(anim);
    showEl("leLinkWrap", !!link);
    var li = document.getElementById("leLinkInput"); if (li && link) li.value = currentLink(link);
    showEl("leIconWrap", !!icon);
    var ii = document.getElementById("leIconInput"); if (ii && icon) ii.value = currentIcon(icon);
    showEl("leAltWrap", !!alt);
    var ai = document.getElementById("leAltInput"); if (ai && alt) ai.value = currentAlt(alt);
    showEl("leStyleBtn", !!styl);
    showEl("leSelWrap", true);
  }
  function currentAlt(key) {
    if (LE.draftAlts && LE.draftAlts[key] != null) return LE.draftAlts[key];
    if (LE.published.alts && LE.published.alts[key] != null) return LE.published.alts[key];
    return (selEl && selEl.getAttribute && selEl.getAttribute("alt")) || "";
  }
  function setAlt(key, value) {
    if (!key) return;
    commitPending();
    LE.draftAlts = LE.draftAlts || {};
    LE.draftAlts[key] = String(value || "");
    saveDraft();
    if (LE.applyAlts) LE.applyAlts();
  }
  function setAnim(key, preset) {
    if (!key) return;
    commitPending();
    LE.draftAnimations = LE.draftAnimations || {};
    LE.draftAnimations[key] = preset || "none";
    saveDraft();
    if (LE.applyAnimations) LE.applyAnimations();
  }
  function setLink(key, href) {
    if (!key) return;
    commitPending();
    href = String(href || "").trim();
    LE.draftLinks = LE.draftLinks || {};
    if (!href) delete LE.draftLinks[key]; else LE.draftLinks[key] = href;
    saveDraft();
    if (LE.applyLinks) LE.applyLinks();
  }
  function setIcon(key, icon) {
    if (!key) return;
    commitPending();
    LE.draftIcons = LE.draftIcons || {};
    LE.draftIcons[key] = String(icon || "");
    saveDraft();
    if (LE.applyIcons) LE.applyIcons();
  }
  function setStyleProp(key, prop, value) {
    if (!key) return;
    commitPending();
    var m = Object.assign({}, currentStyle(key));
    if (value == null || value === "") delete m[prop]; else m[prop] = value;
    LE.draftStyles = LE.draftStyles || {};
    LE.draftStyles[key] = m;
    saveDraft();
    if (LE.applyStyles) LE.applyStyles();
  }
  function onAnimFocus(e) {
    var t = e.target;
    if (t && t.closest) { var el = t.closest(selectableSel()); if (el) selectTarget(el); }
  }
  function onAnimClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    // Don't hijack clicks on Inkwell's own chrome.
    if (t.closest(".ink-photo-tools") || t.closest(".ink-pdf-tools") || t.closest(".ink-media-tools") || t.closest(".ink-bar") ||
        t.closest(".ink-modal") || t.closest(".ink-emoji") || t.closest(".ink-item-tools")) return;
    var el = t.closest(selectableSel());
    if (!el) return;
    // While editing, selecting a link/button must not navigate away.
    var anchor = t.closest("a");
    if (anchor && (el.getAttribute(linkAttr()) != null || el.getAttribute(styleAttr()) != null || el === anchor)) {
      e.preventDefault();
    }
    selectTarget(el);
  }

  /* ---------------- selection control wiring ---------------- */
  function wireSelectionControls() {
    var li = document.getElementById("leLinkInput");
    if (li) li.addEventListener("input", function () { setLink(selKeys.link, this.value); });

    var ii = document.getElementById("leIconInput");
    if (ii) ii.addEventListener("input", function () { setIcon(selKeys.icon, this.value); });
    var ai = document.getElementById("leAltInput");
    if (ai) ai.addEventListener("input", function () { setAlt(selKeys.alt, this.value); });
    var pick = document.getElementById("leIconPick");
    if (pick) pick.addEventListener("click", function (e) {
      e.preventDefault();
      if (!emojiPop) return;
      emojiPop.hidden = !emojiPop.hidden;
      if (!emojiPop.hidden) {
        var r = pick.getBoundingClientRect();
        emojiPop.style.left = Math.max(8, r.left - 120) + "px";
        emojiPop.style.bottom = (window.innerHeight - r.top + 8) + "px";
      }
    });
    if (emojiPop) emojiPop.addEventListener("click", function (e) {
      var b = e.target.closest(".ink-emoji__b");
      if (!b) return;
      e.preventDefault();
      setIcon(selKeys.icon, b.textContent);
      var inp = document.getElementById("leIconInput"); if (inp) inp.value = b.textContent;
      emojiPop.hidden = true;
    });
    // Close the picker on any click that isn't the picker or its toggle button.
    document.addEventListener("click", function (e) {
      if (!emojiPop || emojiPop.hidden) return;
      var t = e.target;
      if (t && t.closest && (t.closest(".ink-emoji") || t.closest("#leIconPick"))) return;
      emojiPop.hidden = true;
    }, true);
    // Close on Escape for good measure.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && emojiPop && !emojiPop.hidden) emojiPop.hidden = true;
    });

    var styBtn = document.getElementById("leStyleBtn");
    if (styBtn) styBtn.addEventListener("click", function (e) { e.preventDefault(); openStyleModal(); });
    document.getElementById("leStyClose").addEventListener("click", function () { styleModal.hidden = true; });
    styleModal.addEventListener("click", function (e) { if (e.target === styleModal) styleModal.hidden = true; });

    bindStyle("leStyColor", "color", function (v) { return v; });
    bindStyle("leStyBg", "background-color", function (v) { return v; });
    bindRange("leStyFs", "leStyFsV", "font-size", "px");
    bindRange("leStyPad", "leStyPadV", "padding", "px");
    bindRange("leStyRad", "leStyRadV", "border-radius", "px");
    bindRange("leStyW", "leStyWV", "width", "%");
    var w = document.getElementById("leStyWeight");
    if (w) w.addEventListener("change", function () { setStyleProp(selKeys.style, "font-weight", this.value); });
    var align = document.getElementById("leStyAlign");
    if (align) align.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-v]"); if (!b) return;
      e.preventDefault();
      setStyleProp(selKeys.style, "text-align", b.getAttribute("data-v"));
      syncStyleModal();
    });
    document.getElementById("leStyClear").addEventListener("click", function () {
      if (!selKeys.style) return;
      commitPending();
      LE.draftStyles = LE.draftStyles || {};
      LE.draftStyles[selKeys.style] = {}; // empty map = "clear" (persists on publish)
      saveDraft();
      if (LE.applyStyles) LE.applyStyles();
      syncStyleModal();
    });
  }
  function bindStyle(id, prop) {
    var n = document.getElementById(id);
    if (n) n.addEventListener("input", function () { setStyleProp(selKeys.style, prop, this.value); });
  }
  function bindRange(id, labelId, prop, unit) {
    var n = document.getElementById(id);
    var lbl = document.getElementById(labelId);
    if (!n) return;
    n.addEventListener("input", function () {
      var v = this.value + unit;
      if (lbl) lbl.textContent = v;
      setStyleProp(selKeys.style, prop, v);
    });
  }
  function openStyleModal() {
    if (!selKeys.style) return;
    var sub = document.getElementById("leStySub"); if (sub) sub.textContent = selKeys.style;
    syncStyleModal();
    styleModal.hidden = false;
  }
  function syncStyleModal() {
    var m = currentStyle(selKeys.style);
    setVal("leStyColor", m["color"] || "#222222");
    setVal("leStyBg", m["background-color"] || "#ffffff");
    setRange("leStyFs", "leStyFsV", m["font-size"]);
    setRange("leStyPad", "leStyPadV", m["padding"]);
    setRange("leStyRad", "leStyRadV", m["border-radius"]);
    setRange("leStyW", "leStyWV", m["width"], "auto");
    setVal("leStyWeight", m["font-weight"] || "");
    var align = document.getElementById("leStyAlign");
    if (align) Array.prototype.forEach.call(align.children, function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-v") === m["text-align"]);
    });
  }
  function setVal(id, v) { var n = document.getElementById(id); if (n) n.value = v; }
  function setRange(id, labelId, v, fallback) {
    var n = document.getElementById(id); var lbl = document.getElementById(labelId);
    var num = v ? parseFloat(v) : NaN;
    if (n && !isNaN(num)) n.value = num;
    if (lbl) lbl.textContent = v || (fallback || "\u2014");
  }

  /* ---------------- structure (duplicate / remove / reorder cards) ---------------- */
  function genItemId(order, originals) {
    var id;
    do { id = "i" + Math.random().toString(36).slice(2, 8); }
    while (order.indexOf(id) !== -1 || (originals && originals.some(function (o) { return o.id === id; })));
    return id;
  }
  function forEachAttrEl(root, attr, fn) {
    if (root.hasAttribute(attr)) fn(root, root.getAttribute(attr));
    Array.prototype.forEach.call(root.querySelectorAll("[" + attr + "]"), function (el) { fn(el, el.getAttribute(attr)); });
  }
  // Copy the source card's current content into the duplicate's namespaced keys
  // so a duplicate starts identical to what the client sees.
  function copyItemContent(listKey, srcId, newId) {
    var info = (LE._lists || {})[listKey]; if (!info) return;
    var srcEl = info.container.querySelector("[" + itemAttr() + "='" + srcId + "']");
    if (!srcEl) return;
    var prefix = listKey + "." + srcId + ".";
    var l = lang();
    function nk(full) { return full.indexOf(prefix) === 0 ? (listKey + "." + newId + "." + full.slice(prefix.length)) : null; }
    forEachAttrEl(srcEl, editAttr(), function (el, full) { var k = nk(full); if (!k) return; LE.draft[l] = LE.draft[l] || {}; LE.draft[l][k] = sanitizeInline(el.innerHTML); });
    forEachAttrEl(srcEl, iconAttr(), function (el, full) { var k = nk(full); if (k) LE.draftIcons[k] = el.textContent; });
    forEachAttrEl(srcEl, linkAttr(), function (el, full) { var k = nk(full); var h = el.getAttribute("href"); if (k && h) LE.draftLinks[k] = h; });
    forEachAttrEl(srcEl, styleAttr(), function (el, full) { var k = nk(full); if (!k) return; var s = currentStyle(full); if (Object.keys(s).length) LE.draftStyles[k] = Object.assign({}, s); });
    forEachAttrEl(srcEl, photoAttr(), function (el, full) {
      var k = nk(full); if (!k) return;
      var src = LE.draftPhotos[full] != null ? LE.draftPhotos[full] : (LE.published.photos && LE.published.photos[full]);
      if (src) LE.draftPhotos[k] = src;
    });
  }
  function structAction(listKey, id, act) {
    var order = LE.listOrder(listKey);
    var idx = order.indexOf(id);
    if (idx === -1) return;
    pushHistory();
    if (act === "dup") {
      var info = (LE._lists || {})[listKey];
      var newId = genItemId(order, info && info.originals);
      copyItemContent(listKey, id, newId);
      order.splice(idx + 1, 0, newId);
    } else if (act === "del") {
      if (order.length <= 1) { showToast("A list needs at least one card.", 4000); return; }
      order.splice(idx, 1);
    } else if (act === "up") {
      if (idx === 0) return; var a = order[idx - 1]; order[idx - 1] = order[idx]; order[idx] = a;
    } else if (act === "down") {
      if (idx === order.length - 1) return; var b = order[idx + 1]; order[idx + 1] = order[idx]; order[idx] = b;
    } else { return; }
    LE.draftStructure[listKey] = { items: order };
    saveDraft();
    LE.apply();
    refreshEditingBindings();
  }
  function onItemToolsClick(e) {
    var b = e.target.closest && e.target.closest(".ink-item-tools button");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var tools = b.closest(".ink-item-tools");
    structAction(tools.getAttribute("data-list"), tools.getAttribute("data-id"), b.getAttribute("data-act"));
  }
  function unmountStructureControls() {
    Array.prototype.forEach.call(document.querySelectorAll(".ink-item-tools"), function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }
  function mountStructureControls() {
    unmountStructureControls();
    if (!editing) return;
    Object.keys(LE._lists || {}).forEach(function (listKey) {
      var container = (LE._lists[listKey] || {}).container; if (!container) return;
      Array.prototype.forEach.call(container.children, function (item) {
        if (!item.getAttribute || item.getAttribute(itemAttr()) == null) return;
        var tools = el("div", "ink-item-tools");
        tools.setAttribute("contenteditable", "false");
        tools.setAttribute("data-list", listKey);
        tools.setAttribute("data-id", item.getAttribute(itemAttr()));
        tools.innerHTML =
          '<button type="button" data-act="dup" title="Duplicate card">&#43;</button>' +
          '<button type="button" data-act="up" title="Move up">&#8593;</button>' +
          '<button type="button" data-act="down" title="Move down">&#8595;</button>' +
          '<button type="button" data-act="del" title="Remove card">&#10005;</button>';
        if (getComputedStyle(item).position === "static") item.style.position = "relative";
        item.appendChild(tools);
      });
    });
  }
  // After a re-render (structural change), re-attach the on-page editing affordances.
  function refreshEditingBindings() {
    setTextEditable(true);
    removePhotoControls(); addPhotoControls();
    removePdfControls(); addPdfControls();
    removeMediaControls(); addVideoControls(); addAudioControls(); addEmbedControls();
    mountStructureControls();
  }

  /* ---------------- toggle ---------------- */
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("ink-editing", on);
    setTextEditable(on);
    if (on) {
      // Keep undo history across Done/Edit toggles within a session; it's only
      // reset on Publish or Reset (where the draft baseline actually changes).
      pendingSnap = null; updateUndoButtons();
      addPhotoControls(); addPdfControls(); addVideoControls(); addAudioControls(); addEmbedControls(); mountStructureControls(); updateMsg();
      document.addEventListener("focusin", onAnimFocus);
      document.addEventListener("click", onAnimClick, true);
      document.addEventListener("click", onItemToolsClick, true);
      maybeShowTour();
    } else {
      removePhotoControls(); removePdfControls(); removeMediaControls(); unmountStructureControls();
      document.removeEventListener("focusin", onAnimFocus);
      document.removeEventListener("click", onAnimClick, true);
      document.removeEventListener("click", onItemToolsClick, true);
      selKeys = { anim: null, link: null, icon: null, style: null, alt: null }; selEl = null;
      var wrap = document.getElementById("leSelWrap"); if (wrap) wrap.hidden = true;
      if (styleModal) styleModal.hidden = true;
      if (emojiPop) emojiPop.hidden = true;
    }
    launchBtn.style.display = on ? "none" : "";
    bar.classList.toggle("is-on", on);
    if (LE.applyAnimations) LE.applyAnimations(); // refresh static/visible state
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
    if (previewOnly()) { showPreview(); return; }
    if (!window.confirm("Publish your changes to the live site now? Visitors will see them in about a minute. (You can restore an earlier version any time from History.)")) return;
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
        body: JSON.stringify({
          text: LE.draft, photos: LE.draftPhotos, pdfs: LE.draftPdfs, pages: LE.draftPages,
          animations: LE.draftAnimations, links: LE.draftLinks, icons: LE.draftIcons, styles: LE.draftStyles,
          structure: LE.draftStructure, seo: LE.draftSeo, alts: LE.draftAlts,
          videos: LE.draftVideos, audios: LE.draftAudios, embeds: LE.draftEmbeds
        })
      });
      if (r.status === 401 || r.status === 403) { setBusy(false); showLogin(); return; }
      var j = {}; try { j = await r.json(); } catch (e) {}
      if (!r.ok) throw new Error(j.error || ("Error " + r.status));
      onPublished(j.text);
      showInfo("Your changes are live \u{1F389}", "<p>Published successfully. Your site will reflect the update in about a minute (it rebuilds automatically).</p>", [
        { label: "View live page", primary: true, href: location.pathname, target: "_self" },
        { label: "Keep editing" }
      ]);
    } catch (e) {
      showToast("Could not publish: " + (e.message || e), 7000);
    }
    setBusy(false);
  }
  function onPublished(serverText) {
    // Promote draft to the published baseline for an instant local preview.
    LE.published.text = mergeText(LE.published.text, serverText || LE.draft);
    LE.published.photos = Object.assign({}, LE.published.photos);
    LE.published.animations = Object.assign({}, LE.published.animations, LE.draftAnimations);
    LE.published.pdfs = Object.assign({}, LE.published.pdfs);
    LE.published.links = Object.assign({}, LE.published.links, LE.draftLinks);
    LE.published.icons = Object.assign({}, LE.published.icons, LE.draftIcons);
    LE.published.styles = Object.assign({}, LE.published.styles, LE.draftStyles);
    LE.published.structure = Object.assign({}, LE.published.structure, LE.draftStructure);
    LE.published.seo = Object.assign({}, LE.published.seo, LE.draftSeo);
    LE.published.alts = Object.assign({}, LE.published.alts, LE.draftAlts);
    LE.published.embeds = Object.assign({}, LE.published.embeds, LE.draftEmbeds);
    LE.published.videos = Object.assign({}, LE.published.videos);
    LE.published.audios = Object.assign({}, LE.published.audios);
    Object.keys(LE.draftPhotos).forEach(function (k) { /* server has authoritative URL on next load */ });
    clearDraft();
    history.length = 0; future.length = 0; pendingSnap = null; updateUndoButtons();
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
  function showPreview() { if (previewModal) previewModal.hidden = false; }
  function hidePreview() { if (previewModal) previewModal.hidden = true; }
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
    history.length = 0; future.length = 0; pendingSnap = null; updateUndoButtons();
    if (editing) { setEditing(false); setEditing(true); }
  }

  /* ---------------- info modal / first-run tour ---------------- */
  function showInfo(title, bodyHtml, buttons) {
    if (!infoModal) return;
    document.getElementById("leInfoTitle").textContent = title;
    document.getElementById("leInfoBody").innerHTML = bodyHtml;
    var foot = document.getElementById("leInfoFoot");
    foot.innerHTML = "";
    (buttons || [{ label: "Got it", primary: true }]).forEach(function (b) {
      var node;
      if (b.href) { node = el("a", "ink-modal__btn" + (b.primary ? " ink-modal__btn--primary" : "")); node.href = b.href; node.target = b.target || "_self"; }
      else { node = el("button", "ink-modal__btn" + (b.primary ? " ink-modal__btn--primary" : "")); node.type = "button"; }
      node.textContent = b.label;
      node.addEventListener("click", function () { if (b.onClick) b.onClick(); if (b.keepOpen) return; hideInfo(); });
      foot.appendChild(node);
    });
    infoModal.hidden = false;
  }
  function hideInfo() { if (infoModal) infoModal.hidden = true; }
  var TOUR_KEY = "inkwell_tour_seen";
  function maybeShowTour() {
    try { if (localStorage.getItem(TOUR_KEY)) return; } catch (e) {}
    showInfo("You\u2019re editing this page", buildTourBody(), [{ label: "Start editing", primary: true, onClick: markTourSeen }]);
  }
  function markTourSeen() { try { localStorage.setItem(TOUR_KEY, "1"); } catch (e) {} }
  function buildTourBody() {
    return '<ul class="ink-tour">' +
      '<li><b>Click any text</b> to type \u2014 it edits right on the page.</li>' +
      '<li><b>Hover an image</b> for <i>Replace photo</i> (and add a description for SEO); hover a card for the <b>+ \u2191 \u2193 \u2715</b> toolbar to duplicate, reorder or remove it.</li>' +
      '<li>Click a button, icon or card to set its <b>link</b>, <b>emoji</b> or <b>style</b> in the bottom bar.</li>' +
      '<li>Use <b>\u{1F50E} SEO</b> to set how this page looks on Google.</li>' +
      '<li>Made a mistake? Use <b>Undo</b> (\u2318/Ctrl+Z), <b>Reset</b>, or <b>\u{1F551} History</b> to restore an earlier version.</li>' +
      '<li>Happy with it? Press <b>Publish</b> to make it live.</li>' +
      "</ul>";
  }

  /* ---------------- SEO (per-page title + description) ---------------- */
  function seoKey() { return location.pathname.replace(/\/+$/, "") || "/"; }
  function currentSeo() {
    var k = seoKey();
    var d = (LE.draftSeo && LE.draftSeo[k]) || null;
    if (d) return d;
    var p = (LE.published.seo && LE.published.seo[k]) || null;
    if (p) return p;
    var descEl = document.querySelector('meta[name="description"]');
    return { title: document.title || "", description: (descEl && descEl.getAttribute("content")) || "" };
  }
  function setSeo(field, value) {
    var k = seoKey();
    LE.draftSeo = LE.draftSeo || {};
    var cur = Object.assign({}, currentSeo());
    cur[field] = value;
    LE.draftSeo[k] = cur;
    saveDraft();
    if (LE.applySeo) LE.applySeo();
  }
  function openSeoModal() {
    if (!seoModal) return;
    pushHistory();
    var s = currentSeo();
    var ti = document.getElementById("leSeoTitleI"), di = document.getElementById("leSeoDescI");
    ti.value = s.title || ""; di.value = s.description || "";
    document.getElementById("leSeoUrl").textContent = location.host + seoKey();
    syncSeoPreview();
    seoModal.hidden = false; ti.focus();
  }
  function syncSeoPreview() {
    var ti = document.getElementById("leSeoTitleI"), di = document.getElementById("leSeoDescI");
    document.getElementById("leSeoPT").textContent = ti.value || "(page title)";
    document.getElementById("leSeoPD").textContent = di.value || "(description)";
    document.getElementById("leSeoTV").textContent = ti.value.length + "/70";
    document.getElementById("leSeoDV").textContent = di.value.length + "/320";
  }

  /* ---------------- version history ---------------- */
  function fmtDate(s) {
    if (!s) return "";
    try { return new Date(s).toLocaleString(); } catch (e) { return s; }
  }
  async function openHistory() {
    if (!historyModal) return;
    historyModal.hidden = false;
    var list = document.getElementById("leHistList");
    list.textContent = "Loading\u2026";
    try {
      var r = await fetch(api() + "/history", { credentials: "same-origin", headers: { "X-Inkwell": "1" } });
      var j = {}; try { j = await r.json(); } catch (e) {}
      if (!r.ok) { list.textContent = "Could not load history."; return; }
      var versions = (j.versions || []);
      if (!versions.length) { list.textContent = "No earlier versions yet. Publish a change and it\u2019ll appear here."; return; }
      list.innerHTML = "";
      versions.forEach(function (v, i) {
        var row = el("div", "ink-hist__row");
        var meta = el("div", "ink-hist__meta");
        meta.innerHTML = '<b>' + (i === 0 ? "Current" : "Version " + (versions.length - i)) + "</b>" +
          '<span>' + esc(fmtDate(v.date)) + "</span>";
        var btn = el("button", "ink-btn ink-btn--sm");
        btn.type = "button";
        btn.textContent = i === 0 ? "Latest" : "Restore";
        btn.disabled = i === 0;
        if (i !== 0) btn.addEventListener("click", function () { doRevert(v.id); });
        row.appendChild(meta); row.appendChild(btn);
        list.appendChild(row);
      });
    } catch (e) { list.textContent = "Could not load history."; }
  }
  async function doRevert(id) {
    if (!window.confirm("Restore your site\u2019s content to this version? Your current version is kept in history, so you can undo this.")) return;
    try {
      var r = await fetch(api() + "/revert", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Inkwell": "1" },
        body: JSON.stringify({ id: id })
      });
      var j = {}; try { j = await r.json(); } catch (e) {}
      if (!r.ok) { showToast(j.error || "Could not restore that version.", 6000); return; }
      if (historyModal) historyModal.hidden = true;
      showInfo("Restored \u2705", "<p>Your content was restored. The live site will update in about a minute. Reloading this page to show it\u2026</p>", [
        { label: "Reload now", primary: true, onClick: function () { location.reload(); } }
      ]);
      setTimeout(function () { location.reload(); }, 2500);
    } catch (e) { showToast("Network error. Please try again.", 5000); }
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
    wirePdfInput();
    wireVideoInput();
    wireAudioInput();
    wireMdInput();
    LE.apply();
    launchBtn.addEventListener("click", function () { setEditing(true); });
    document.getElementById("leDone").addEventListener("click", function () { setEditing(false); });
    document.getElementById("leReset").addEventListener("click", resetAll);
    document.getElementById("lePublish").addEventListener("click", publish);
    document.getElementById("leUndo").addEventListener("click", undo);
    document.getElementById("leRedo").addEventListener("click", redo);
    var seoBtn = document.getElementById("leSeo");
    if (seoBtn) {
      seoBtn.hidden = previewOnly() ? false : false; // visible in both; preview just won't persist
      seoBtn.addEventListener("click", function (e) { e.preventDefault(); openSeoModal(); });
    }
    document.getElementById("leInfoClose").addEventListener("click", hideInfo);
    infoModal.addEventListener("click", function (e) { if (e.target === infoModal) hideInfo(); });
    var histBtn = document.getElementById("leHistory");
    if (histBtn) histBtn.addEventListener("click", function (e) { e.preventDefault(); openHistory(); });
    document.getElementById("leHistClose").addEventListener("click", function () { historyModal.hidden = true; });
    historyModal.addEventListener("click", function (e) { if (e.target === historyModal) historyModal.hidden = true; });
    // Reveal History only when a real, configured backend exists (it needs Git).
    if (!previewOnly()) {
      checkMe().then(function (s) {
        if (s.hasApi && s.configured && histBtn) histBtn.hidden = false;
      });
    }
    var seoTitleI = document.getElementById("leSeoTitleI"), seoDescI = document.getElementById("leSeoDescI");
    seoTitleI.addEventListener("input", function () { setSeo("title", this.value); syncSeoPreview(); });
    seoDescI.addEventListener("input", function () { setSeo("description", this.value); syncSeoPreview(); });
    document.getElementById("leSeoClose").addEventListener("click", function () { seoModal.hidden = true; });
    document.getElementById("leSeoSave").addEventListener("click", function () { seoModal.hidden = true; });
    seoModal.addEventListener("click", function (e) { if (e.target === seoModal) seoModal.hidden = true; });
    document.addEventListener("keydown", function (e) {
      if (!editing) return;
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      var k = (e.key || "").toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    });
    document.getElementById("leModalClose").addEventListener("click", hideLogin);
    document.getElementById("leDoLogin").addEventListener("click", doLogin);
    document.getElementById("leDoMagic").addEventListener("click", doMagic);
    modal.addEventListener("click", function (e) { if (e.target === modal) hideLogin(); });

    fillAnimSelect();
    document.getElementById("leAnimSel").addEventListener("change", function () {
      setAnim(selKeys.anim, this.value);
    });
    wireSelectionControls();

    var np = document.getElementById("leNewPage");
    if (np) {
      np.hidden = previewOnly(); // pages require real publishing
      np.addEventListener("click", function () { mdInput.value = ""; mdInput.click(); });
    }

    if (previewOnly()) {
      var pub = document.getElementById("lePublish");
      if (pub) pub.textContent = cfg().publishLabel || "How publishing works";
      document.getElementById("lePvClose").addEventListener("click", hidePreview);
      document.getElementById("lePvKeep").addEventListener("click", hidePreview);
      previewModal.addEventListener("click", function (e) { if (e.target === previewModal) hidePreview(); });
    }

    if (/[?&]le=signedin/.test(location.search)) {
      setEditing(true);
      showToast("You're signed in. Make your edits, then press Publish.", 6500);
    }
  }

  if (cfg().inline === false) return; // studio-only target site: skip the toolbar
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
