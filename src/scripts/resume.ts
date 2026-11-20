/*
 * The PDF viewer (ResumeApp.astro), for the resume; no desktop icon. Opening it loads the PDF into the
 * browser's PDF viewer (once a visit); without one, it says so and leaves
 * the download links. The terminal opens it with `open resume.pdf`, which
 * also brings it back when minimized.
 */

import { openApp, registerApp } from "./windows";

export function setupResume() {
  const root = document.querySelector<HTMLElement>("[data-resume]");
  if (!root || "ready" in root.dataset) return;
  root.dataset.ready = "";
  const doc = root.querySelector<HTMLIFrameElement>("[data-resume-doc]")!;
  const fallback = root.querySelector<HTMLElement>("[data-resume-fallback]")!;

  registerApp("resume", {
    start: () => {
      // Browsers that cannot show a PDF in a page would download it instead.
      if (navigator.pdfViewerEnabled === false) {
        fallback.hidden = false;
        return;
      }
      doc.hidden = false;
      // Fit the page to the window's width.
      if (!doc.getAttribute("src"))
        doc.src = `${root.dataset.resume}#view=FitH`;
    },
  });

  // Clicks inside the PDF go to the viewer's own document and never reach
  // the desktop, so bring the window to the front when it takes focus.
  const listening = new AbortController();
  window.addEventListener(
    "blur",
    () => {
      if (document.activeElement === doc) openApp("resume");
    },
    { signal: listening.signal },
  );
  document.addEventListener("astro:before-swap", () => listening.abort(), {
    once: true,
  });
}
