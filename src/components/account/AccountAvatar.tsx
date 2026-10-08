import Image from "next/image";
import { UserRound } from "lucide-react";

export default function AccountAvatar({ image, size = 54 }: { image?: string | null; size?: number }) {
  return <span className="reizo-user-avatar" style={{ width: size, height: size, display: "inline-flex", flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: "50%", overflow: "hidden", background: "var(--blue-soft, #eaf2fa)", color: "var(--blue, #0059ab)" }}>
    {image ? <Image src={image} alt="账户头像" width={size} height={size} unoptimized style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <UserRound aria-hidden size={Math.max(16, size * .45)} />}
  </span>;
}
