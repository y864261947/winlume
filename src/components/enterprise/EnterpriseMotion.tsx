"use client";

import { useEffect } from "react";

const revealSelector = "[data-zen-motion]";

export default function EnterpriseMotion() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const navigation = document.querySelector<HTMLElement>(".zen-nav");
    const clock = document.querySelector<HTMLElement>("[data-zen-clock]");
    const coordinate = document.querySelector<HTMLElement>("[data-zen-coordinate]");
    const pointerLight = document.querySelector<HTMLElement>(".zen-hero-pointer-light");
    let navigationFrame = 0;
    let pointerFrame = 0;
    let hasPointerPosition = false;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let pointerCurrentX = 0;
    let pointerCurrentY = 0;

    const updateTelemetry = () => {
      if (clock) {
        const time = new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date());
        clock.textContent = `SYS.TIME // ${time}`;
      }
    };

    const renderPointer = () => {
      pointerFrame = 0;
      pointerCurrentX += (pointerTargetX - pointerCurrentX) * 0.14;
      pointerCurrentY += (pointerTargetY - pointerCurrentY) * 0.14;
      pointerLight?.style.setProperty(
        "transform",
        `translate3d(${pointerCurrentX}px, ${pointerCurrentY}px, 0) translate3d(-50%, -50%, 0)`,
      );
      if (coordinate) {
        coordinate.textContent = `COORD // X:${String(Math.round(pointerTargetX)).padStart(4, "0")} Y:${String(Math.round(pointerTargetY)).padStart(4, "0")}`;
      }

      if (Math.abs(pointerTargetX - pointerCurrentX) > 0.4 || Math.abs(pointerTargetY - pointerCurrentY) > 0.4) {
        pointerFrame = window.requestAnimationFrame(renderPointer);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerTargetX = event.clientX;
      pointerTargetY = event.clientY;
      if (!hasPointerPosition) {
        hasPointerPosition = true;
        pointerCurrentX = pointerTargetX;
        pointerCurrentY = pointerTargetY;
      }
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(renderPointer);
    };

    const updateNavigation = () => {
      navigationFrame = 0;
      navigation?.classList.toggle("is-scrolled", window.scrollY > 18);
    };

    const onScroll = () => {
      if (!navigationFrame) navigationFrame = window.requestAnimationFrame(updateNavigation);
    };

    updateNavigation();
    updateTelemetry();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    const clockTimer = window.setInterval(updateTelemetry, 1000);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const element = entry.target as HTMLElement;
          observer.unobserve(element);
          if (reducedMotion) continue;

          const delay = Number(element.dataset.zenMotionDelay ?? 0);
          const distance = element.dataset.zenMotion === "right" ? 28 : 22;
          element.style.willChange = "transform, opacity";
          const animation = element.animate(
            [
              { opacity: 0, transform: `translate3d(${element.dataset.zenMotion === "right" ? distance : 0}px, ${element.dataset.zenMotion === "right" ? 0 : distance}px, 0)` },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
            {
              delay,
              duration: 640,
              easing: "cubic-bezier(0.23, 1, 0.32, 1)",
              fill: "both",
            },
          );
          animation.finished.finally(() => {
            element.style.willChange = "auto";
          });
        }
      },
      { rootMargin: "0px 0px -8%", threshold: 0.12 },
    );

    document.querySelectorAll<HTMLElement>(revealSelector).forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
      window.clearInterval(clockTimer);
      if (navigationFrame) window.cancelAnimationFrame(navigationFrame);
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    };
  }, []);

  return null;
}
