"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Star } from "lucide-react";
import type { PlazaModel } from "@/lib/catalog";
import {
  modelDescription,
  modelPriceLines,
  modelTags,
  resolvePlazaVendor,
  type PlazaTag,
} from "@/lib/catalog/plaza-display";

const tagToneClass: Record<PlazaTag["tone"], string> = {
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  slate: "border-slate-200 bg-slate-50 text-slate-600",
};

type Props = {
  model: PlazaModel;
  /** Optional docs URL; when omitted the docs button is hidden */
  docsHref?: string;
};

export function ModelPlazaCard({ model, docsHref }: Props) {
  const vendor = resolvePlazaVendor(model, {
    name: model.vendor_name,
    logo: model.vendor_logo,
  });
  const description = modelDescription(model, vendor);
  const tags = modelTags(model);
  const price = modelPriceLines(model);
  const studioHref = `/studio?model=${encodeURIComponent(model.model_name)}`;
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/8">
      {/* Hero */}
      <div
        className="relative flex h-36 items-center justify-center px-4 sm:h-40"
        style={{ background: vendor.heroGradient }}
      >
        <div
          className={`relative z-[1] flex max-w-[85%] items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-md shadow-black/10 ${
            vendor.heroDark ? "ring-1 ring-white/20" : ""
          }`}
        >
          {!logoFailed ? (
            <img
              src={vendor.logo}
              alt=""
              width={22}
              height={22}
              className="h-5 w-5 shrink-0 rounded object-contain"
              onError={() => setLogoFailed(true)}
            />
          ) : null}
          <span className="truncate text-sm font-semibold tracking-wide text-slate-800">
            {vendor.brandLabel}
          </span>
        </div>

        {/* Hover actions — marketplace style */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex translate-y-1 opacity-0 transition duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
          <div className="flex w-full overflow-hidden rounded-t-lg bg-violet-600/95 text-center text-xs font-medium text-white backdrop-blur-sm">
            {docsHref ? (
              <a
                href={docsHref}
                target="_blank"
                rel="noreferrer"
                className="flex-1 border-r border-white/20 px-2 py-2.5 transition hover:bg-violet-500"
              >
                查看文档
              </a>
            ) : null}
            <Link
              href={studioHref}
              className={`px-2 py-2.5 transition hover:bg-violet-500 ${docsHref ? "flex-1" : "w-full"}`}
            >
              立即体验
            </Link>
          </div>
        </div>

        <button
          type="button"
          className="absolute right-3 top-3 z-[2] rounded-full bg-white/80 p-1.5 text-slate-400 opacity-0 shadow-sm transition hover:text-amber-500 group-hover:opacity-100"
          title="收藏（即将支持）"
          aria-label="收藏"
          onClick={(event) => event.preventDefault()}
        >
          <Star className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        <h3 className="break-all text-[15px] font-semibold leading-snug text-slate-900">
          {model.model_name}
        </h3>
        <p className="mt-1.5 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500">{description}</p>

        <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.label}
              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${tagToneClass[tag.tone]}`}
            >
              {tag.label}
            </span>
          ))}
        </div>

        <div className="mt-auto pt-3 text-xs font-medium text-violet-600">
          {price.kind === "fixed" || price.kind === "tiered" ? (
            <p>{price.text}</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              <p className="inline-flex items-center gap-1">
                <ArrowDownLeft className="h-3 w-3 shrink-0 opacity-70" />
                {price.input}
              </p>
              <p className="inline-flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3 shrink-0 opacity-70" />
                {price.output}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
