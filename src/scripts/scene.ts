/*
 * The two buttons in the top bar that change the background scene.
 *
 * Three attributes on <html> describe the scene, and the CSS draws it:
 *   data-theme   "night" or "day". Follows the visitor's own clock (day
 *                from 7am to 7pm).
 *   data-season  "spring", "summer", "autumn" or "winter". Follows the date
 *                (northern hemisphere).
 *   data-scene   which landscape is shown. Picked at random on every page
 *                load and kept while the visitor moves between pages; there
 *                is no button for it.
 *
 * A choice made with either button lasts for the visit only (sessionStorage,
 * cleared when the tab is closed), so the next visit follows the clock and
 * the calendar again.
 *
 * The inline script in the layout's <head> sets all three before the first
 * paint and again after each view transition swap (which replaces the <html>
 * attributes), so the page never flashes the wrong scene.
 */

import { SEASONS, seasonOf, type Season } from "./seasons";

const root = document.documentElement;

const currentTheme = () => (root.dataset.theme === "day" ? "day" : "night");

const currentSeason = (): Season =>
  SEASONS.find((s) => s === root.dataset.season) ?? "summer";

const nextSeason = (): Season =>
  SEASONS[(SEASONS.indexOf(currentSeason()) + 1) % SEASONS.length];

const capitalise = (word: string) => word[0].toUpperCase() + word.slice(1);

function save(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the buttons still work.
  }
}

/** The visitor's own season: chosen with the button, or today's. */
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

/** Keeps the buttons' labels in step with the scene. */
function updateLabels() {
  const theme = currentTheme() === "day" ? "night" : "day";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", `Switch to ${theme}`);
    button.setAttribute("title", `Switch to ${theme}`);
  });
  const label = `${capitalise(currentSeason())}. Switch to ${nextSeason()}`;
  document.querySelectorAll("[data-season-toggle]").forEach((button) => {
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  });
}

/** The reveal currently playing, if any. */
let running: ViewTransition | null = null;

/**
 * Applies a change to the scene. Where view transitions are supported, the
 * new scene spreads out in a circle from the button that was pressed.
 */
function changeScene(button: HTMLElement, apply: () => void) {
  const update = () => {
    apply();
    updateLabels();
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // A click during a reveal finishes that reveal at once and applies the
  // new change straight away. Starting a second transition would cut the
  // first one short and flash between scenes.
  if (!document.startViewTransition || reduced || running) {
    running?.skipTransition();
    update();
    return;
  }

  // The circle itself is a CSS animation on ::view-transition-new(root)
  // (see the stylesheet), so it is clipped from the very first frame. An
  // animation started from script once the transition is ready can let one
  // frame of the whole new scene through first, which flickers.
  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  root.style.setProperty("--reveal-x", `${x}px`);
  root.style.setProperty("--reveal-y", `${y}px`);
  root.style.setProperty("--reveal-r", `${radius}px`);
  root.classList.add("theme-switching");

  const transition = document.startViewTransition(update);
  running = transition;
  transition.finished.finally(() => {
    running = null;
    root.classList.remove("theme-switching");
  });
}

/**
 * One listener on the document handles both buttons on every page, since the
 * top bar is replaced on each navigation but the document is not.
 */
export function setupSceneControls() {
  document.addEventListener("click", (event) => {
    const target = event.target as Element;

    const themeButton = target.closest<HTMLElement>("[data-theme-toggle]");
    if (themeButton) {
      const theme = currentTheme() === "day" ? "night" : "day";
      changeScene(themeButton, () => {
        root.dataset.theme = theme;
        save(() => sessionStorage, "theme", theme);
      });
    }

    const seasonButton = target.closest<HTMLElement>("[data-season-toggle]");
    if (seasonButton) {
      const season = nextSeason();
      changeScene(seasonButton, () => {
        root.dataset.season = season;
        save(() => sessionStorage, "season", season);
      });
    }
  });
  document.addEventListener("astro:page-load", updateLabels);
}

/**
 * The walk (see the stylesheet): on the home page, scrolling down passes the
 * time of day. Browsers with scroll-driven animations do it in CSS alone;
 * elsewhere the animation is paused and moved along here, through --walk
 * (0 at the top of the page, 1 at the bottom).
 */
export function setupWalkFallback() {
  if (CSS.supports("animation-timeline: scroll()")) return;

  let frame = 0;
  const update = () => {
    frame = 0;
    const max = root.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    root.style.setProperty("--walk", progress.toFixed(4));
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  // Straight away, and after each view transition swap (which replaces the
  // <html> attributes, style included), so the sky never shows the wrong time.
  update();
  document.addEventListener("astro:page-load", update);
}

/**
 * On the photography page each post carries the season it was taken in
 * (data-season-of). As the page scrolls, the backdrop shows the season of the
 * post at the middle of the screen; above the first post it shows the
 * visitor's own. Nothing is saved, so other pages are unaffected. Returns a
 * function that stops it.
 */
export function followPostSeasons() {
  const posts = Array.from(
    document.querySelectorAll<HTMLElement>("[data-season-of]"),
  );
  if (posts.length === 0) return () => {};

  let frame = 0;
  const update = () => {
    frame = 0;
    const middle = window.innerHeight / 2;
    // The last post whose top has passed the middle of the screen.
    const current = posts.filter(
      (post) => post.getBoundingClientRect().top < middle,
    );
    const season = current.at(-1)?.dataset.seasonOf ?? ownSeason();
    if (root.dataset.season !== season) {
      root.dataset.season = season;
      updateLabels();
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();
  return () => {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    cancelAnimationFrame(frame);
  };
}
