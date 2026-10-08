"use client";

import { useEffect, useMemo, useRef } from "react";
import ReizoHeader from "./ReizoHeader";
import { createDesignScope } from "./design-scope";
import { useAppearance } from "./AppearanceProvider";
import home from "./generated/index.json";
import agent from "./generated/agent.json";
import business from "./generated/business.json";
import cases from "./generated/cases.json";
import support from "./generated/support.json";
import contact from "./generated/business-contact.json";

const pages = { home, agent, business, cases, support, contact };
export type DesignPageName = keyof typeof pages;

export default function DesignPage({ page }: { page: DesignPageName }) {
  const { theme } = useAppearance();
  const root = useRef<HTMLDivElement>(null);
  const content = pages[page];
  const markup = useMemo(() => ({ __html: content.html }), [content]);
  useEffect(() => {
    if (!root.current) return;
    const element = root.current;
    // Reset presentation-owned DOM for Strict Mode and client navigation.
    element.innerHTML = content.html;
    const scope = createDesignScope(element, element.parentElement ?? element);
    let cancelled = false;
    async function initialize() {
      const modules = page === "home"
        ? await Promise.all([import("./generated/showcase-scenes"), import("./generated/home"), import("./generated/capability-stage"), import("./generated/connected-work"), import("./generated/woven-divider")])
        : page === "business"
          ? await Promise.all([import("./generated/business"), import("./generated/business-motion"), import("./generated/business-particles")])
          : await Promise.all([import("./generated/site-pages")]);
      if (cancelled) return;
      modules.forEach(module => module.default(scope));
    }
    void initialize().catch(error => console.error("REIZO presentation initialization failed", error));
    return () => { cancelled = true; scope.dispose(); };
  }, [page, content]);
  return <div data-theme={theme} className={`reizo-site reizo-page-${page === "home" ? "index" : page} ${content.bodyClass}`}>
    <ReizoHeader enterprise={page === "business"} />
    {/* Trusted, versioned design markup only; never pass user or API content here. */}
    <div ref={root} className="reizo-presentation" dangerouslySetInnerHTML={markup} />
  </div>;
}
