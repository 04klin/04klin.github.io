/*
 * The desktop's window manager (Shell.astro, Window.astro). Each window
 * belongs to an app ([data-window][data-app]); desktop icons
 * ([data-open-app]) open them. An app registers what happens when its
 * window opens from closed (a new session) and when it closes.
 *
 * Window state lives in attributes, which the stylesheet reads:
 *   data-live    the app is running (open or minimized)
 *   data-open    the window is showing
 *   data-active  the window in front, which gets the keyboard
 *   data-zoomed  it fills the screen
 *   data-placed  it has been dragged; --x and --y hold where to
 *   data-sized   it has been resized; --w and --h hold its size
 */

interface AppHooks {
  /** The window opens and the app was not running. */
  start?: () => void;
  /** The window closes (the red light, or the app closing itself). */
  end?: () => void;
}

const hooks = new Map<string, AppHooks>();
let front = 10;

const find = (app: string) =>
  document.querySelector<HTMLElement>(`[data-window][data-app="${app}"]`);

const windows = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-window]"));

export function registerApp(app: string, appHooks: AppHooks) {
  hooks.set(app, appHooks);
}

/** True if the app's window is the one in front. */
export const isActive = (app: string) => "active" in (find(app)?.dataset ?? {});

/** Brings a window to the front and gives it the keyboard. */
function raise(win: HTMLElement) {
  windows().forEach((w) => delete w.dataset.active);
  win.dataset.active = "";
  win.style.zIndex = String(++front);
}

/** After a window goes away, the next one down comes to the front. */
function raiseNext() {
  const next = windows()
    .filter((w) => "open" in w.dataset)
    .sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0];
  if (next) raise(next);
}

const focusIcon = (app: string) =>
  document
    .querySelector<HTMLElement>(`[data-open-app="${app}"]`)
    ?.focus({ preventScroll: true });

/** Opens (or brings back) an app's window, starting the app if needed. */
export function openApp(app: string) {
  const win = find(app);
  if (!win) return null;
  const starting = !("live" in win.dataset);
  win.dataset.live = "";
  win.dataset.open = "";
  raise(win);
  if (starting) hooks.get(app)?.start?.();
  return win;
}

/** Closes an app's window and ends the app. */
export function closeApp(app: string) {
  const win = find(app);
  if (!win || !("live" in win.dataset)) return;
  for (const key of ["live", "open", "active", "zoomed"])
    delete win.dataset[key];
  hooks.get(app)?.end?.();
  focusIcon(app);
  raiseNext();
}

/** Hides an app's window; the app keeps running, and its icon brings it back. */
export function minimizeApp(app: string) {
  const win = find(app);
  if (!win) return;
  delete win.dataset.open;
  delete win.dataset.active;
  focusIcon(app);
  raiseNext();
}

const narrow = matchMedia("(max-width: 680px)");

/** Lets a window be moved by dragging its title bar. */
function dragging(desktop: HTMLElement, event: PointerEvent) {
  const bar = event.currentTarget as HTMLElement;
  const win = bar.closest<HTMLElement>("[data-window]")!;
  if (
    event.button !== 0 ||
    (event.target as Element).closest("button") ||
    "zoomed" in win.dataset ||
    narrow.matches
  )
    return;
  event.preventDefault();
  const area = desktop.getBoundingClientRect();
  const start = win.getBoundingClientRect();
  const grabX = event.clientX - start.left;
  const grabY = event.clientY - start.top;
  const place = (x: number, y: number) => {
    // Keep enough of the title bar on screen to grab it again.
    const left = Math.min(Math.max(x, 100 - start.width), area.width - 100);
    const top = Math.min(Math.max(y, 0), area.height - 40);
    win.style.setProperty("--x", `${Math.round(left)}px`);
    win.style.setProperty("--y", `${Math.round(top)}px`);
  };
  place(start.left - area.left, start.top - area.top);
  win.dataset.placed = "";

  bar.setPointerCapture(event.pointerId);
  const move = (e: PointerEvent) =>
    place(e.clientX - area.left - grabX, e.clientY - area.top - grabY);
  const stop = () => {
    bar.removeEventListener("pointermove", move);
    bar.removeEventListener("pointerup", stop);
    bar.removeEventListener("pointercancel", stop);
  };
  bar.addEventListener("pointermove", move);
  bar.addEventListener("pointerup", stop);
  bar.addEventListener("pointercancel", stop);
}

/** The smallest a window can be made. */
const minWidth = 320;
const minHeight = 180;

/** Lets a window be resized by dragging one of its edges or corners. */
function resizing(desktop: HTMLElement, event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement;
  const win = handle.closest<HTMLElement>("[data-window]")!;
  if (event.button !== 0 || "zoomed" in win.dataset || narrow.matches) return;
  event.preventDefault();
  event.stopPropagation();
  const edge = handle.dataset.resize ?? "";
  const area = desktop.getBoundingClientRect();
  const rect = win.getBoundingClientRect();
  const start = {
    left: rect.left - area.left,
    top: rect.top - area.top,
    right: rect.right - area.left,
    bottom: rect.bottom - area.top,
  };
  const fromX = event.clientX;
  const fromY = event.clientY;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), hi);

  const size = (e: PointerEvent) => {
    const dx = e.clientX - fromX;
    const dy = e.clientY - fromY;
    let { left, top, right, bottom } = start;
    // Each edge moves on its own and stops at the minimum size and the
    // desktop's sides (the top never goes above the desktop, so the title
    // bar stays reachable).
    if (edge.includes("w")) left = clamp(left + dx, 0, right - minWidth);
    if (edge.includes("e"))
      right = clamp(right + dx, left + minWidth, area.width);
    if (edge.includes("n")) top = clamp(top + dy, 0, bottom - minHeight);
    if (edge.includes("s"))
      bottom = clamp(bottom + dy, top + minHeight, area.height);
    win.style.setProperty("--x", `${Math.round(left)}px`);
    win.style.setProperty("--y", `${Math.round(top)}px`);
    win.style.setProperty("--w", `${Math.round(right - left)}px`);
    win.style.setProperty("--h", `${Math.round(bottom - top)}px`);
  };
  size(event);
  win.dataset.placed = "";
  win.dataset.sized = "";
  win.dataset.resizing = "";

  handle.setPointerCapture(event.pointerId);
  const stop = () => {
    delete win.dataset.resizing;
    handle.removeEventListener("pointermove", size);
    handle.removeEventListener("pointerup", stop);
    handle.removeEventListener("pointercancel", stop);
  };
  handle.addEventListener("pointermove", size);
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
}

/** Wires up the desktop's icons, windows and title bars. */
export function setupWindows() {
  const desktop = document.querySelector<HTMLElement>("[data-desktop]");
  if (!desktop || "wired" in desktop.dataset) return;
  desktop.dataset.wired = "";

  desktop.addEventListener("click", (event) => {
    const target = event.target as Element;
    const icon = target.closest<HTMLElement>("[data-open-app]");
    if (icon) openApp(icon.dataset.openApp ?? "");

    const light = target.closest<HTMLElement>("[data-action]");
    const win = light?.closest<HTMLElement>("[data-window]");
    if (!light || !win) return;
    const app = win.dataset.app ?? "";
    if (light.dataset.action === "close") closeApp(app);
    else if (light.dataset.action === "minimize") minimizeApp(app);
    else win.toggleAttribute("data-zoomed");
  });

  // A press anywhere in a window brings it to the front.
  desktop.addEventListener(
    "pointerdown",
    (event) => {
      const win = (event.target as Element).closest<HTMLElement>(
        "[data-window]",
      );
      if (win && !("active" in win.dataset)) raise(win);
    },
    true,
  );

  desktop.querySelectorAll<HTMLElement>("[data-titlebar]").forEach((bar) => {
    bar.addEventListener("pointerdown", (event) => dragging(desktop, event));
    // Double-clicking the title bar fills the screen too, as on a Mac.
    bar.addEventListener("dblclick", (event) => {
      if (!(event.target as Element).closest("button"))
        bar.closest("[data-window]")?.toggleAttribute("data-zoomed");
    });
  });

  desktop.querySelectorAll<HTMLElement>("[data-resize]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => resizing(desktop, event));
  });
}
