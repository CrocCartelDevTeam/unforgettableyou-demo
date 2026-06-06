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

  var LIMITS = {
    imageBytes: 4 * 1024 * 1024,   // 4 MB per image (before base64 inflation)
    publishBytes: 12 * 1024 * 1024, // total decoded publish payload cap
    valueMax: 200000,               // max chars per text value
    keyMax: 200
  };

  // Keys are author-defined and become file/JSON paths, so keep them strict.
  // No ":" (Windows alternate-data-stream / illegal filename char) and no ".."
  // (enforced in validKey) so keys are always safe path segments.
  var KEY_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9_.-]{0,198}[a-zA-Z0-9])?$/;
  var LANG_RE = /^[a-zA-Z][a-zA-Z0-9-]{0,15}$/;

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
    SELECT: "le:select",          // page -> studio: { key, kind, rect, value }
    EDIT: "le:edit",              // page -> studio: { key, lang, html }
    PHOTO: "le:photo",            // page -> studio: { key, dataUrl|null }
    DRAFT: "le:draft",            // page -> studio: { text, photos }
    REQUEST_DRAFT: "le:requestDraft" // studio -> page: ask for full snapshot
  };

  function isObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
  function validKey(k) { return typeof k === "string" && k.indexOf("..") === -1 && KEY_RE.test(k); }
  function validLang(l) { return typeof l === "string" && LANG_RE.test(l); }

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
    if (text === null) return fail("text must be an object");
    if (photos === null) return fail("photos must be an object");

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
    if (totalBytes > LIMITS.publishBytes) return fail("publish payload too large");

    return { ok: true, value: { text: text, photos: photos } };
  }

  return {
    VERSION: VERSION,
    ALLOWED_TAGS: ALLOWED_TAGS,
    ALLOWED_HREF_PROTOCOLS: ALLOWED_HREF_PROTOCOLS,
    IMAGE_MIME: IMAGE_MIME,
    LIMITS: LIMITS,
    KEY_RE: KEY_RE,
    LANG_RE: LANG_RE,
    MSG: MSG,
    isObj: isObj,
    validKey: validKey,
    validLang: validLang,
    validatePublishPayload: validatePublishPayload
  };
});
