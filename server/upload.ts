import type { Context } from "hono";
import {
  ATTACHMENT_MAX_SIZE_BYTES,
  getFileExtension,
  sanitizeAttachmentInput,
} from "./attachments.ts";
import { websiteUrl } from "./config.ts";

// Local fallback uploads are stored on disk (ephemeral, like the chat history).
// When the total size exceeds the budget, the oldest files are evicted.
const UPLOAD_DIR = await Deno.makeTempDir({ prefix: "smingo-uploads-" });
const UPLOAD_TOTAL_BUDGET_BYTES = 200 * 1024 * 1024;
const UPLOAD_MAX_FILES = 200;

// Only these formats are accepted and served (no SVG/HTML etc.).
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  apng: "image/apng",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  ogv: "video/ogg",
};
// Images in these formats go to freeimage.host (Chevereto API, same as the old
// imgbb integration). Videos, other formats, and failed uploads fall back to
// local storage.
const FREEIMAGE_ENDPOINT = "https://freeimage.host/api/1/upload";
const FREEIMAGE_API_KEY = Deno.env.get("FREEIMAGE_API_KEY") ??
  "6d207e02198a847aa98d0a2a901485a5";
const FREEIMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
]);

async function uploadToFreeimage(file: File): Promise<string> {
  const form = new FormData();
  form.append("key", FREEIMAGE_API_KEY);
  form.append("action", "upload");
  form.append("format", "json");
  form.append("source", file, file.name || "upload");
  try {
    const response = await fetch(FREEIMAGE_ENDPOINT, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json();
    const url = payload?.image?.url;
    if (response.ok && typeof url === "string" && url.startsWith("https://")) {
      return url;
    }
    console.error(
      "freeimage.host rejected upload",
      response.status,
      payload?.error?.message ?? payload,
    );
  } catch (error) {
    console.error("freeimage.host upload failed", error);
  }
  return "";
}

const MIME_TO_EXTENSION: Record<string, string> = {};
for (const [ext, mime] of Object.entries(CONTENT_TYPES)) {
  MIME_TO_EXTENSION[mime] ??= ext;
}

interface StoredUpload {
  filename: string;
  size: number;
}

const storedUploads: StoredUpload[] = [];
let storedBytes = 0;

async function evictOldUploads() {
  while (
    storedUploads.length > UPLOAD_MAX_FILES ||
    storedBytes > UPLOAD_TOTAL_BUDGET_BYTES
  ) {
    const oldest = storedUploads.shift();
    if (!oldest) break;
    storedBytes -= oldest.size;
    try {
      await Deno.remove(`${UPLOAD_DIR}/${oldest.filename}`);
    } catch (error) {
      console.error("Failed to remove old upload", oldest.filename, error);
    }
  }
}

export async function handleUploadRequest(c: Context): Promise<Response> {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (error) {
    console.error("Failed to parse upload form data", error);
    return c.json({ error: "Invalid upload payload." }, 400);
  }

  const pickFile = (value: FormDataEntryValue | null): File | null => {
    if (!value) return null;
    if (value instanceof File) return value;
    return null;
  };

  const fileEntry = pickFile(form.get("attachment")) ??
    pickFile(form.get("file")) ??
    pickFile(form.get("source"));

  if (!(fileEntry instanceof File)) {
    return c.json({ error: "No file provided." }, 400);
  }

  if (!fileEntry.size) {
    return c.json({ error: "File is empty." }, 400);
  }

  if (fileEntry.size > ATTACHMENT_MAX_SIZE_BYTES) {
    return c.json(
      {
        error: `Attachment is too large. Max ${
          Math.round(
            ATTACHMENT_MAX_SIZE_BYTES / (1024 * 1024),
          )
        } MB.`,
      },
      413,
    );
  }

  const mimeType = typeof fileEntry.type === "string" ? fileEntry.type : "";
  let extension = getFileExtension(fileEntry.name || "");
  if (!CONTENT_TYPES[extension]) {
    extension = MIME_TO_EXTENSION[mimeType] ?? "";
  }
  if (!extension) {
    return c.json({ error: "Only images or videos are allowed." }, 415);
  }

  const isVideo = CONTENT_TYPES[extension].startsWith("video/");
  let url = FREEIMAGE_EXTENSIONS.has(extension)
    ? await uploadToFreeimage(fileEntry)
    : "";

  if (!url) {
    const filename = `${crypto.randomUUID()}.${extension}`;
    try {
      await Deno.writeFile(`${UPLOAD_DIR}/${filename}`, fileEntry.stream());
    } catch (error) {
      console.error("Failed to store upload", error);
      return c.json({ error: "Failed to store the attachment." }, 500);
    }
    storedUploads.push({ filename, size: fileEntry.size });
    storedBytes += fileEntry.size;
    await evictOldUploads();
    url = new URL(`/uploads/${filename}`, websiteUrl).toString();
  }

  const sanitized = sanitizeAttachmentInput(
    url,
    isVideo ? "video" : "image",
    fileEntry.name,
  );
  if (!sanitized) {
    return c.json({ error: "Failed to store the attachment." }, 500);
  }

  return c.json({
    url: sanitized.url,
    type: sanitized.type,
    name: sanitized.name ||
      (typeof fileEntry.name === "string" ? fileEntry.name : ""),
  });
}

export async function handleUploadedFileRequest(
  c: Context,
): Promise<Response> {
  const filename = c.req.param("filename") ?? "";
  const match = /^[0-9a-f-]{36}\.([a-z0-9]+)$/.exec(filename);
  const contentType = match ? CONTENT_TYPES[match[1]] : undefined;
  if (!contentType) return c.notFound();

  let file: Deno.FsFile;
  try {
    file = await Deno.open(`${UPLOAD_DIR}/${filename}`, { read: true });
  } catch {
    return c.notFound();
  }
  const { size } = await file.stat();
  return new Response(file.readable, {
    headers: {
      "content-type": contentType,
      "content-length": String(size),
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
