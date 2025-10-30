export type AttachmentType = "image" | "video";

export interface SanitizedAttachment {
  url: string;
  type: AttachmentType;
  name: string;
}

export const ATTACHMENT_HOSTNAME = "imgcdn.dev";
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
export const ATTACHMENT_MAX_SIZE_BYTES = 25 * 1024 * 1024;
export const IMAGE_UPLOAD_ENDPOINT = "https://imgcdn.dev/api/1/upload";
export const IMAGE_UPLOAD_KEY = "5386e05a3562c7a8f984e73401540836";

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
  nameValue: unknown,
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

  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== ATTACHMENT_HOSTNAME && !host.endsWith(`.${ATTACHMENT_HOSTNAME}`)) {
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

export function extractUploadUrl(payload: unknown): string {
  if (!payload || typeof payload !== "object" || payload === null) {
    return "";
  }
  const record = payload as Record<string, unknown>;
  const directCandidates = [record.url, record.display_url, record.url_viewer];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.startsWith("http")) {
      return candidate;
    }
  }

  const nestedKeys = ["image", "data", "upload", "medium", "thumb"];
  for (const key of nestedKeys) {
    const nested = record[key];
    const nestedUrl = extractUploadUrl(nested);
    if (nestedUrl) return nestedUrl;
  }

  const images = record.images;
  if (Array.isArray(images)) {
    for (const entry of images) {
      const nestedUrl = extractUploadUrl(entry);
      if (nestedUrl) return nestedUrl;
    }
  }

  return "";
}

export function extractUploadError(payload: unknown): string {
  if (!payload || typeof payload !== "object" || payload === null) {
    return "";
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error) {
    return record.error;
  }
  if (record.error && typeof record.error === "object" && record.error !== null) {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message) {
      return nested.message;
    }
  }
  if (typeof record.message === "string" && record.message) {
    return record.message;
  }
  if (typeof record.status_txt === "string" && record.status_txt) {
    return record.status_txt;
  }
  return "";
}
