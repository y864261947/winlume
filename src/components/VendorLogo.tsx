"use client";

import { useState } from "react";

type Props = {
  src?: string;
  name: string;
  size?: number;
  className?: string;
};

/**
 * Vendor mark with local placeholder SVG. If the asset fails to load,
 * falls back to a monogram chip so the card never looks broken.
 */
export function VendorLogo({ src, name, size = 28, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const monogram = name.trim().slice(0, 2).toUpperCase() || "AI";

  if (!src || failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-ink-900 text-[10px] font-bold tracking-wide text-white ${className}`}
        style={{ width: size, height: size }}
        title={name}
        aria-hidden
      >
        {monogram}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-lg object-cover ${className}`}
      onError={() => setFailed(true)}
      title={name}
    />
  );
}
