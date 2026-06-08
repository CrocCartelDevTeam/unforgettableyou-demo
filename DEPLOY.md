# Deploy & Publishing Setup

The site is static HTML/CSS/JS plus a small serverless API (`/api`) that lets the
owners edit the page inline and **publish** changes live. Publishing commits the
edits to this repo via the GitHub API, which triggers an automatic redeploy.

## Recommended host: Vercel (private repo)

Vercel deploys private repos for free, runs the `/api` functions, and gives
automatic HTTPS + custom domains. (Netlify works the same way if preferred.)

### 1. Create the project
1. Push this repo to GitHub (can be **private**).
2. In Vercel: **Add New → Project → Import** this repo. Framework preset: **Other**.
   No build command; output is the repo root.
3. Deploy. You'll get a `*.vercel.app` URL.

### 2. Add the custom domain
- Vercel → Project → **Settings → Domains** → add `unforgettableyou.com`.
- Point the domain's DNS at Vercel (A / CNAME records Vercel shows). HTTPS is automatic.

### 3. Environment variables (Settings → Environment Variables)

| Variable | Required | Purpose |
|---|---|---|
| `UY_SESSION_SECRET` | ✅ | Long random string used to sign login sessions. |
| `UY_GH_TOKEN` | ✅ | GitHub token with **contents: read/write** on this repo (use a fine-grained PAT scoped to just this repo). |
| `UY_GH_REPO` | ✅ | `owner/name` of this repo, e.g. `CrocCartelDevTeam/unforgettableyou`. |
| `UY_GH_BRANCH` | optional | Defaults to `main`. |
| `UY_USERS` | ✅ | JSON array of editor accounts (see below). |
| `UY_SITE_URL` | optional | e.g. `https://unforgettableyou.com` — used to build magic-link URLs. Falls back to the request host. |
| `UY_RESEND_API_KEY` | optional | Enables magic-link email (via [Resend](https://resend.com)). |
| `UY_EMAIL_FROM` | optional | e.g. `Unforgettable You <hello@unforgettableyou.com>`. |

> Important: connect the Vercel project to the GitHub repo so a publish (commit)
> auto-redeploys. The function commits to GitHub; Vercel rebuilds within ~1 minute.

### 4. Create the editor accounts

Generate one entry per editor:

```bash
node tools/make-user.mjs racheli racheli@example.com "her-password"
node tools/make-user.mjs zvika   zvika@example.com   "his-password"
```

Put both objects into the `UY_USERS` array, e.g.:

```
UY_USERS=[{"username":"racheli","email":"...","salt":"...","hash":"..."},{"username":"zvika","email":"...","salt":"...","hash":"..."}]
```

## How publishing works

The site uses **Inkwell** (our live-editing platform) as its editor. On a static
preview (e.g. GitHub Pages) it runs in preview mode — edits stay in the browser.
Once on Vercel with the env below, publishing goes live:

1. Owner clicks **Edit your story** (bottom-right) → makes edits → **Publish**.
2. They sign in (username/password, or a magic email link).
3. `/api/publish` validates the session and commits:
   - `content/overrides.json` — edited text (English + Hebrew)
   - `content/photos.json` — photo map
   - `uploads/…` — any newly uploaded images
4. Vercel redeploys; `i18n.js` loads the committed `content/*.json` and shows the
   edits to all visitors (~1 minute).
5. Every edit is a git commit → full version history / easy rollback.

### What publishes live today vs. later
- **Live now (Stage 1):** editing and publishing **text** (EN/HE) and **photos** —
  the couple's day-to-day needs. This loop is fully wired.
- **Stage 2 (recommended next):** swap the hand-built `/api` for **Inkwell's full
  server** so the editor's richer features also persist — styling/fonts, PDFs,
  self-hosted video/audio, video embeds, and **version history / restore**
  (`/api/history`, `/api/revert`). Until then those extras work in the editor but
  aren't saved on Publish, and the History button is hidden/no-op.
- **Stage 3 (as the content grows):** split the long memoir into real pages
  (His Story, Her Story, Travel Diary, Photo Album, per-chapter pages) with shared
  nav/footer — see the roadmap below.

## Launch stages

1. **Go live (Stage 1).** Import to Vercel, add env vars, point the domain. The
   site is live; the owners can edit text + photos and publish.
2. **Full editor (Stage 2).** Vendor Inkwell's server into `/api` so every editor
   feature persists, plus version history. No visible change for visitors.
3. **Multi-page (Stage 3).** As the customer's material lands, break content into
   pages with a shared layout and a generated menu. Inkwell edits each page in place.

## Notes
- On hosts without the API (e.g. a GitHub Pages preview), editing still works
  locally (edits stay in the browser); the **Publish** button explains that
  publishing turns on once the site is on Vercel.
- Photos are stored in the repo under `uploads/`. For very photo-heavy use, switch
  to a blob store (Vercel Blob / Cloudflare R2) later — the publish function is the
  only place that would change.
