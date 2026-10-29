import { websiteUrl } from "./config.ts";

export type AttachmentType = "image" | "video";

export interface SanitizedAttachment {
  url: string;
  type: AttachmentType;
  name: string;
}

export const ATTACHMENT_ALLOWED_MIME_PREFIXES = ["image/", "video/"];
export const ATTACHMENT_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
  "bmp",
  "heic",
  "heif",
  "apng",
]);
export const ATTACHMENT_VIDEO_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mov",
  "m4v",
  "ogg",
  "ogv",
  "avi",
  "mkv",
  "gifv",
]);
export const ATTACHMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;

export function getFileExtension(path: string): string {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1 || lastDot === path.length - 1) {
    return "";
  }
  return path.slice(lastDot + 1).toLowerCase();
}

export function sanitizeAttachmentInput(
  urlValue: unknown,
  typeValue: unknown,
  nameValue: unknown
): SanitizedAttachment | null {
  if (typeof urlValue !== "string") return null;
  const trimmedUrl = urlValue.trim();
  if (!trimmedUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl);
  } catch (_) {
    return null;
  }

  if (
    parsed.protocol !== "https:" &&
    parsed.origin !== new URL(websiteUrl).origin
  ) {
    return null;
  }

  const cleanUrl = parsed.toString();
  let type: AttachmentType;
  if (typeValue === "video") {
    type = "video";
  } else if (typeValue === "image") {
    type = "image";
  } else {
    const ext = getFileExtension(parsed.pathname);
    if (ATTACHMENT_VIDEO_EXTENSIONS.has(ext)) {
      type = "video";
    } else if (ATTACHMENT_IMAGE_EXTENSIONS.has(ext) || ext === "") {
      type = "image";
    } else {
      return null;
    }
  }

  let name = "";
  if (typeof nameValue === "string") {
    name = nameValue.replace(/\r|\n/g, " ").trim();
    if (name.length > 120) {
      name = name.slice(0, 120);
    }
  }

  return { url: cleanUrl, type, name };
}
