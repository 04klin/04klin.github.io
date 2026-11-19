/*
 * The Settings app (SettingsApp.astro): the theme, the season and the
 * wallpaper. Each group of radio buttons shows the current choice (empty
 * value: automatic) and changes the backdrop straight away with a
 * crossfade (chooseScene in scene.ts).
 */

import { chooseScene, chosen, type ScenePart } from "./scene";
import { registerApp } from "./windows";

const PARTS: ScenePart[] = ["theme", "season", "scene"];

export function setupSettings() {
  const form = document.querySelector<HTMLFormElement>("[data-settings]");
  if (!form || "ready" in form.dataset) return;
  form.dataset.ready = "";

  /** Checks the option that matches each saved choice. */
  const sync = () => {
    for (const part of PARTS) {
      const value = chosen(part) ?? "";
      form
        .querySelectorAll<HTMLInputElement>(`input[name="${part}"]`)
        .forEach((input) => (input.checked = input.value === value));
    }
  };

  registerApp("settings", { start: sync });
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const part = input.name as ScenePart;
    if (!PARTS.includes(part)) return;
    chooseScene(part, input.value || null);
  });
}
