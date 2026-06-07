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
  LE.published = { text: {}, photos: {}, pdfs: {}, videos: {}, audios: {}, embeds: {}, animations: {}, links: {}, icons: {}, styles: {}, structure: {}, seo: {}, alts: {} };
  LE.draft = { text: {}, photos: {} };       // editor working copy (per lang)
  LE.draftPhotos = {};                        // key -> dataURL (working copy)
  LE.draftPdfs = {};                          // key -> dataURL (working copy)
  LE.draftVideos = {};                        // key -> dataURL (self-hosted video)
  LE.draftAudios = {};                        // key -> dataURL (self-hosted audio)
  LE.draftEmbeds = {};                        // key -> embed URL (YouTube/Vimeo)
  LE.draftAnimations = {};                     // key -> presetId (working copy)
  LE.draftLinks = {};                          // key -> href (working copy)
  LE.draftIcons = {};                          // key -> emoji/text (working copy)
  LE.draftStyles = {};                         // key -> { cssProp: value } (working copy)
  LE.draftStructure = {};                      // listKey -> { items: [id,...] } (working copy)
  LE.draftSeo = {};                            // pagePath -> { title, description } (working copy)
  LE.draftAlts = {};                           // photoKey -> alt text (working copy)
  LE._lists = {};                              // listKey -> { container, templateHtml, originals }
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
  function pdfAttr() { return cfg().pdfAttribute || "data-pdf"; }
  function videoAttr() { return cfg().videoAttribute || "data-video"; }
  function audioAttr() { return cfg().audioAttribute || "data-audio"; }
  function embedAttr() { return cfg().embedAttribute || "data-embed"; }
  function linkAttr() { return cfg().linkAttribute || "data-link"; }
  function iconAttr() { return cfg().iconAttribute || "data-icon"; }
  function styleAttr() { return cfg().styleAttribute || "data-style"; }
  function listAttr() { return cfg().listAttribute || "data-list"; }
  function itemAttr() { return cfg().itemAttribute || "data-item"; }
  function editEls() { return document.querySelectorAll("[" + editAttr() + "]"); }
  function photoEls() { return document.querySelectorAll("[" + photoAttr() + "]"); }
  function pdfEls() { return document.querySelectorAll("[" + pdfAttr() + "]"); }
  function videoEls() { return document.querySelectorAll("[" + videoAttr() + "]"); }
  function audioEls() { return document.querySelectorAll("[" + audioAttr() + "]"); }
  function embedEls() { return document.querySelectorAll("[" + embedAttr() + "]"); }
  function linkEls() { return document.querySelectorAll("[" + linkAttr() + "]"); }
  function iconEls() { return document.querySelectorAll("[" + iconAttr() + "]"); }
  // Any editable element can be styled, not just [data-style] ones. We resolve a
  // single stable "style key" per element (preferring an explicit data-style),
  // so fonts/colors/sizes work on plain text/photos/links/icons too.
  function styleKeyFor(el) {
    return el.getAttribute(styleAttr()) || el.getAttribute(editAttr()) ||
           el.getAttribute(photoAttr()) || el.getAttribute(linkAttr()) || el.getAttribute(iconAttr());
  }
  LE.styleKeyFor = styleKeyFor;
  function styleEls() {
    return document.querySelectorAll(
      "[" + styleAttr() + "],[" + editAttr() + "],[" + photoAttr() + "],[" + linkAttr() + "],[" + iconAttr() + "]"
    );
  }

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

  /* ---------------- PDFs (safe document cards) ---------------- */
  /* A [data-pdf] element is rendered as a styled link card that opens the PDF
     in a new tab (the browser's own viewer). We build it with DOM APIs and
     textContent (never innerHTML of untrusted data) and we NEVER inject
     iframe/embed/object. The href is an already-validated /uploads/*.pdf path
     (or, while editing, a local data: URL the author just picked). */
  function pdfNameFromSrc(src) {
    if (/^data:/.test(src)) return "Document.pdf";
    try {
      var clean = String(src).split("?")[0].split("#")[0];
      var base = clean.substring(clean.lastIndexOf("/") + 1);
      return decodeURIComponent(base) || "Document.pdf";
    } catch (e) { return "Document.pdf"; }
  }
  function safePdfHref(src) {
    if (/^data:application\/pdf/i.test(src)) return src;
    // Only allow same-origin paths under uploads (defense in depth).
    if (typeof src === "string" && src.charAt(0) === "/" && src.indexOf("..") === -1) return src;
    return null;
  }
  function ensurePdfStyle() {
    if (document.getElementById("ink-pdf-style")) return;
    var css =
      ".ink-pdf{display:inline-flex;align-items:center;gap:14px;max-width:100%;text-decoration:none;" +
      "padding:14px 18px;border:1px solid rgba(0,0,0,.12);border-radius:12px;background:#fff;color:#16203a;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.07);transition:transform .15s ease,box-shadow .15s ease}" +
      ".ink-pdf:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.12)}" +
      ".ink-pdf__ico{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;" +
      "border-radius:9px;background:#e8463b;color:#fff;font:700 12px/1 system-ui,sans-serif;letter-spacing:.04em}" +
      ".ink-pdf__meta{display:flex;flex-direction:column;gap:3px;min-width:0}" +
      ".ink-pdf__name{font:600 15px/1.2 system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".ink-pdf__hint{font:500 13px/1 system-ui,sans-serif;color:#6b7280}";
    var st = document.createElement("style"); st.id = "ink-pdf-style"; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }
  function renderPdfCard(el, src) {
    var href = safePdfHref(src);
    ensurePdfStyle();
    el.classList.add("ink-has-pdf");
    while (el.firstChild) el.removeChild(el.firstChild);
    if (!href) return;
    var a = document.createElement("a");
    a.className = "ink-pdf";
    a.setAttribute("href", href);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
    var ico = document.createElement("span"); ico.className = "ink-pdf__ico"; ico.textContent = "PDF";
    var meta = document.createElement("span"); meta.className = "ink-pdf__meta";
    var name = document.createElement("span"); name.className = "ink-pdf__name"; name.textContent = pdfNameFromSrc(href);
    var hint = document.createElement("span"); hint.className = "ink-pdf__hint"; hint.textContent = "Open document \u2192";
    meta.appendChild(name); meta.appendChild(hint);
    a.appendChild(ico); a.appendChild(meta);
    el.appendChild(a);
  }
  function applyPdfs() {
    var local = LE.draftPdfs || {};
    var pub = (LE.published && LE.published.pdfs) || {};
    Array.prototype.forEach.call(pdfEls(), function (el) {
      var k = el.getAttribute(pdfAttr());
      var src = local[k] != null ? local[k] : pub[k];
      if (src) renderPdfCard(el, src);
    });
  }
  LE.applyPdfs = applyPdfs;

  /* ---------------- self-hosted video / audio ----------------
     Rendered with <video>/<audio> built via DOM APIs (never the HTML sanitizer).
     The src is an already-validated same-origin /uploads/* path or, while
     editing, a local data: URL the author just picked. */
  function safeMediaHref(src, kind) {
    if (typeof src !== "string") return null;
    if (new RegExp("^data:" + kind + "/", "i").test(src)) return src;
    if (src.charAt(0) === "/" && src.indexOf("..") === -1) return src; // same-origin uploads path
    return null;
  }
  function renderMediaEl(host, src, kind) {
    var href = safeMediaHref(src, kind);
    host.classList.add(kind === "video" ? "ink-has-video" : "ink-has-audio");
    while (host.firstChild) host.removeChild(host.firstChild);
    if (!href) return;
    var m = document.createElement(kind); // "video" | "audio"
    m.setAttribute("controls", "");
    m.setAttribute("preload", "metadata");
    m.setAttribute("playsinline", "");
    m.className = kind === "video" ? "ink-video" : "ink-audio";
    if (kind === "video") { m.style.maxWidth = "100%"; m.style.display = "block"; }
    m.setAttribute("src", href);
    host.appendChild(m);
  }
  function applyVideos() {
    var local = LE.draftVideos || {};
    var pub = (LE.published && LE.published.videos) || {};
    Array.prototype.forEach.call(videoEls(), function (el) {
      var k = el.getAttribute(videoAttr());
      var src = local[k] != null ? local[k] : pub[k];
      if (src) renderMediaEl(el, src, "video");
    });
  }
  function applyAudios() {
    var local = LE.draftAudios || {};
    var pub = (LE.published && LE.published.audios) || {};
    Array.prototype.forEach.call(audioEls(), function (el) {
      var k = el.getAttribute(audioAttr());
      var src = local[k] != null ? local[k] : pub[k];
      if (src) renderMediaEl(el, src, "audio");
    });
  }
  LE.applyVideos = applyVideos;
  LE.applyAudios = applyAudios;

  /* ---------------- video embeds (YouTube / Vimeo) ----------------
     A click-to-load, sandboxed iframe for an allow-listed host only. We never
     accept arbitrary HTML/hosts: the stored value is a URL, canonicalized by the
     SAME protocol parseEmbed() used server-side, and the iframe src is rebuilt
     from { provider, id } so a crafted URL can't smuggle anything in. */
  function ensureEmbedStyle() {
    if (document.getElementById("ink-embed-style")) return;
    var css =
      ".ink-embed{position:relative;display:block;width:100%;max-width:100%;aspect-ratio:16/9;" +
      "background:#0b1020;border-radius:12px;overflow:hidden;cursor:pointer}" +
      ".ink-embed__btn{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border:0;" +
      "width:100%;height:100%;background:linear-gradient(135deg,#1a2238,#0b1020);color:#fff;cursor:pointer}" +
      ".ink-embed__play{width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.18);" +
      "display:flex;align-items:center;justify-content:center;font-size:26px;backdrop-filter:blur(2px)}" +
      ".ink-embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}";
    var st = document.createElement("style"); st.id = "ink-embed-style"; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }
  function embedSrc(info) {
    if (!info) return null;
    if (info.provider === "youtube") return "https://www.youtube-nocookie.com/embed/" + info.id + "?autoplay=1&rel=0";
    if (info.provider === "vimeo") return "https://player.vimeo.com/video/" + info.id + "?autoplay=1";
    return null;
  }
  function renderEmbed(host, url) {
    var info = (P && P.parseEmbed) ? P.parseEmbed(url) : null;
    ensureEmbedStyle();
    host.classList.add("ink-has-embed");
    while (host.firstChild) host.removeChild(host.firstChild);
    if (!info) return;
    var wrap = document.createElement("div"); wrap.className = "ink-embed";
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "ink-embed__btn";
    btn.setAttribute("aria-label", "Play video");
    var play = document.createElement("span"); play.className = "ink-embed__play"; play.textContent = "\u25B6";
    btn.appendChild(play);
    btn.addEventListener("click", function () {
      var src = embedSrc(info);
      if (!src) return;
      var ifr = document.createElement("iframe");
      ifr.setAttribute("src", src);
      ifr.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen");
      ifr.setAttribute("allowfullscreen", "");
      ifr.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      ifr.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
      ifr.setAttribute("title", "Embedded video");
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
      wrap.appendChild(ifr);
    });
    wrap.appendChild(btn);
    host.appendChild(wrap);
  }
  function applyEmbeds() {
    var local = LE.draftEmbeds || {};
    var pub = (LE.published && LE.published.embeds) || {};
    Array.prototype.forEach.call(embedEls(), function (el) {
      var k = el.getAttribute(embedAttr());
      var url = local[k] != null ? local[k] : pub[k];
      if (url) renderEmbed(el, url);
    });
  }
  LE.applyEmbeds = applyEmbeds;

  /* ---------------- animations (scroll-reveal presets) ---------------- */
  /* Presets are IDs only (validated against the protocol allow-list) and map to
     fixed CSS classes the runtime injects itself. No user CSS/HTML is ever
     trusted, so this cannot widen the XSS surface. */
  var ANIM_IDS = (P && P.ANIMATION_PRESETS) || ["none", "fade", "fade-up", "fade-down", "zoom", "slide-left", "slide-right"];
  var ANIM_CLASSES = ["ink-anim", "ink-anim--fade", "ink-anim--fade-up", "ink-anim--fade-down", "ink-anim--zoom", "ink-anim--slide-left", "ink-anim--slide-right", "ink-anim--in"];
  var animObserver = null;

  function ensureAnimStyle() {
    if (document.getElementById("ink-anim-style")) return;
    var css =
      ".ink-anim{opacity:0;transition:opacity .7s cubic-bezier(.22,.61,.36,1),transform .7s cubic-bezier(.22,.61,.36,1);will-change:opacity,transform}" +
      ".ink-anim--fade-up{transform:translateY(26px)}" +
      ".ink-anim--fade-down{transform:translateY(-26px)}" +
      ".ink-anim--zoom{transform:scale(.92)}" +
      ".ink-anim--slide-left{transform:translateX(30px)}" +
      ".ink-anim--slide-right{transform:translateX(-30px)}" +
      ".ink-anim.ink-anim--in{opacity:1;transform:none}" +
      "body.ink-editing .ink-anim{opacity:1 !important;transform:none !important}" +
      "@media (prefers-reduced-motion: reduce){.ink-anim{opacity:1 !important;transform:none !important;transition:none}}";
    var st = document.createElement("style");
    st.id = "ink-anim-style"; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }
  function validAnim(a) { return ANIM_IDS.indexOf(a) !== -1 && a !== "none"; }
  function getAnimObserver() {
    if (animObserver || typeof IntersectionObserver === "undefined") return animObserver;
    animObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("ink-anim--in"); animObserver.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    return animObserver;
  }
  function applyAnimations() {
    var draft = LE.draftAnimations || {};
    var pub = (LE.published && LE.published.animations) || {};
    ensureAnimStyle();
    var editing = document.body.classList.contains("ink-editing");
    var ob = getAnimObserver();
    var els = Array.prototype.slice.call(editEls()).concat(Array.prototype.slice.call(photoEls()));
    els.forEach(function (el) {
      var key = el.getAttribute(editAttr()) || el.getAttribute(photoAttr());
      if (!key) return;
      var preset = draft[key] != null ? draft[key] : pub[key];
      ANIM_CLASSES.forEach(function (c) { el.classList.remove(c); });
      if (!validAnim(preset)) return;
      el.classList.add("ink-anim");
      el.classList.add("ink-anim--" + preset);
      if (ob && !editing) {
        var r = el.getBoundingClientRect();
        if (r.top < (window.innerHeight || 0) * 0.95) { el.classList.add("ink-anim--in"); }
        else { ob.observe(el); }
      } else {
        el.classList.add("ink-anim--in"); // editing or no IO support: show statically
      }
    });
  }

  /* ---------------- links / icons / styles (plain value maps) ---------------- */
  var STYLE_PROPS = (P && P.STYLE_PROPS) || null;
  function linkValid(v) { return P ? P.validLinkValue(v) : (typeof v === "string" && (v.charAt(0) === "/" || v.charAt(0) === "#" || /^(https?:|mailto:|tel:)/i.test(v))); }
  function styleValid(prop, v) { return P ? P.validStyleValue(prop, v) : false; }

  function applyLinks() {
    var local = LE.draftLinks || {};
    var pub = (LE.published && LE.published.links) || {};
    Array.prototype.forEach.call(linkEls(), function (el) {
      var k = el.getAttribute(linkAttr());
      var href = local[k] != null ? local[k] : pub[k];
      if (href == null || !linkValid(href)) return;
      if (el.tagName === "A") {
        el.setAttribute("href", href);
        if (/^https?:/i.test(href)) el.setAttribute("rel", "noopener noreferrer nofollow");
      } else {
        el.setAttribute("data-ink-href", href); // non-anchor: expose for host handling
      }
    });
  }

  function applyIcons() {
    var local = LE.draftIcons || {};
    var pub = (LE.published && LE.published.icons) || {};
    Array.prototype.forEach.call(iconEls(), function (el) {
      var k = el.getAttribute(iconAttr());
      var ic = local[k] != null ? local[k] : pub[k];
      if (ic == null) return;
      el.textContent = String(ic); // textContent only: never markup
    });
  }

  function applyStyles() {
    if (!STYLE_PROPS) return;
    var local = LE.draftStyles || {};
    var pub = (LE.published && LE.published.styles) || {};
    Array.prototype.forEach.call(styleEls(), function (el) {
      var k = styleKeyFor(el);
      var map = k != null ? (local[k] != null ? local[k] : pub[k]) : null;
      // Clear anything Inkwell previously applied so removals take effect.
      var prev = el.__inkStyleProps || [];
      prev.forEach(function (p) { el.style.removeProperty(p); });
      var appliedNow = [];
      if (map && typeof map === "object") {
        Object.keys(map).forEach(function (prop) {
          if (STYLE_PROPS.hasOwnProperty(prop) && styleValid(prop, map[prop])) {
            el.style.setProperty(prop, map[prop]); // CSSOM rejects anything unsafe too
            appliedNow.push(prop);
          }
        });
      }
      el.__inkStyleProps = appliedNow;
    });
  }

  /* ---------------- image alt text (SEO + accessibility) ---------------- */
  function applyAlts() {
    var local = LE.draftAlts || {};
    var pub = (LE.published && LE.published.alts) || {};
    Array.prototype.forEach.call(photoEls(), function (el) {
      if (el.tagName !== "IMG") return;
      var k = el.getAttribute(photoAttr());
      var alt = local[k] != null ? local[k] : pub[k];
      if (alt == null) return;
      el.setAttribute("alt", String(alt)); // attribute value only: never markup
    });
  }
  LE.applyAlts = applyAlts;

  /* ---------------- SEO: per-page <title> + meta description ---------------- */
  function seoKey() { return (location.pathname || "/").replace(/\/+$/, "") || "/"; }
  function applySeo() {
    var local = (LE.draftSeo || {})[seoKey()];
    var pub = (LE.published && LE.published.seo && LE.published.seo[seoKey()]) || null;
    var s = local || pub;
    if (!s || typeof s !== "object") return;
    if (typeof s.title === "string" && s.title) document.title = s.title;
    if (typeof s.description === "string") {
      var m = document.querySelector('meta[name="description"]');
      if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
      m.setAttribute("content", s.description);
    }
  }
  LE.applySeo = applySeo;

  /* ---------------- structure (repeatable cards) ----------------
     A [data-list="k"] container holds [data-item] children. We capture the
     author's pristine template (relative keys) once, then rebuild the list from
     an ordered list of item-ids, cloning the template markup and namespacing each
     clone's keys to "listKey.itemId.relKey". No user HTML is ever injected — only
     the author's own markup is cloned — so this can't widen the XSS surface. */
  var STRUCT_ATTRS = null;
  function structAttrs() {
    if (!STRUCT_ATTRS) STRUCT_ATTRS = [editAttr(), photoAttr(), pdfAttr(), linkAttr(), iconAttr(), styleAttr()];
    return STRUCT_ATTRS;
  }
  function validItemId(id) { return P ? P.validItemId(id) : /^[a-zA-Z0-9_-]{1,40}$/.test(id); }
  function itemsOf(container) {
    return Array.prototype.filter.call(container.children, function (c) { return c.nodeType === 1 && c.hasAttribute(itemAttr()); });
  }
  function nodeFromHtml(html) {
    var tpl = document.createElement("template");
    tpl.innerHTML = String(html == null ? "" : html).trim();
    return tpl.content && tpl.content.firstElementChild;
  }
  function namespaceKeys(node, listKey, id) {
    structAttrs().forEach(function (attr) {
      var els = [];
      if (node.hasAttribute(attr)) els.push(node);
      Array.prototype.push.apply(els, node.querySelectorAll("[" + attr + "]"));
      els.forEach(function (el) {
        var rel = el.getAttribute(attr);
        if (rel != null) el.setAttribute(attr, listKey + "." + id + "." + rel);
      });
    });
  }
  function captureStructure() {
    Array.prototype.forEach.call(document.querySelectorAll("[" + listAttr() + "]"), function (container) {
      var listKey = container.getAttribute(listAttr());
      if (!listKey || LE._lists[listKey]) return;
      var items = itemsOf(container);
      if (!items.length) return;
      LE._lists[listKey] = {
        container: container,
        templateHtml: items[0].outerHTML,
        originals: items.map(function (el, i) { return { id: "o" + i, html: el.outerHTML }; })
      };
    });
  }
  LE.captureStructure = captureStructure;
  function listOrder(listKey) {
    var d = LE.draftStructure[listKey];
    if (d && d.items) return d.items.slice();
    var p = LE.published.structure && LE.published.structure[listKey];
    if (p && p.items) return p.items.slice();
    var info = LE._lists[listKey];
    return info ? info.originals.map(function (o) { return o.id; }) : [];
  }
  LE.listOrder = listOrder;
  function applyStructure() {
    Object.keys(LE._lists || {}).forEach(function (listKey) {
      var info = LE._lists[listKey];
      var container = info.container;
      var order = listOrder(listKey).filter(validItemId);
      if (!order.length) order = info.originals.map(function (o) { return o.id; });
      itemsOf(container).forEach(function (el) { container.removeChild(el); });
      order.forEach(function (id) {
        var orig = null;
        for (var i = 0; i < info.originals.length; i++) { if (info.originals[i].id === id) { orig = info.originals[i]; break; } }
        var node = nodeFromHtml(orig ? orig.html : info.templateHtml);
        if (!node) return;
        node.setAttribute(itemAttr(), id);
        namespaceKeys(node, listKey, id);
        container.appendChild(node);
      });
    });
  }
  LE.applyStructure = applyStructure;

  function apply() { applyStructure(); applyText(); applyPhotos(); applyPdfs(); applyVideos(); applyAudios(); applyEmbeds(); applyAnimations(); applyLinks(); applyIcons(); applyStyles(); applyAlts(); applySeo(); }
  LE.apply = apply;
  LE.applyText = applyText;
  LE.applyPhotos = applyPhotos;
  LE.applyAnimations = applyAnimations;
  LE.applyLinks = applyLinks;
  LE.applyIcons = applyIcons;
  LE.applyStyles = applyStyles;

  function loadPublished(done) {
    var base = cfg().contentUrl || "/content";
    var pending = 10;
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
    get(base + "/pdfs.json", function (j) { LE.published.pdfs = j || {}; });
    get(base + "/videos.json", function (j) { LE.published.videos = j || {}; });
    get(base + "/audios.json", function (j) { LE.published.audios = j || {}; });
    get(base + "/embeds.json", function (j) { LE.published.embeds = j || {}; });
    get(base + "/animations.json", function (j) { LE.published.animations = j || {}; });
    get(base + "/links.json", function (j) { LE.published.links = j || {}; });
    get(base + "/icons.json", function (j) { LE.published.icons = j || {}; });
    get(base + "/styles.json", function (j) { LE.published.styles = j || {}; });
    get(base + "/structure.json", function (j) { LE.published.structure = j || {}; });
    get(base + "/seo.json", function (j) { LE.published.seo = j || {}; });
    get(base + "/alts.json", function (j) { LE.published.alts = j || {}; });
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
        case P.MSG.SET_PDF:
          if (!armed || !P.validKey(msg.key)) return;
          LE.draftPdfs[msg.key] = String(msg.dataUrl || "");
          applyPdfs();
          break;
        case P.MSG.REMOVE_PDF:
          if (!armed || !P.validKey(msg.key)) return;
          delete LE.draftPdfs[msg.key];
          applyPdfs();
          break;
        case P.MSG.SET_VIDEO:
          if (!armed || !P.validKey(msg.key)) return;
          LE.draftVideos = LE.draftVideos || {};
          LE.draftVideos[msg.key] = String(msg.dataUrl || "");
          applyVideos();
          break;
        case P.MSG.REMOVE_VIDEO:
          if (!armed || !P.validKey(msg.key)) return;
          if (LE.draftVideos) delete LE.draftVideos[msg.key];
          applyVideos();
          break;
        case P.MSG.SET_AUDIO:
          if (!armed || !P.validKey(msg.key)) return;
          LE.draftAudios = LE.draftAudios || {};
          LE.draftAudios[msg.key] = String(msg.dataUrl || "");
          applyAudios();
          break;
        case P.MSG.REMOVE_AUDIO:
          if (!armed || !P.validKey(msg.key)) return;
          if (LE.draftAudios) delete LE.draftAudios[msg.key];
          applyAudios();
          break;
        case P.MSG.SET_EMBED:
          if (!armed || !P.validKey(msg.key) || !P.validEmbedUrl(msg.url)) return;
          LE.draftEmbeds = LE.draftEmbeds || {};
          LE.draftEmbeds[msg.key] = String(msg.url || "");
          applyEmbeds();
          break;
        case P.MSG.SET_ANIM:
          if (!armed || !P.validKey(msg.key)) return;
          LE.draftAnimations[msg.key] = P.validAnimation(msg.preset) ? msg.preset : "none";
          applyAnimations();
          break;
        case P.MSG.SET_LINK:
          if (!armed || !P.validKey(msg.key) || !P.validLinkValue(msg.href)) return;
          LE.draftLinks[msg.key] = String(msg.href);
          applyLinks();
          break;
        case P.MSG.SET_ICON:
          if (!armed || !P.validKey(msg.key) || !P.validIcon(msg.icon)) return;
          LE.draftIcons[msg.key] = String(msg.icon);
          applyIcons();
          break;
        case P.MSG.SET_STYLE:
          if (!armed || !P.validKey(msg.key) || !P.validStyleMap(msg.style)) return;
          LE.draftStyles[msg.key] = msg.style;
          applyStyles();
          break;
        case P.MSG.SET_STRUCTURE:
          if (!armed || !P.validKey(msg.key) || !Array.isArray(msg.items)) return;
          if (!P.validStructureMap({ k: { items: msg.items } })) return;
          LE.draftStructure[msg.key] = { items: msg.items.slice() };
          apply();
          break;
        case P.MSG.SET_SEO:
          if (!armed || !P.validSeoPath(msg.key) || !P.validSeoEntry(msg.seo)) return;
          LE.draftSeo[msg.key] = msg.seo;
          applySeo();
          break;
        case P.MSG.SET_ALT:
          if (!armed || !P.validKey(msg.key) || !P.validAltValue(msg.alt)) return;
          LE.draftAlts[msg.key] = String(msg.alt);
          applyAlts();
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
    Array.prototype.forEach.call(pdfEls(), function (el) {
      out.push({ key: el.getAttribute(pdfAttr()), kind: "pdf" });
    });
    Array.prototype.forEach.call(linkEls(), function (el) {
      out.push({ key: el.getAttribute(linkAttr()), kind: "link" });
    });
    Array.prototype.forEach.call(iconEls(), function (el) {
      out.push({ key: el.getAttribute(iconAttr()), kind: "icon" });
    });
    Array.prototype.forEach.call(styleEls(), function (el) {
      out.push({ key: el.getAttribute(styleAttr()), kind: "style" });
    });
    return out;
  }

  function setDraftText(lang, key, html) {
    LE.draft[lang] = LE.draft[lang] || {};
    LE.draft[lang][key] = maybeSanitize(html);
    applyText();
  }
  LE.setDraftText = setDraftText;

  /* ---------------- auto-editable mode ----------------
     When config.autoEditable is on, Inkwell marks common content elements as
     editable automatically (no data-* attributes in the source). Keys are a
     stable hash of each element's DOM path, so edits map back to the same spot
     on reload. This removes the only manual install step for simple sites. */
  var AUTO_TEXT_SEL = "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,a,button";
  function inkOwn(el) {
    return el.closest && el.closest(".ink-bar,.ink-launch,.ink-modal,.ink-emoji,.ink-toast,.ink-photo-tools,.ink-pdf-tools,.ink-item-tools");
  }
  function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) { h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0; }
    return h.toString(36);
  }
  function domPath(el) {
    var parts = [], node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      if (node.id) { parts.unshift("#" + node.id); break; }
      var idx = 1, sib = node;
      while ((sib = sib.previousElementSibling)) { if (sib.tagName === node.tagName) idx++; }
      parts.unshift(node.tagName.toLowerCase() + ":" + idx);
      node = node.parentNode;
    }
    return parts.join(">");
  }
  function autoHasText(el) {
    var t = (el.textContent || "").trim();
    return t.length > 0 && t.length < 2000;
  }
  function autoMark() {
    if (!cfg().autoEditable) return;
    var ea = editAttr(), pa = photoAttr(), la = linkAttr();
    Array.prototype.forEach.call(document.querySelectorAll("img"), function (img) {
      if (inkOwn(img) || img.hasAttribute(pa) || !img.getAttribute("src")) return;
      img.setAttribute(pa, "auto." + hashStr(domPath(img) + "|img"));
    });
    Array.prototype.forEach.call(document.querySelectorAll(AUTO_TEXT_SEL), function (el) {
      if (inkOwn(el)) return;
      var tag = el.tagName.toLowerCase();
      var key = "auto." + hashStr(domPath(el) + "|" + tag);
      if (tag === "a" || tag === "button") {
        if (tag === "a" && el.getAttribute("href") && !el.hasAttribute(la)) el.setAttribute(la, key);
        // editable label only when the control is a plain-text leaf
        if (!el.querySelector("*") && autoHasText(el) && !el.hasAttribute(ea)) el.setAttribute(ea, key);
        return;
      }
      // text blocks: only mark leaves (skip containers that hold other text blocks)
      if (el.querySelector(AUTO_TEXT_SEL)) return;
      if (!autoHasText(el) || el.hasAttribute(ea)) return;
      el.setAttribute(ea, key);
    });
  }
  LE.autoMark = autoMark;

  /* ---------------- init ---------------- */
  LE.init = function (options) {
    LE.config = Object.assign({}, LE.config, options || {});
    autoMark();
    captureStructure();
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
