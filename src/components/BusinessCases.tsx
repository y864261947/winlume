"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { businessCases, industries } from "@/data/audience";
import { getProduct } from "@/data/products";
import { useModals } from "./providers";

const chipBase =
  "flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-1.5 text-sm ring-1 transition cursor-pointer";
const chipIdle = "text-ink-600 ring-line hover:text-ink-900 hover:ring-line-strong";
const chipActive = "bg-primary-50 font-medium text-primary-600 ring-primary-200";

export default function BusinessCases() {
  const { industryPrefs } = useModals();
  const [active, setActive] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // 身份选择中保存的行业偏好到达后，默认筛选第一个偏好行业（用户手动切换后不再跟随）
  useEffect(() => {
    if (touched || industryPrefs.length === 0) return;
    const timer = window.setTimeout(() => setActive(industryPrefs[0]), 0);
    return () => window.clearTimeout(timer);
  }, [industryPrefs, touched]);

  const filtered = active ? businessCases.filter((item) => item.industry === active) : businessCases;

  const select = (industry: string | null) => {
    setTouched(true);
    setActive(industry);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => select(null)}
          className={`${chipBase} text-xs ${!active ? chipActive : chipIdle}`}
        >
          <span className="spectrum-bg h-1.5 w-1.5 rounded-full" aria-hidden />
          全部行业
        </button>
        {industries.map((industry) => (
          <button
            key={industry.name}
            type="button"
            onClick={() => select(industry.name)}
            className={`${chipBase} text-xs ${active === industry.name ? chipActive : chipIdle}`}
          >
            {industry.name}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => {
          const industry = industries.find((entry) => entry.name === item.industry);
          const IndustryIcon = industry?.icon;
          const product = item.productId ? getProduct(item.productId) : undefined;
          return (
            <article
              key={item.id}
              className="spectrum-card flex h-full flex-col rounded-lg border border-line bg-surface p-5 transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg hover:shadow-ink-950/5"
            >
              <span className="flex items-center gap-1.5 text-xs text-ink-500">
                {IndustryIcon && <IndustryIcon className="h-3.5 w-3.5 text-primary-500" />}
                {item.industry}
              </span>
              <p className="mt-3 text-base font-semibold text-ink-900">{item.client}</p>
              <p className="mt-1.5 min-h-12 text-sm leading-6 text-ink-500">{item.scenario}</p>
              <p className="mt-4 font-mono text-lg font-semibold text-primary-600">{item.outcome}</p>
              {product && (
                <Link
                  href={`/products/${product.id}`}
                  className="mt-4 flex items-center gap-1 border-t border-line pt-3 text-xs font-medium text-ink-600 transition hover:text-primary-600"
                >
                  使用产品：{product.name}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
