export const siteName = "Kevin Lin";

export const contact = {
  /** Written out rather than linked, to keep it away from address scrapers. */
  email: "2004klin[at]gmail.com",
  github: "04klin",
  githubUrl: "https://github.com/04klin",
  resume: "/assets/resume.pdf",
} as const;

/** Host name in the shell prompts (boot screen, home page, 404). */
export const shellHost = "kevinlin.sh";

/** Version shown on the boot screen. Arbitrary; bump it for fun. */
export const siteVersion = "v0.9.0";

/**
 * Sections switched off while they are unfinished. Their pages, components
 * and content stay in the repository; set one to true to bring it back.
 */
export const features = {
  /** The /projects page and its entry in the shell's home folder. */
  projects: false,
};
