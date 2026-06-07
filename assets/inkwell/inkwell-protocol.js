/* =========================================================
   @inkwell/protocol
   The single source of truth shared by the editor (browser),
   the studio app (browser), and the server (Node):
     - which HTML tags/attributes editors may produce
     - content-key + language validation rules
     - image limits + allowed types
     - the publish payload schema (validated on BOTH ends)
     - the studio <-> page postMessage message types
   UMD: attaches window.InkwellProtocol in the browser and
   exports via module.exports in Node.
   ========================================================= */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.InkwellProtocol = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = 1;

  /* Inline formatting only. No block/structure, no media, no scripts.
     Photos go through the dedicated photo flow, never pasted HTML. */
  var ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "s", "br", "a", "span"];
  var ALLOWED_HREF_PROTOCOLS = ["http:", "https:", "mailto:", "tel:"];

  var IMAGE_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif"
  };

  // PDFs are a dedicated binary asset flow (uploads/*.pdf + content/pdfs.json),
  // rendered as a safe document card/link. We NEVER add iframe/embed/object to
  // the HTML sanitizer.
  var PDF_MIME = "application/pdf";

  // Self-hosted media. Like images/PDFs, the declared MIME/extension is never
  // trusted server-side; the real type is sniffed from magic bytes. The runtime
  // renders these with <video>/<audio> built via DOM APIs (never the HTML
  // sanitizer), so they can't widen the XSS surface.
  var VIDEO_MIME = {
    "video/mp4": "mp4",
    "video/webm": "webm"
  };
  var AUDIO_MIME = {
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/wav": "wav"
  };

  /* ---------------- video embeds (YouTube / Vimeo) ----------------
     We store ONLY a validated URL. The runtime canonicalizes it through the
     SAME parseEmbed() below and renders a click-to-load, sandboxed iframe for an
     allow-listed host. No arbitrary HTML or hosts are ever accepted, so this
     cannot become an injection vector. */
  var EMBED_HOSTS = [
    "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
    "youtube-nocookie.com", "www.youtube-nocookie.com",
    "vimeo.com", "www.vimeo.com", "player.vimeo.com"
  ];
  function embedIdOk(id) { return typeof id === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(id); }
  // Returns { provider:"youtube"|"vimeo", id } or null. Single source of truth
  // used by BOTH the server (validation) and the runtime (rendering).
  function parseEmbed(s) {
    if (typeof s !== "string" || !s) return null;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== "https:") return null;
    var h = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (h === "youtu.be") {
      var id = u.pathname.replace(/^\/+/, "").split("/")[0];
      return embedIdOk(id) ? { provider: "youtube", id: id } : null;
    }
    if (h === "youtube.com" || h === "youtube-nocookie.com") {
      if (u.pathname === "/watch") {
        var v = u.searchParams.get("v");
        return embedIdOk(v) ? { provider: "youtube", id: v } : null;
      }
      var m = u.pathname.match(/^\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{6,20})/);
      return m ? { provider: "youtube", id: m[1] } : null;
    }
    if (h === "vimeo.com") {
      var mv = u.pathname.match(/^\/(?:video\/)?(\d{6,12})/);
      return mv ? { provider: "vimeo", id: mv[1] } : null;
    }
    if (h === "player.vimeo.com") {
      var mp = u.pathname.match(/^\/video\/(\d{6,12})/);
      return mp ? { provider: "vimeo", id: mp[1] } : null;
    }
    return null;
  }
  function validEmbedUrl(v) {
    if (typeof v !== "string") return false;
    if (v === "") return true; // empty clears the embed
    if (v.length > 500) return false;
    return !!parseEmbed(v);
  }

  /* Scroll-reveal animation presets. Stored as a key -> presetId map (never as
     HTML/CSS), so this can NEVER widen the XSS surface. The runtime maps each id
     to a fixed CSS class it ships itself. "none" means no animation. */
  var ANIMATION_PRESETS = ["none", "fade", "fade-up", "fade-down", "zoom", "slide-left", "slide-right"];

  /* ---------------- visual editing: links, icons, styles ----------------
     All three are stored as plain key -> value(s) maps (never HTML), validated
     here and re-checked server-side. None of them are ever injected as innerHTML:
     - links  -> set as an <a href> (scheme allowlisted, like an <a> in text)
     - icons  -> set via textContent only (so it can never be markup)
     - styles -> applied one property at a time via CSSOM, each prop+value passing
       a strict allowlist (no url(), no expression, no ; etc). */

  // Inline styles editors may set. Each maps to a value-type validator below.
  // Deliberately NO `display`, `position`, `background-image`/`url()` etc.
  var STYLE_PROPS = {
    "color": "color",
    "background-color": "color",
    "border-color": "color",
    "font-family": "fontFamily",
    "font-size": "len",
    "font-weight": "weight",
    "font-style": "fontStyle",
    "line-height": "lenOrNum",
    "letter-spacing": "len",
    "text-align": "align",
    "text-transform": "transform",
    "border-width": "len",
    "border-style": "borderStyle",
    "border-radius": "lens",
    "padding": "lens",
    "margin": "lens",
    "width": "lenOrAuto",
    "height": "lenOrAuto",
    "max-width": "lenOrAuto",
    "min-height": "lenOrAuto",
    "opacity": "opacity"
  };

  /* Font family is restricted to a curated allow-list of WEB-SAFE stacks (all
     locally available - no external font loading, no network calls). The stored
     value must match one of these EXACTLY, so a crafted font-family string can
     never inject anything. Each stack is kept short (well under the 64-char
     per-value cap in validStyleValue). { label } is for the editor dropdown. */
  var FONT_FAMILIES = [
    { label: "System", value: "system-ui, -apple-system, sans-serif" },
    { label: "Helvetica / Arial", value: "Helvetica, Arial, sans-serif" },
    { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
    { label: "Tahoma", value: "Tahoma, Verdana, sans-serif" },
    { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
    { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
    { label: "Times", value: "'Times New Roman', Times, serif" },
    { label: "Palatino", value: "'Palatino Linotype', Palatino, serif" },
    { label: "Garamond", value: "Garamond, Georgia, serif" },
    { label: "Courier", value: "'Courier New', Courier, monospace" },
    { label: "Monospace", value: "ui-monospace, Menlo, Consolas, monospace" }
  ];
  var FONT_FAMILY_VALUES = FONT_FAMILIES.map(function (f) { return f.value; });

  var NAMED_COLORS = [
    "transparent", "currentcolor", "inherit", "black", "white", "red", "green", "blue",
    "yellow", "orange", "purple", "pink", "gray", "grey", "silver", "gold", "navy",
    "teal", "maroon", "olive", "lime", "aqua", "fuchsia"
  ];
  var RE_HEX = /^#[0-9a-fA-F]{3,8}$/;
  var RE_RGBHSL = /^(rgb|rgba|hsl|hsla)\(\s*[0-9.,%\/\sdeg]+\)$/i;
  var RE_LEN = /^-?\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|pt)$/;
  var RE_NUM = /^-?\d+(\.\d+)?$/;
  var RE_LENS = /^(-?\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|pt)|0)(\s+(-?\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|pt)|0)){0,3}$/;
  // Links may be a fragment, a same-site path, or an absolute allowlisted scheme.
  var LINK_SCHEME_RE = /^(https?:|mailto:|tel:)/i;

  function validColor(v) {
    if (RE_HEX.test(v)) return true;
    if (RE_RGBHSL.test(v)) return true;
    return NAMED_COLORS.indexOf(String(v).toLowerCase()) !== -1;
  }
  function validStyleValue(prop, v) {
    if (typeof v !== "string") return false;
    var s = v.trim();
    if (!s || s.length > 64) return false;
    // Hard stops against anything that could escape a single declaration.
    if (/[;{}<>]/.test(s) || /url\(/i.test(s) || /expression/i.test(s) || /\/\*/.test(s) || /javascript:/i.test(s)) return false;
    var type = STYLE_PROPS[prop];
    if (!type) return false;
    switch (type) {
      case "color": return validColor(s);
      case "fontFamily": return FONT_FAMILY_VALUES.indexOf(s) !== -1;
      case "len": return RE_LEN.test(s);
      case "lens": return RE_LENS.test(s);
      case "lenOrNum": return RE_LEN.test(s) || RE_NUM.test(s);
      case "lenOrAuto": return s === "auto" || RE_LEN.test(s);
      case "weight": return ["normal", "bold", "bolder", "lighter", "100", "200", "300", "400", "500", "600", "700", "800", "900"].indexOf(s) !== -1;
      case "fontStyle": return ["normal", "italic"].indexOf(s) !== -1;
      case "align": return ["left", "center", "right", "justify"].indexOf(s) !== -1;
      case "transform": return ["none", "uppercase", "lowercase", "capitalize"].indexOf(s) !== -1;
      case "borderStyle": return ["none", "solid", "dashed", "dotted", "double"].indexOf(s) !== -1;
      case "opacity": return RE_NUM.test(s) && parseFloat(s) >= 0 && parseFloat(s) <= 1;
      default: return false;
    }
  }
  function validStyleMap(m) {
    if (!isObj(m)) return false;
    var props = Object.keys(m);
    if (props.length > 24) return false;
    for (var i = 0; i < props.length; i++) {
      if (!STYLE_PROPS.hasOwnProperty(props[i])) return false;
      if (!validStyleValue(props[i], m[props[i]])) return false;
    }
    return true;
  }
  function validLinkValue(v) {
    if (typeof v !== "string") return false;
    var s = v.trim();
    if (!s || s.length > 2048) return false;
    if (/[<>"]/.test(s) || /\s/.test(s)) return false;
    if (s.indexOf("//") === 0) return false;                     // reject protocol-relative
    if (s.charAt(0) === "/" || s.charAt(0) === "#") return true; // same-site path / fragment
    if (LINK_SCHEME_RE.test(s)) return true;                      // http(s)/mailto/tel
    return false;                                                 // reject javascript:, data:, protocol-relative, bare
  }
  // Icons are applied with textContent (never markup). Cap length and reject
  // control chars; otherwise any short plain string (emoji or a word) is fine.
  function validIcon(v) {
    if (typeof v !== "string") return false;
    if (v.length > 24) return false;
    return !/[\u0000-\u001f]/.test(v);
  }

  /* ---------------- structure (repeatable cards) ----------------
     Structure is ONLY an ordered list of item-ids per list-key. It carries no
     HTML and no styling: the runtime clones the author's own template markup and
     fills each clone from the normal text/photo/etc maps (under namespaced keys).
     So this can't widen the XSS surface — ids are just key segments. */
  var STRUCTURE_LIMITS = { maxItems: 200, maxLists: 200 };
  var ITEMID_RE = /^[a-zA-Z0-9_-]{1,40}$/;
  function validItemId(s) { return typeof s === "string" && ITEMID_RE.test(s); }
  function validStructureMap(m) {
    if (!isObj(m)) return false;
    var lists = Object.keys(m);
    if (lists.length > STRUCTURE_LIMITS.maxLists) return false;
    for (var i = 0; i < lists.length; i++) {
      if (!validKey(lists[i])) return false;
      var entry = m[lists[i]];
      if (!isObj(entry) || !Array.isArray(entry.items)) return false;
      if (entry.items.length > STRUCTURE_LIMITS.maxItems) return false;
      for (var j = 0; j < entry.items.length; j++) {
        if (!validItemId(entry.items[j])) return false;
      }
    }
    return true;
  }

  /* ---------------- SEO (per-page title + description) ----------------
     Plain text only. Title/description become a <title> and <meta>, never HTML.
     Keys are page paths (we validate them as path-like strings). */
  var SEO_LIMITS = { titleMax: 200, descMax: 320, maxPages: 500 };
  var SEO_PATH_RE = /^\/[a-zA-Z0-9/_.-]{0,200}$|^\/$/;
  function validSeoPath(s) { return typeof s === "string" && s.indexOf("..") === -1 && SEO_PATH_RE.test(s); }
  function validSeoEntry(e) {
    if (!isObj(e)) return false;
    if (e.title != null && (typeof e.title !== "string" || e.title.length > SEO_LIMITS.titleMax || /[\u0000-\u001f]/.test(e.title))) return false;
    if (e.description != null && (typeof e.description !== "string" || e.description.length > SEO_LIMITS.descMax || /[\u0000-\u0009\u000b\u000c\u000e-\u001f]/.test(e.description))) return false;
    return true;
  }
  function validSeoMap(m) {
    if (!isObj(m)) return false;
    var keys = Object.keys(m);
    if (keys.length > SEO_LIMITS.maxPages) return false;
    for (var i = 0; i < keys.length; i++) {
      if (!validSeoPath(keys[i])) return false;
      if (!validSeoEntry(m[keys[i]])) return false;
    }
    return true;
  }

  /* ---------------- image alt text ----------------
     A flat key -> string map (photo key -> alt). Plain text, length-capped. */
  var ALT_MAX = 250;
  function validAltValue(v) { return typeof v === "string" && v.length <= ALT_MAX && !/[\u0000-\u001f]/.test(v); }
  function validAltsMap(m) {
    if (!isObj(m)) return false;
    var keys = Object.keys(m);
    for (var i = 0; i < keys.length; i++) {
      if (!validKey(keys[i])) return false;
      if (!validAltValue(m[keys[i]])) return false;
    }
    return true;
  }

  var LIMITS = {
    imageBytes: 4 * 1024 * 1024,   // 4 MB per image (before base64 inflation)
    pdfBytes: 8 * 1024 * 1024,     // 8 MB per PDF (before base64 inflation)
    audioBytes: 10 * 1024 * 1024,  // 10 MB per audio file (before base64 inflation)
    videoBytes: 16 * 1024 * 1024,  // 16 MB per self-hosted video (keep clips short)
    publishBytes: 48 * 1024 * 1024, // total decoded publish payload cap
    valueMax: 200000,               // max chars per text value
    keyMax: 200
  };

  // Keys are author-defined and become file/JSON paths, so keep them strict.
  // No ":" (Windows alternate-data-stream / illegal filename char) and no ".."
  // (enforced in validKey) so keys are always safe path segments.
  var KEY_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9_.-]{0,198}[a-zA-Z0-9])?$/;
  var LANG_RE = /^[a-zA-Z][a-zA-Z0-9-]{0,15}$/;
  // Markdown-page slugs become URL + file path segments, so keep them strict:
  // lowercase alnum words joined by single hyphens (no dots, no slashes, no "..").
  var SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var PAGE_LIMITS = { titleMax: 200, markdownMax: 200000 };

  /* Studio <-> framed page message protocol. Every message also carries
     { v: VERSION }. Receivers MUST validate event.origin against an
     allowlist and ignore unknown/unversioned messages. */
  var MSG = {
    HELLO: "le:hello",            // studio -> page: handshake (with a challenge)
    READY: "le:ready",            // page -> studio: handshake ack + page meta
    ENABLE: "le:enable",          // studio -> page: { on: bool }
    SET_TEXT: "le:setText",       // studio -> page: { key, lang, html } live preview
    SET_PHOTO: "le:setPhoto",     // studio -> page: { key, dataUrl }
    REMOVE_PHOTO: "le:removePhoto", // studio -> page: { key }
    SET_PDF: "le:setPdf",         // studio -> page: { key, dataUrl }
    REMOVE_PDF: "le:removePdf",   // studio -> page: { key }
    SET_VIDEO: "le:setVideo",     // studio -> page: { key, dataUrl }
    REMOVE_VIDEO: "le:removeVideo", // studio -> page: { key }
    SET_AUDIO: "le:setAudio",     // studio -> page: { key, dataUrl }
    REMOVE_AUDIO: "le:removeAudio", // studio -> page: { key }
    SET_EMBED: "le:setEmbed",     // studio -> page: { key, url }
    SET_ANIM: "le:setAnim",       // studio -> page: { key, preset } live preview
    SET_LINK: "le:setLink",       // studio -> page: { key, href }
    SET_ICON: "le:setIcon",       // studio -> page: { key, icon }
    SET_STYLE: "le:setStyle",     // studio -> page: { key, style }  (full prop map)
    SET_STRUCTURE: "le:setStructure", // studio -> page: { key, items }
    SET_SEO: "le:setSeo",         // studio -> page: { key, seo }
    SET_ALT: "le:setAlt",         // studio -> page: { key, alt }
    SELECT: "le:select",          // page -> studio: { key, kind, rect, value }
    EDIT: "le:edit",              // page -> studio: { key, lang, html }
    PHOTO: "le:photo",            // page -> studio: { key, dataUrl|null }
    DRAFT: "le:draft",            // page -> studio: { text, photos }
    REQUEST_DRAFT: "le:requestDraft" // studio -> page: ask for full snapshot
  };

  function isObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
  function validKey(k) { return typeof k === "string" && k.indexOf("..") === -1 && KEY_RE.test(k); }
  function validLang(l) { return typeof l === "string" && LANG_RE.test(l); }
  function validAnimation(a) { return typeof a === "string" && ANIMATION_PRESETS.indexOf(a) !== -1; }
  function validSlug(s) { return typeof s === "string" && s.length <= 64 && s.indexOf("..") === -1 && SLUG_RE.test(s); }

  function fail(m) { return { ok: false, error: m }; }

  /**
   * Validate (and shallow-normalize) a publish payload.
   * Shape: { text: { [lang]: { [key]: htmlString } }, photos: { [key]: dataUrlOrPath } }
   * NOTE: this checks STRUCTURE only. HTML is sanitized separately, server-side.
   */
  function validatePublishPayload(p) {
    if (!isObj(p)) return fail("payload must be an object");
    var text = isObj(p.text) ? p.text : (p.text == null ? {} : null);
    var photos = isObj(p.photos) ? p.photos : (p.photos == null ? {} : null);
    var pdfs = isObj(p.pdfs) ? p.pdfs : (p.pdfs == null ? {} : null);
    var videos = isObj(p.videos) ? p.videos : (p.videos == null ? {} : null);
    var audios = isObj(p.audios) ? p.audios : (p.audios == null ? {} : null);
    var embeds = isObj(p.embeds) ? p.embeds : (p.embeds == null ? {} : null);
    var pages = isObj(p.pages) ? p.pages : (p.pages == null ? {} : null);
    var animations = isObj(p.animations) ? p.animations : (p.animations == null ? {} : null);
    var links = isObj(p.links) ? p.links : (p.links == null ? {} : null);
    var icons = isObj(p.icons) ? p.icons : (p.icons == null ? {} : null);
    var styles = isObj(p.styles) ? p.styles : (p.styles == null ? {} : null);
    var structure = isObj(p.structure) ? p.structure : (p.structure == null ? {} : null);
    var seo = isObj(p.seo) ? p.seo : (p.seo == null ? {} : null);
    var alts = isObj(p.alts) ? p.alts : (p.alts == null ? {} : null);
    if (text === null) return fail("text must be an object");
    if (photos === null) return fail("photos must be an object");
    if (pdfs === null) return fail("pdfs must be an object");
    if (videos === null) return fail("videos must be an object");
    if (audios === null) return fail("audios must be an object");
    if (embeds === null) return fail("embeds must be an object");
    if (pages === null) return fail("pages must be an object");
    if (animations === null) return fail("animations must be an object");
    if (links === null) return fail("links must be an object");
    if (icons === null) return fail("icons must be an object");
    if (styles === null) return fail("styles must be an object");
    if (structure === null) return fail("structure must be an object");
    if (seo === null) return fail("seo must be an object");
    if (alts === null) return fail("alts must be an object");

    var totalBytes = 0;
    var langs = Object.keys(text);
    for (var i = 0; i < langs.length; i++) {
      var lang = langs[i];
      if (!validLang(lang)) return fail("invalid language code");
      var map = text[lang];
      if (!isObj(map)) return fail("text[" + lang + "] must be an object");
      var keys = Object.keys(map);
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        if (!validKey(k)) return fail("invalid content key");
        if (typeof map[k] !== "string") return fail("text value must be a string");
        if (map[k].length > LIMITS.valueMax) return fail("text value too long");
        totalBytes += map[k].length;
      }
    }

    var pkeys = Object.keys(photos);
    for (var a = 0; a < pkeys.length; a++) {
      var pk = pkeys[a];
      if (!validKey(pk)) return fail("invalid photo key");
      if (typeof photos[pk] !== "string") return fail("photo value must be a string");
      totalBytes += photos[pk].length * 0.75; // rough decoded estimate
    }

    var dkeys = Object.keys(pdfs);
    for (var d = 0; d < dkeys.length; d++) {
      var dk = dkeys[d];
      if (!validKey(dk)) return fail("invalid pdf key");
      if (typeof pdfs[dk] !== "string") return fail("pdf value must be a string");
      totalBytes += pdfs[dk].length * 0.75; // rough decoded estimate
    }

    var vkeys = Object.keys(videos);
    for (var vv = 0; vv < vkeys.length; vv++) {
      var vk = vkeys[vv];
      if (!validKey(vk)) return fail("invalid video key");
      if (typeof videos[vk] !== "string") return fail("video value must be a string");
      totalBytes += videos[vk].length * 0.75; // rough decoded estimate
    }

    var aukeys = Object.keys(audios);
    for (var au = 0; au < aukeys.length; au++) {
      var auk = aukeys[au];
      if (!validKey(auk)) return fail("invalid audio key");
      if (typeof audios[auk] !== "string") return fail("audio value must be a string");
      totalBytes += audios[auk].length * 0.75; // rough decoded estimate
    }
    if (totalBytes > LIMITS.publishBytes) return fail("publish payload too large");

    var ekeys = Object.keys(embeds);
    for (var ee = 0; ee < ekeys.length; ee++) {
      if (!validKey(ekeys[ee])) return fail("invalid embed key");
      if (!validEmbedUrl(embeds[ekeys[ee]])) return fail("invalid embed URL");
    }

    var akeys = Object.keys(animations);
    for (var b = 0; b < akeys.length; b++) {
      var ak = akeys[b];
      if (!validKey(ak)) return fail("invalid animation key");
      if (!validAnimation(animations[ak])) return fail("invalid animation preset");
    }

    var lkeys = Object.keys(links);
    for (var lk = 0; lk < lkeys.length; lk++) {
      if (!validKey(lkeys[lk])) return fail("invalid link key");
      if (!validLinkValue(links[lkeys[lk]])) return fail("invalid link URL");
    }

    var ikeys = Object.keys(icons);
    for (var ik = 0; ik < ikeys.length; ik++) {
      if (!validKey(ikeys[ik])) return fail("invalid icon key");
      if (!validIcon(icons[ikeys[ik]])) return fail("invalid icon");
    }

    var skeys = Object.keys(styles);
    for (var sk = 0; sk < skeys.length; sk++) {
      if (!validKey(skeys[sk])) return fail("invalid style key");
      if (!validStyleMap(styles[skeys[sk]])) return fail("invalid style");
    }

    if (!validStructureMap(structure)) return fail("invalid structure");
    if (!validSeoMap(seo)) return fail("invalid seo");
    if (!validAltsMap(alts)) return fail("invalid alts");

    var gkeys = Object.keys(pages);
    for (var g = 0; g < gkeys.length; g++) {
      var slug = gkeys[g];
      if (!validSlug(slug)) return fail("invalid page slug");
      var pg = pages[slug];
      if (!isObj(pg)) return fail("page must be an object");
      if (typeof pg.title !== "string" || pg.title.length > PAGE_LIMITS.titleMax) return fail("invalid page title");
      if (typeof pg.markdown !== "string" || pg.markdown.length > PAGE_LIMITS.markdownMax) return fail("invalid page markdown");
    }

    return { ok: true, value: { text: text, photos: photos, pdfs: pdfs, videos: videos, audios: audios, embeds: embeds, pages: pages, animations: animations, links: links, icons: icons, styles: styles, structure: structure, seo: seo, alts: alts } };
  }

  return {
    VERSION: VERSION,
    ALLOWED_TAGS: ALLOWED_TAGS,
    ALLOWED_HREF_PROTOCOLS: ALLOWED_HREF_PROTOCOLS,
    IMAGE_MIME: IMAGE_MIME,
    PDF_MIME: PDF_MIME,
    VIDEO_MIME: VIDEO_MIME,
    AUDIO_MIME: AUDIO_MIME,
    EMBED_HOSTS: EMBED_HOSTS,
    parseEmbed: parseEmbed,
    validEmbedUrl: validEmbedUrl,
    ANIMATION_PRESETS: ANIMATION_PRESETS,
    STYLE_PROPS: STYLE_PROPS,
    FONT_FAMILIES: FONT_FAMILIES,
    LIMITS: LIMITS,
    PAGE_LIMITS: PAGE_LIMITS,
    KEY_RE: KEY_RE,
    LANG_RE: LANG_RE,
    SLUG_RE: SLUG_RE,
    MSG: MSG,
    isObj: isObj,
    validKey: validKey,
    validLang: validLang,
    validAnimation: validAnimation,
    validSlug: validSlug,
    validColor: validColor,
    validStyleValue: validStyleValue,
    validStyleMap: validStyleMap,
    validLinkValue: validLinkValue,
    validIcon: validIcon,
    validItemId: validItemId,
    validStructureMap: validStructureMap,
    STRUCTURE_LIMITS: STRUCTURE_LIMITS,
    SEO_LIMITS: SEO_LIMITS,
    validSeoPath: validSeoPath,
    validSeoEntry: validSeoEntry,
    validSeoMap: validSeoMap,
    ALT_MAX: ALT_MAX,
    validAltValue: validAltValue,
    validAltsMap: validAltsMap,
    validatePublishPayload: validatePublishPayload
  };
});
