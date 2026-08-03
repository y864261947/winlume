"use client";

import {
  cloneElement,
  useEffect,
  useRef,
  type ReactElement,
} from "react";
import type { LiquidGlass } from "@ybouane/liquidglass";

export type LiquidGlassCapability = {
  hasWebGl: boolean;
  coarsePointer: boolean;
  reducedTransparency: boolean;
};

export function isLiquidGlassEligible({
  hasWebGl,
  coarsePointer,
  reducedTransparency,
}: LiquidGlassCapability) {
  return hasWebGl && !coarsePointer && !reducedTransparency;
}

function getCapability(): LiquidGlassCapability {
  const canvas = document.createElement("canvas");
  return {
    hasWebGl: Boolean(canvas.getContext("webgl")),
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    reducedTransparency: window.matchMedia(
      "(prefers-reduced-transparency: reduce)",
    ).matches,
  };
}

const HEADER_GLASS_DEFAULTS = {
  blurAmount: 0.2,
  refraction: 0.42,
  chromAberration: 0.018,
  edgeHighlight: 0.1,
  specular: 0.12,
  fresnel: 0.76,
  cornerRadius: 12,
  zRadius: 16,
  opacity: 0.9,
  saturation: 0.04,
  brightness: 0.02,
  shadowOpacity: 0.12,
  shadowSpread: 6,
  shadowOffsetY: 1,
};

type LiquidGlassChildProps = {
  "data-liquid-glass"?: string;
};

export default function LiquidGlassSurface({
  children,
}: {
  children: ReactElement<LiquidGlassChildProps>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const glass = root?.querySelector<HTMLElement>(":scope > [data-liquid-glass]");
    if (!root || !glass || !isLiquidGlassEligible(getCapability())) return;

    let cancelled = false;
    let instance: LiquidGlass | null = null;

    void import("@ybouane/liquidglass")
      .then(async ({ LiquidGlass }) => {
        const next = await LiquidGlass.init({
          root,
          glassElements: [glass],
          defaults: HEADER_GLASS_DEFAULTS,
        });

        if (cancelled) {
          next.destroy();
          return;
        }

        instance = next;
        glass.dataset.liquidGlassReady = "true";
      })
      .catch(() => {
        // The existing CSS material remains fully functional if WebGL init fails.
      });

    return () => {
      cancelled = true;
      glass.removeAttribute("data-liquid-glass-ready");
      instance?.destroy();
    };
  }, []);

  return (
    <div ref={rootRef} className="studio-liquid-glass-surface">
      <div className="studio-liquid-glass-scene" aria-hidden />
      {cloneElement(children, { "data-liquid-glass": "true" })}
    </div>
  );
}
