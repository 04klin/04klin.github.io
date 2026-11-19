// Seasons, shared by the scene buttons (scene.ts) and the shell's albums,
// whose seasons are worked out at build time. No browser APIs here.

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/**
 * The season a "YYYY-MM" date falls in (northern hemisphere), or undefined
 * for a bare "YYYY". Matches the month table in the layout's inline script.
 */
export function seasonOf(date: string): Season | undefined {
  const month = Number(date.split("-")[1]);
  if (!month) return undefined;
  return (["winter", "spring", "summer", "autumn"] as const)[
    Math.floor((month % 12) / 3)
  ];
}
