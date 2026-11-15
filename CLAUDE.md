# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal portfolio site built with Astro 5 (static output, no UI framework integrations), served at https://04klin.github.io.

## Commands

```sh
npm install          # install dependencies (npm is the only package manager; no yarn.lock)
npm run dev          # dev server at http://localhost:4321
npm run build        # astro check (type + schema check), then static build into dist/
npm run preview      # serve the built dist/ locally
npx astro check      # type check only
npx prettier --write src   # format (prettier-plugin-astro handles .astro files)
```

There are no tests and no lint script. `npm run build` is the correctness check: it fails on type errors, on content that does not match its schema, and on missing imported images.

## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which runs the build with `withastro/action` and publishes to GitHub Pages. There is no staging step: a commit on `main` is a production deploy.

## Architecture

The site separates content, structure and styling so that each can change alone (a theme change should touch only the layout, components and CSS).

**Layout.** Every page wraps its content in `src/layouts/Layout.astro`, which owns the `<head>`, the fixed backdrop, the top bar (`SiteHeader.astro`), the `<main class="page">` column and the footer (`SiteFooter.astro`). Props: `current` (which nav link to highlight), optional `heading` and optional `lead`. With `heading`, the layout renders the `<h1>`, the `lead` line under it and a `"<heading> | Kevin Lin"` title; without it (home page only) the slot is rendered bare.

**Navigation and contact details.** `src/site.ts` exports `navItems`, the single source for the top bar links, and `contact` (email, GitHub, resume path), used by the home page and the footer. The `NavKey` type is derived from `navItems`, so `current` is type-checked.

**Adding a page:** create `src/pages/<name>.astro` using `<Layout current="..." heading="...">`, add an entry to `navItems`, and optionally add a section for it to the home page in `index.astro`.

**Home page.** `index.astro` is generated from content where it can be: the project cards and the scrolling technology strip come from the projects collection (the first `WIDE_CARDS` projects get a wide card showing their first `desc` line; every card links to `/projects#<id>`). The typed line cycles through `phrases`, and the photo pile (`stack`) and the photography collage use hand-picked imports.

**Content collections.** Projects are a YAML list in `src/content/projects.yaml`, with the schema in `src/content.config.ts`. Each entry needs a unique `id` and an `order` number, and may have a `status` (shown as a badge, e.g. "In progress"); the page sorts by `order` because collection order is not guaranteed. To add a project, add an entry to the YAML file. `Project.astro` takes an entry's `data` as props, typed from the schema.

**Images.** Photos live in `src/assets/photography/` at full camera resolution and are imported in `photography.astro`. Astro generates the WebP thumbnails (`<Image>`) and a 2400px lightbox version (`getImage`) at build time, so do not add hand-made thumbnails. The page is a dated feed: `allPosts` in its frontmatter lists posts (`title`, `date` as `"YYYY-MM"` or `"YYYY"`, optional `text`, `photos`, and `link` to an external album), sorted newest first automatically. One photo renders full width, several render as a two-column grid; clicking any photo opens the lightbox, which steps through every photo on the page. Icons, the profile picture, PDFs and the poster stay in `public/assets/` and are referenced by absolute path (`/assets/...`); those paths are not checked at build time.

**Styling.** One global stylesheet at `public/assets/styles.css`, hand-written (the old Webflow export is gone). Design tokens (colours, fonts, radius, page width) are custom properties on `:root` at the top; change the look there first. Components and pages carry no scoped styles; they use the global classes (`button`, `chip`, `card`, `section`, `mini-label`, ...). Fonts (IBM Plex Sans and IBM Plex Mono) are loaded from Google Fonts in the layout's `<head>`.

**Motion.** `src/scripts/motion.ts` holds the shared effects, wired up in `Layout.astro`: elements with `data-reveal` fade in when scrolled into view (the attribute is removed afterwards), elements with `data-glow` get a cursor glow and tilt, and the backdrop glow follows the cursor. All animation CSS sits in the `prefers-reduced-motion: no-preference` block at the end of the stylesheet, and content must stay visible without JavaScript (see the `<noscript>` rule in the layout).

**Client scripts and view transitions.** `<ClientRouter />` is enabled, so navigation swaps the DOM without a full reload and module scripts run only once. Any script that attaches listeners to page elements must do so inside an `astro:page-load` listener, as the layout's motion setup, the home page typing effect and the photography lightbox do. The backdrop uses `transition:persist` so its animation continues across pages, and the nav highlight (`.nav-pill`) has a `view-transition-name` so it slides between links.
