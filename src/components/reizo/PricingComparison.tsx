"use client";
import { useEffect, useRef } from "react";
import markup from "./generated/pricing-comparison.json";
import { createDesignScope } from "./design-scope";

export default function PricingComparison() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    const page = element?.closest<HTMLElement>(".pricing-page");
    if (!element || !page) return;
    element.innerHTML = markup.__html;
    const scope = createDesignScope(page);
    let cancelled = false;
    void import("./generated/pricing-compare").then(module => { if (!cancelled) module.default(scope); });
    return () => { cancelled = true; scope.dispose(); };
  }, []);
  return <div ref={root} className="reizo-presentation" dangerouslySetInnerHTML={markup} />;
}
