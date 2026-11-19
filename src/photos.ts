/*
 * The photo albums on the "nas" (the shell on the home page). Each album is
 * a folder there; its photos are listed by file name from
 * src/assets/photography/. Add a photo by dropping the full-resolution file
 * in that folder and naming it in an album below; the build fails on a name
 * that does not exist. Albums are sorted newest first.
 */

import type { ImageMetadata } from "astro";

export interface Album {
  /** Folder name on the nas: lowercase, no spaces. */
  dir: string;
  /** "YYYY-MM", or just "YYYY". The backdrop takes its season. */
  date: string;
  photos: { file: string; alt: string }[];
  /** An external album, shown as album.url inside the folder. */
  link?: string;
}

/** Extra albums elsewhere, shown as flickr.url in the albums folder. */
export const flickrUrl = "https://www.flickr.com/photos/04klin/";

/** Shown when logging in to the nas. */
export const camera = "Canon EOS Rebel T7";

const allAlbums: Album[] = [
  {
    dir: "linville-gorge",
    date: "2026-11",
    photos: [
      {
        file: "linville_gorge_hanging.jpg",
        alt: "A hiker gripping a boulder at the cliff edge above autumn forest",
      },
      {
        file: "linville_gorge_outlook.jpg",
        alt: "Looking out over a lake and autumn-coloured hills from the gorge rim",
      },
      {
        file: "linville_gorge_squatting_at_outlook.jpg",
        alt: "A hiker crouching on a rock ledge above the forested gorge on a cloudy day",
      },
    ],
  },
  {
    dir: "nyc",
    date: "2026-06",
    photos: [
      {
        file: "brooklyn_bridge.jpg",
        alt: "Brooklyn Bridge in front of the Lower Manhattan skyline",
      },
      {
        file: "little_island.jpg",
        alt: "Little Island park on the Hudson River, with Manhattan behind it",
      },
    ],
  },
  {
    dir: "tokyo",
    date: "2026-05",
    photos: [
      {
        file: "tokyo_night_view.jpg",
        alt: "Tokyo lit up at night, seen from above",
      },
      {
        file: "enoshima_entrance.jpg",
        alt: "Me at the torii gate entrance to Enoshima",
      },
      {
        file: "enoshima_shore.jpg",
        alt: "Red walkway along the cliffs of the Enoshima shore",
      },
      {
        file: "model_bakery_japan.jpg",
        alt: "A miniature model of a bakery full of bread",
      },
    ],
    link: "https://photos.app.goo.gl/3JvDXtwURSKwfL9k6",
  },
  {
    dir: "tokyo-osaka",
    date: "2025-12",
    photos: [
      {
        file: "hills.jpg",
        alt: "Friends looking out over a small town and the hills behind it",
      },
      {
        file: "marketplace.jpg",
        alt: "A crowded street of traditional shops at sunset",
      },
      {
        file: "alleyway.jpg",
        alt: "Friends walking down a quiet residential street",
      },
      {
        file: "mnt_fuji.jpg",
        alt: "The snowy peak of Mount Fuji breaking through the clouds",
      },
    ],
    link: "https://photos.app.goo.gl/5ZfrFPxRZssD6Bo97",
  },
  {
    dir: "grandfather-mountain",
    date: "2025-05",
    photos: [
      {
        file: "grandfather_mountain_outlook.jpg",
        alt: "Green valleys and ridges in spring under a sky full of clouds",
      },
      {
        file: "grandfather_mnt_peak.jpg",
        alt: "A hiker with arms raised at the summit, valleys spread out below",
      },
    ],
  },
];

export const albums = [...allAlbums].sort((a, b) =>
  b.date.localeCompare(a.date),
);

const files = import.meta.glob<{ default: ImageMetadata }>(
  "./assets/photography/*.{jpg,jpeg,png,webp}",
  { eager: true },
);

/** The imported image for a file in src/assets/photography/. */
export function photo(file: string): ImageMetadata {
  const found = files[`./assets/photography/${file}`];
  if (!found) throw new Error(`No photo src/assets/photography/${file}`);
  return found.default;
}
