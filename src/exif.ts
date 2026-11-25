/*
 * The camera settings of each photo, read from its EXIF at build time (the
 * shell's `ls -l` and `exif` in an album, and the Photos viewer). A small
 * reader for the handful of tags shown, so it needs no library. It reads
 * only the tags below; location (GPS) is never read, so it never reaches
 * the page. The generated WebP files carry no EXIF at all.
 */

import { readFileSync } from "node:fs";

export interface Exif {
  /** "Canon EOS Rebel T7" */
  camera: string | null;
  /** "Canon EF-S 55-250mm f/4-5.6 IS STM" */
  lens: string | null;
  /** "1/250", or "13s" for a long exposure */
  shutter: string | null;
  /** "f/7.1" */
  aperture: string | null;
  /** "ISO 100" */
  iso: string | null;
  /** "55mm" */
  focal: string | null;
  /** "2026-05-25", the day it was taken (the camera's clock is not
      reliable to the hour across time zones, so no time). */
  taken: string | null;
}

const empty: Exif = {
  camera: null,
  lens: null,
  shutter: null,
  aperture: null,
  iso: null,
  focal: null,
  taken: null,
};

/** Bytes as text (EXIF strings are ASCII). */
const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/** The TIFF block inside a JPEG's APP1 "Exif" segment, if there is one. */
function tiffOf(jpeg: Uint8Array): Uint8Array | null {
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  if (view.getUint16(0) !== 0xffd8) return null;
  let at = 2;
  while (at + 4 <= jpeg.length) {
    const marker = view.getUint16(at);
    const length = view.getUint16(at + 2);
    if (marker === 0xffe1 && ascii(jpeg, at + 4, at + 10) === "Exif\0\0")
      return jpeg.subarray(at + 10, at + 2 + length);
    // The image data starts at SOS; no metadata after it.
    if (marker === 0xffda) return null;
    at += 2 + length;
  }
  return null;
}

/** The tags shown, by number. */
const MAKE = 0x010f;
const MODEL = 0x0110;
const EXIF_IFD = 0x8769;
const EXPOSURE = 0x829a;
const F_NUMBER = 0x829d;
const ISO = 0x8827;
const TAKEN = 0x9003;
const FOCAL = 0x920a;
const LENS = 0xa434;

/** Reads the tags above from a TIFF block. */
function tags(tiff: Uint8Array) {
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const little = ascii(tiff, 0, 2) === "II";
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const found = new Map<number, string | number>();

  const walk = (offset: number) => {
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const n = u32(entry + 4);
      const value = entry + 8;
      if (tag === EXIF_IFD) walk(u32(value));
      else if (type === 2) {
        // ASCII: in place when it fits in four bytes, else at an offset.
        const start = n > 4 ? u32(value) : value;
        found.set(
          tag,
          ascii(tiff, start, start + n)
            .replace(/\0.*$/s, "")
            .trim(),
        );
      } else if (type === 5) {
        // Rational: numerator and denominator at an offset.
        const start = u32(value);
        const below = u32(start + 4);
        found.set(tag, below ? u32(start) / below : 0);
      } else if (type === 3) found.set(tag, u16(value));
      // Long, or signed long (Canon writes ISO as one).
      else if (type === 4) found.set(tag, u32(value));
      else if (type === 9) found.set(tag, view.getInt32(value, little));
    }
  };
  walk(u32(4));
  return found;
}

const trim = (n: number) => String(Math.round(n * 10) / 10);

/** The camera settings of a photo in src/assets/photography/. */
export function exifOf(file: string): Exif {
  let found: Map<number, string | number>;
  try {
    const tiff = tiffOf(
      // Relative to the project folder, where the build runs.
      readFileSync(`src/assets/photography/${file}`),
    );
    if (!tiff) return empty;
    found = tags(tiff);
  } catch {
    // Not a JPEG, or no readable EXIF: nothing to show.
    return empty;
  }
  const text = (tag: number) => {
    const value = found.get(tag);
    return typeof value === "string" && value ? value : null;
  };
  const number = (tag: number) => {
    const value = found.get(tag);
    return typeof value === "number" && value > 0 ? value : null;
  };

  const make = text(MAKE);
  const model = text(MODEL);
  const exposure = number(EXPOSURE);
  const fNumber = number(F_NUMBER);
  const iso = number(ISO);
  const focal = number(FOCAL);
  const taken = text(TAKEN);
  return {
    camera:
      model && make && !model.startsWith(make) ? `${make} ${model}` : model,
    lens: text(LENS),
    shutter: exposure
      ? exposure >= 1
        ? `${trim(exposure)}s`
        : `1/${Math.round(1 / exposure)}`
      : null,
    aperture: fNumber ? `f/${trim(fNumber)}` : null,
    iso: iso ? `ISO ${iso}` : null,
    focal: focal ? `${Math.round(focal)}mm` : null,
    taken: taken?.match(/^\d{4}:\d\d:\d\d/)
      ? taken.slice(0, 10).replaceAll(":", "-")
      : null,
  };
}
