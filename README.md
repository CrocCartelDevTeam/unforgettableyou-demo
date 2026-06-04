# Unforgettable You — Racheli & Zvika

A premium, bilingual digital memoir and love-story website. A timeless keepsake
that turns a family's memories into a beautiful, living experience designed to be
shared with generations to come.

This is a **client demo** built to showcase what a fully custom storytelling site
can look and feel like.

## Highlights

- **Cinematic WebGL hero** — a slow, flowing "golden nebula" shader in the brand
  palette, with gentle mouse parallax (graceful CSS fallback when WebGL is
  unavailable or reduced-motion is preferred).
- **Bilingual: English / עברית** — a one-tap language toggle with full
  right-to-left (RTL) layout, Hebrew typography, and a faithful translation of the
  entire site.
- **Emotional storytelling** — an elegant "How We Met" chapter, an interactive
  vertical timeline of milestones, and a chaptered memoir.
- **Photo gallery** — magazine-style grid with labelled frames ready for the
  family's real photographs.
- **Conversion-ready** — a "Preserve a Story" call-to-action and contact form to
  turn visitors into inquiries.
- **Fast & dependency-free** — hand-built HTML, CSS, and vanilla JS. No build step,
  no framework bloat. Fully responsive, with scroll-reveal animations and
  `prefers-reduced-motion` support.

## Structure

```
index.html              # Markup (semantic, i18n-tagged)
assets/css/styles.css   # Design system + responsive + RTL
assets/js/i18n.js       # EN / HE translation engine
assets/js/main.js       # Interactions + WebGL hero
vercel.json             # Static hosting config
```

## Run locally

Any static server works. For example:

```bash
python -m http.server 8777
# then open http://127.0.0.1:8777
```

## Deploy

Static site — deploys instantly to Vercel:

```bash
npx vercel --prod
```

## Credits

Designed & built as a custom client showcase. Content adapted from the family's
own story.
