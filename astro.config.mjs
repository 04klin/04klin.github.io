import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://04klin.github.io",
  // The photos moved into the shell on the home page; old links land there.
  redirects: {
    "/photography": "/",
  },
  // Listen on all interfaces so the dev server is reachable from other
  // machines (LAN and Tailscale), not just localhost. Vite rejects requests
  // whose Host header is an unknown hostname, so the machine's names are
  // allowed explicitly (IP addresses and localhost are always allowed).
  server: {
    host: true,
    allowedHosts: ["lobsterlocal", "lobstertail"],
  },
});
