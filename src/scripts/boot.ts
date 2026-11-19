/**
 * The boot screen (BootScreen.astro). It ends when its fade-out animation
 * finishes, or straight away on a click or key press.
 */

export function setupBootScreen(): void {
  const root = document.documentElement;
  if (!("boot" in root.dataset)) return;
  const screen = document.querySelector<HTMLElement>("[data-boot-screen]");
  const listeners = new AbortController();
  const { signal } = listeners;

  const finish = () => {
    if (!("boot" in root.dataset)) return;
    delete root.dataset.boot;
    listeners.abort();
    document.dispatchEvent(new Event("boot:done"));
  };
  if (!screen) return finish();

  screen.addEventListener(
    "animationend",
    (event) => {
      if (event.target === screen) finish();
    },
    { signal },
  );
  addEventListener("keydown", finish, { signal });
  addEventListener("pointerdown", finish, { signal });
}
