import type { Context } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import {
  ATTACHMENT_ALLOWED_MIME_PREFIXES,
  ATTACHMENT_IMAGE_EXTENSIONS,
  ATTACHMENT_MAX_SIZE_BYTES,
  ATTACHMENT_VIDEO_EXTENSIONS,
  IMAGE_UPLOAD_ENDPOINT,
  IMAGE_UPLOAD_KEY,
  extractUploadError,
  extractUploadUrl,
  getFileExtension,
  sanitizeAttachmentInput,
} from "./attachments.ts";

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

  const fileEntry =
    pickFile(form.get("attachment")) ?? pickFile(form.get("file")) ?? pickFile(form.get("source"));

  if (!(fileEntry instanceof File)) {
    return c.json({ error: "No file provided." }, 400);
  }

  if (!fileEntry.size) {
    return c.json({ error: "File is empty." }, 400);
  }

  if (fileEntry.size > ATTACHMENT_MAX_SIZE_BYTES) {
    return c.json(
      {
        error: `Attachment is too large. Max ${Math.round(ATTACHMENT_MAX_SIZE_BYTES / (1024 * 1024))} MB.`,
      },
      413,
    );
  }

  const mimeType = typeof fileEntry.type === "string" ? fileEntry.type : "";
  const extension = getFileExtension(fileEntry.name || "");
  const mimeAllowed =
    mimeType && ATTACHMENT_ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
  const extAllowed = extension
    ? ATTACHMENT_IMAGE_EXTENSIONS.has(extension) || ATTACHMENT_VIDEO_EXTENSIONS.has(extension)
    : false;

  if (!mimeAllowed && !extAllowed) {
    return c.json({ error: "Only images or videos are allowed." }, 415);
  }

  const forwardForm = new FormData();
  forwardForm.append("action", "upload");
  forwardForm.append("key", IMAGE_UPLOAD_KEY);
  forwardForm.append("format", "json");
  forwardForm.append("source", fileEntry, fileEntry.name || "upload");

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(IMAGE_UPLOAD_ENDPOINT, {
      method: "POST",
      body: forwardForm,
    });
  } catch (error) {
    console.error("Image upload upstream request failed", error);
    return c.json({ error: "Failed to contact the image host." }, 502);
  }

  let upstreamPayload: unknown;
  try {
    upstreamPayload = await upstreamResponse.json();
  } catch (error) {
    console.error("Image upload upstream response not JSON", error);
    return c.json({ error: "Unexpected response from the image host." }, 502);
  }

  const upstreamStatus =
    upstreamPayload && typeof upstreamPayload === "object"
      ? (upstreamPayload as Record<string, unknown>).status_code
      : undefined;
  const upstreamError = extractUploadError(upstreamPayload);

  if (!upstreamResponse.ok || (typeof upstreamStatus === "number" && upstreamStatus >= 300) || upstreamError) {
    console.error(
      "Image upload upstream returned error",
      upstreamResponse.status,
      upstreamResponse.statusText,
      upstreamError,
    );
    const status = (upstreamResponse.ok ? 502 : upstreamResponse.status) as StatusCode;
    c.status(status);
    return c.json({ error: upstreamError || "Upload was rejected by the image host." });
  }

  const url = extractUploadUrl(upstreamPayload);
  if (!url) {
    console.error("Image upload upstream missing URL", upstreamPayload);
    return c.json({ error: "Image host did not return a usable URL." }, 502);
  }

  const sanitized = sanitizeAttachmentInput(
    url,
    mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "image" : extension,
    fileEntry.name,
  );
  if (!sanitized) {
    console.error("Image upload URL failed sanitization", url);
    return c.json({ error: "Image host returned an unsupported URL." }, 502);
  }

  return c.json({
    url: sanitized.url,
    type: sanitized.type,
    name: sanitized.name || (typeof fileEntry.name === "string" ? fileEntry.name : ""),
  });
}
