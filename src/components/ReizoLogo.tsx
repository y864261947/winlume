import Image from "next/image";

export interface ReizoLogoProps {
  className?: string;
  size?: number;
  width?: number;
  height?: number;
  priority?: boolean;
  theme?: "light" | "dark" | "auto";
  alt?: string;
}

export default function ReizoLogo({
  className = "",
  size,
  width = size ?? 30,
  height = size ?? 30,
  priority = false,
  theme = "auto",
  alt = "Reizo",
}: ReizoLogoProps) {
  if (theme === "light") {
    return (
      <Image
        src="/brand/logo-day.png"
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        unoptimized
        className={className}
      />
    );
  }

  if (theme === "dark") {
    return (
      <Image
        src="/brand/logo-night.png"
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        unoptimized
        className={className}
      />
    );
  }

  return (
    <>
      <Image
        src="/brand/logo-day.png"
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        unoptimized
        className={`reizo-logo-day ${className}`}
      />
      <Image
        src="/brand/logo-night.png"
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        unoptimized
        className={`reizo-logo-night ${className}`}
      />
    </>
  );
}

export { ReizoLogo };
