const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fades in every [data-reveal] element as it scrolls into view. Elements that
 * appear together are staggered. The attribute is removed afterwards so the
 * reveal transition does not interfere with the element's own hover styles.
 */
export function setupReveal() {
  const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");

  if (reducedMotion() || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.removeAttribute("data-reveal"));
    return () => {};
  }

  const reveal = (el: HTMLElement, i: number) => {
    el.style.transitionDelay = `${i * 70}ms`;
    el.classList.add("is-visible");

    const done = (e: TransitionEvent) => {
      if (e.target !== el) return;
      el.removeEventListener("transitionend", done);
      el.removeAttribute("data-reveal");
      el.classList.remove("is-visible");
      el.style.transitionDelay = "";
    };
    el.addEventListener("transitionend", done);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry, i) => {
          observer.unobserve(entry.target);
          reveal(entry.target as HTMLElement, i);
        });
    },
    { rootMargin: "0px 0px -8% 0px" },
  );

  // Whatever is on screen at load is revealed straight away, so the first
  // view never waits on the observer; the rest is revealed on scroll.
  let onScreen = 0;
  targets.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0)
      reveal(el, onScreen++);
    else observer.observe(el);
  });

  return () => observer.disconnect();
}

/** Makes the soft glow on the page background follow the cursor. */
export function setupSpotlight() {
  // The backdrop element is persisted across navigations, so the glow keeps
  // its position from page to page.
  const backdrop = document.querySelector<HTMLElement>(".backdrop");
  if (!backdrop || reducedMotion()) return () => {};

  let frame = 0;
  let x = 0;
  let y = 0;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    x = e.clientX;
    y = e.clientY;
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        backdrop.style.setProperty("--spot-x", `${x}px`);
        backdrop.style.setProperty("--spot-y", `${y}px`);
      });
    }
  };

  window.addEventListener("pointermove", onMove);
  return () => {
    window.removeEventListener("pointermove", onMove);
    cancelAnimationFrame(frame);
  };
}

/**
 * Cards marked [data-glow] get a glow under the cursor and lean slightly
 * towards it. The CSS reads --glow-x/y and --tilt-x/y.
 */
export function setupCardGlow() {
  const cards = document.querySelectorAll<HTMLElement>("[data-glow]");
  const tilt = !reducedMotion();
  const MAX_TILT = 5; // degrees

  const onMove = (e: PointerEvent) => {
    const card = e.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty("--glow-x", `${x}px`);
    card.style.setProperty("--glow-y", `${y}px`);

    if (tilt && e.pointerType !== "touch") {
      const fromCenterX = x / rect.width - 0.5;
      const fromCenterY = y / rect.height - 0.5;
      card.style.setProperty("--tilt-y", `${fromCenterX * MAX_TILT}deg`);
      card.style.setProperty("--tilt-x", `${-fromCenterY * MAX_TILT}deg`);
    }
  };

  const onLeave = (e: PointerEvent) => {
    const card = e.currentTarget as HTMLElement;
    card.style.removeProperty("--tilt-x");
    card.style.removeProperty("--tilt-y");
  };

  cards.forEach((card) => {
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
  });
  return () =>
    cards.forEach((card) => {
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerleave", onLeave);
    });
}
