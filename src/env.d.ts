/// <reference types="astro/client" />

// The one Node function src/exif.ts reads the photos with at build time
// (the project has no Node type definitions).
declare module "node:fs" {
  export function readFileSync(path: string): Uint8Array;
}
