/*
 * The Photos app (PhotosApp.astro). Picking an album shows its grid and
 * gives the backdrop that album's season; a click on a photo shows it large
 * in the viewer (← → step through the album, Esc goes back). The terminal
 * opens photos here with openPhoto. Closing the window tells the terminal
 * ("photos:closed"), which puts back the season that matches where it is.
 */

import { showSeason } from "./scene";
import type { Season } from "./seasons";
import { isActive, openApp, registerApp } from "./windows";

interface Album {
  dir: string;
  season: Season | null;
  photos: { name: string; alt: string; full: string }[];
}

let albums: Album[] = [];
let current: Album | null = null;
let index = 0;
let root: HTMLElement | null = null;

const part = <T extends HTMLElement>(selector: string) =>
  root!.querySelector<T>(selector)!;

function setTitle() {
  const title = root
    ?.closest("[data-window]")
    ?.querySelector("[data-window-title]");
  if (!title) return;
  const viewing = !part("[data-viewer]").hidden;
  title.textContent = [
    "Photos",
    current?.dir,
    viewing ? current?.photos[index]?.name : null,
  ]
    .filter(Boolean)
    .join(" — ");
}

/** Shows an album's grid (closing the viewer). */
function showAlbum(dir: string) {
  const album = albums.find((a) => a.dir === dir);
  if (!root || !album) return;
  const changed = current !== album;
  current = album;
  root.querySelectorAll<HTMLElement>("[data-album-view]").forEach((view) => {
    view.hidden = view.dataset.albumView !== dir;
  });
  root.querySelectorAll<HTMLElement>("[data-show-album]").forEach((button) => {
    button.setAttribute(
      "aria-current",
      String(button.dataset.showAlbum === dir),
    );
  });
  closeViewer();
  if (changed) {
    part("[data-photos-main]").scrollTop = 0;
    showSeason(album.season);
  }
}

function showPhoto(i: number) {
  if (!current) return;
  index = (i + current.photos.length) % current.photos.length;
  const photo = current.photos[index];
  const viewer = part("[data-viewer]");
  const image = part<HTMLImageElement>("[data-viewer-img]");
  viewer.hidden = false;
  part("[data-viewer-spinner]").hidden = false;
  image.hidden = true;
  image.alt = photo.alt;
  image.src = photo.full;
  part("[data-viewer-caption]").textContent =
    `${photo.name} · ${photo.alt} · ${index + 1}/${current.photos.length}`;
  const single = current.photos.length < 2;
  root!
    .querySelectorAll<HTMLElement>(
      "[data-viewer-action='prev'], [data-viewer-action='next']",
    )
    .forEach((button) => (button.hidden = single));
  setTitle();
}

function closeViewer() {
  if (!root) return;
  const viewer = part("[data-viewer]");
  if (!viewer.hidden) {
    viewer.hidden = true;
    // Cleared so the old photo does not flash the next time.
    part<HTMLImageElement>("[data-viewer-img]").removeAttribute("src");
  }
  setTitle();
}

/** Opens the Photos app on one photo (from the terminal). */
export function openPhoto(dir: string, i: number) {
  openApp("photos");
  showAlbum(dir);
  showPhoto(i);
}

export function setupPhotos() {
  root = document.querySelector<HTMLElement>("[data-photos]");
  if (!root || "ready" in root.dataset) return;
  root.dataset.ready = "";
  albums = JSON.parse(root.dataset.photos ?? "[]");
  current = null;

  registerApp("photos", {
    // A fresh start shows the newest album.
    start: () => {
      // The thumbnails are lazy, so a hidden album's would only start
      // loading when it is picked; fetch them all now instead, so switching
      // albums shows the grid at once.
      root!
        .querySelectorAll<HTMLImageElement>("img[loading='lazy']")
        .forEach((img) => (img.loading = "eager"));
      if (!current && albums[0]) showAlbum(albums[0].dir);
    },
    end: () => {
      closeViewer();
      current = null;
      setTitle();
      document.dispatchEvent(new Event("photos:closed"));
    },
  });

  part<HTMLImageElement>("[data-viewer-img]").addEventListener("load", () => {
    part("[data-viewer-spinner]").hidden = true;
    part("[data-viewer-img]").hidden = false;
  });

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const albumButton = target.closest<HTMLElement>("[data-show-album]");
    if (albumButton) return showAlbum(albumButton.dataset.showAlbum ?? "");
    const thumb = target.closest<HTMLElement>("[data-view]");
    if (thumb) return showPhoto(Number(thumb.dataset.view));
    const action = target.closest<HTMLElement>("[data-viewer-action]");
    if (action?.dataset.viewerAction === "back") closeViewer();
    else if (action?.dataset.viewerAction === "prev") showPhoto(index - 1);
    else if (action?.dataset.viewerAction === "next") showPhoto(index + 1);
    // A click on the dark space around a photo goes back to the album.
    else if (target.matches("[data-viewer]")) closeViewer();
  });

  // The keys work while Photos is the window in front.
  const listening = new AbortController();
  document.addEventListener(
    "keydown",
    (event) => {
      if (!isActive("photos") || part("[data-viewer]").hidden) return;
      if (event.key === "ArrowLeft") showPhoto(index - 1);
      else if (event.key === "ArrowRight") showPhoto(index + 1);
      else if (event.key === "Escape") closeViewer();
      else return;
      event.preventDefault();
    },
    { signal: listening.signal },
  );
  document.addEventListener("astro:before-swap", () => listening.abort(), {
    once: true,
  });
}
