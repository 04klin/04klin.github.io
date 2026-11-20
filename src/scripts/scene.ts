/*
 * The background scene: the Settings app's choices, the shell's album
 * seasons and the walk.
 *
 * Three attributes on <html> describe the scene, and the CSS draws it:
 *   data-theme   "night" or "day". Follows the visitor's own clock (day
 *                from 7am to 7pm).
 *   data-season  "spring", "summer", "autumn" or "winter". Follows the date
 *                (northern hemisphere).
 *   data-scene   which landscape is shown. Picked at random on every page
 *                load and kept while the visitor moves between pages.
 *
 * All three can be changed in the Settings app (settings.ts). A choice lasts for
 * the visit only (sessionStorage, cleared when the tab is closed), so the
 * next visit follows the clock and the calendar again.
 *
 * The inline script in the layout's <head> sets all three before the first
 * paint and again after each view transition swap (which replaces the <html>
 * attributes), so the page never flashes the wrong scene.
 */

import { SEASONS, seasonOf, type Season } from "./seasons";

declare global {
  interface Window {
    /** The landscape of this page load (set in the layout's <head>). */
    __scene?: string;
  }
}

/** The landscapes in Backdrop.astro, as in the layout's inline script. */
export const SCENES = ["mountains", "river", "lake", "hills"] as const;

/** The three <html> attributes that describe the scene. */
export type ScenePart = "theme" | "season" | "scene";

const root = document.documentElement;

function save(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the change still shows.
  }
}

/** The visitor's own season: chosen in Settings, or today's. */
function ownSeason(): Season {
  let chosen: string | null = null;
  try {
    chosen = sessionStorage.getItem("season");
  } catch {
    // Storage unavailable; fall back to the date.
  }
  const now = new Date();
  return (
    SEASONS.find((s) => s === chosen) ??
    seasonOf(`${now.getFullYear()}-${now.getMonth() + 1}`)!
  );
}

/** The crossfade currently playing, if any. */
let running: ViewTransition | null = null;

/**
 * Applies a change to the theme or landscape. Where view
 * transitions are supported, the old scene crossfades into the new one.
 * Resolves once the change is fully shown.
 */
function changeScene(apply: () => void): Promise<void> {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // A change during a crossfade finishes that one at once and applies the
  // new change straight away. Starting a second transition would cut the
  // first one short and flash between scenes.
  if (!document.startViewTransition || reduced || running) {
    running?.skipTransition();
    apply();
    return Promise.resolve();
  }

  // The crossfade's timing is in the stylesheet, under .theme-switching.
  root.classList.add("theme-switching");
  const transition = document.startViewTransition(apply);
  running = transition;
  return transition.finished
    .catch(() => {})
    .finally(() => {
      running = null;
      root.classList.remove("theme-switching");
    });
}

/**
 * Applies a change of season. Unlike the other parts of the scene it does
 * not crossfade the whole page: the stylesheet glides the landscape's
 * colours to the new season's and fades the weather, so the page stays live
 * (clicks keep working, an album's grid shows at once). Resolves once the
 * change is fully shown.
 */
function changeSeason(season: string): Promise<void> {
  root.dataset.season = season;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return Promise.resolve();
  const fade = parseFloat(
    getComputedStyle(root).getPropertyValue("--season-fade"),
  );
  return new Promise((done) => setTimeout(done, (fade || 0) * 1000));
}

/**
 * The walk (see the stylesheet): on the home page, scrolling down passes the
 * time of day. The animation is paused and moved along here, through --walk:
 * 0 at the top, 1 at the bottom of the element marked data-walk-scroller
 * (the shell's terminal, which scrolls inside the window), or of the page if
 * there is none. Without content to scroll, it stays at 0.
 */
export function setupWalk() {
  let frame = 0;
  const update = () => {
    frame = 0;
    const scroller = document.querySelector<HTMLElement>(
      "[data-walk-scroller]",
    );
    const [top, max] = scroller
      ? [scroller.scrollTop, scroller.scrollHeight - scroller.clientHeight]
      : [window.scrollY, root.scrollHeight - window.innerHeight];
    const progress = max > 0 ? Math.min(1, top / max) : 0;
    root.style.setProperty("--walk", progress.toFixed(4));
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  // Scroll events from elements do not bubble; listening in the capture
  // phase catches the terminal's as well as the page's.
  document.addEventListener("scroll", schedule, {
    capture: true,
    passive: true,
  });
  window.addEventListener("resize", schedule);
  // Straight away, and after each view transition swap (which replaces the
  // <html> attributes, style included), so the sky never shows the wrong time.
  update();
  document.addEventListener("astro:page-load", update);
}

/** What a part of the scene is when nothing was chosen. */
function automatic(part: ScenePart): string {
  const now = new Date();
  if (part === "theme") {
    const hour = now.getHours();
    return hour >= 7 && hour < 19 ? "day" : "night";
  }
  if (part === "season")
    return seasonOf(`${now.getFullYear()}-${now.getMonth() + 1}`)!;
  // The landscape stays as it is; the next page load picks one at random.
  return window.__scene ?? root.dataset.scene ?? SCENES[0];
}

/**
 * Sets the theme, season or landscape for the rest of the visit (the
 * Settings app), saved in sessionStorage; the landscape is also kept in
 * memory for view transition navigations. Null goes back to automatic (the
 * clock, the calendar, a random landscape). The change crossfades in (a
 * season glides in, see changeSeason).
 */
export function chooseScene(
  part: ScenePart,
  value: string | null,
): Promise<void> {
  if (value === null) {
    try {
      sessionStorage.removeItem(part);
    } catch {
      // Storage unavailable; nothing was saved.
    }
  } else save(() => sessionStorage, part, value);
  const shown = value ?? automatic(part);
  if (part === "scene") window.__scene = shown;
  if (root.dataset[part] === shown) return Promise.resolve();
  if (part === "season") return changeSeason(shown);
  const apply = () => {
    root.dataset[part] = shown;
  };
  return changeScene(apply);
}

/** The saved choice for a part of the scene, or null when automatic. */
export function chosen(part: ScenePart): string | null {
  try {
    return sessionStorage.getItem(part);
  } catch {
    return null;
  }
}

/**
 * Shows a season for a while without saving it: the shell's album folders
 * take the season they were shot in. Null goes back to the visitor's own
 * season. The change glides in. Resolves once the change is fully shown.
 */
export function showSeason(season: Season | null): Promise<void> {
  const target = season ?? ownSeason();
  if (root.dataset.season === target) return Promise.resolve();
  return changeSeason(target);
}
