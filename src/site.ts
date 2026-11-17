export const siteName = "Kevin Lin";

export const contact = {
  /** Written out rather than linked, to keep it away from address scrapers. */
  email: "2004klin[at]gmail.com",
  github: "04klin",
  githubUrl: "https://github.com/04klin",
  resume: "/assets/resume.pdf",
} as const;

/** Top bar links, in display order. Add a page here to put it in the nav. */
export const navItems = [
  { key: "home", href: "/", label: "Home" },
  { key: "projects", href: "/projects", label: "Projects" },
  { key: "photography", href: "/photography", label: "Photography" },
] as const;

export type NavKey = (typeof navItems)[number]["key"];
