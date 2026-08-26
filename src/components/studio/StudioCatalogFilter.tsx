"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  listStudioToolCategories,
  studioToolsHref,
  type StudioToolCategoryId,
} from "@/lib/studio/tool-categories";

export default function StudioCatalogFilter({
  active,
}: {
  active: "all" | StudioToolCategoryId;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    activeRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [active]);

  return (
    <nav className="studio-catalog-filter-wrap" aria-label="分类筛选">
      <div className="studio-catalog-filter">
        <Link
          ref={active === "all" ? activeRef : undefined}
          href={studioToolsHref()}
          scroll={false}
          replace
          data-active={active === "all" ? "true" : "false"}
          aria-current={active === "all" ? "page" : undefined}
          style={{ viewTransitionName: "studio-cat-filter-all" }}
        >
          全部
        </Link>
        {listStudioToolCategories().map((category) => {
          const selected = active === category.id;
          return (
            <Link
              key={category.id}
              ref={selected ? activeRef : undefined}
              href={studioToolsHref(category.id)}
              scroll={false}
              replace
              title={category.summary}
              data-active={selected ? "true" : "false"}
              aria-current={selected ? "page" : undefined}
              style={{ viewTransitionName: `studio-cat-filter-${category.id}` }}
            >
              {category.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
