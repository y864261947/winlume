import sharp from "sharp";

export class ProfileError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function profileName(value: unknown) {
  if (typeof value !== "string") throw new ProfileError("请输入昵称。");
  const name = value.trim();
  if (!name || name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new ProfileError("昵称需为 1 至 120 个字符，不能包含控制字符。");
  return name;
}

export function profileEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 320) throw new ProfileError("请输入有效的邮箱地址。");
  return email;
}

export async function profileAvatar(bytes: Buffer) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new ProfileError("请选择不超过 5 MB 的图片。");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) throw new ProfileError("请选择有效的 JPG、PNG 或 WebP 图片。");
  try {
    const image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
    // Re-encoding strips metadata and any non-image payload; never retain uploads.
    const avatar = await image.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
    return `data:image/webp;base64,${avatar.toString("base64")}`;
  } catch { throw new ProfileError("图片无法读取，请选择有效的 JPG、PNG 或 WebP 静态图片。"); }
}
