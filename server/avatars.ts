import { rfingerApiBaseUrl, rfingerApiKey } from "./config.ts";

const RFINGER_TIMEOUT_MS = 5000;

export async function fetchAvatarUrl(
  kthid: string,
  quality: boolean,
): Promise<string | null> {
  if (!rfingerApiKey) {
    return null;
  }
  const trimmed = kthid.trim();
  if (!trimmed) return null;

  const base = rfingerApiBaseUrl.endsWith("/")
    ? rfingerApiBaseUrl.slice(0, -1)
    : rfingerApiBaseUrl;
  const url = new URL(`${base}/${encodeURIComponent(trimmed)}`);
  url.searchParams.set("quality", quality ? "true" : "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RFINGER_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      headers: {
        authorization: `Bearer ${rfingerApiKey}`,
      },
      signal: controller.signal,
    });
    if (!resp.ok) {
      return null;
    }
    const text = (await resp.text()).trim();
    return text || null;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      console.warn("Failed to fetch avatar url from rfinger", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
