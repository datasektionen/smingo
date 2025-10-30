export const DEV_MODE =
  Deno.env.get("DEV_MODE") === "1" || Deno.env.get("NODE_ENV") === "development";

export const websiteUrl = Deno.env.get("WEBSITE_URL") ?? "http://localhost:8080";

export const cookieSecret =
  Deno.env.get("COOKIE_SECRET") ?? (DEV_MODE ? "dev-secret" : undefined);

export const loginApiKey =
  Deno.env.get("LOGIN_API_KEY") ?? (DEV_MODE ? "dev-api-key" : undefined);

if (!DEV_MODE && (!cookieSecret || !loginApiKey)) {
  console.error("COOKIE_SECRET or LOGIN_API_KEY missing in environment");
  Deno.exit(1);
}

export const loginRedirectUrl =
  "https://sso.datasektionen.se/legacyapi/login?callback=" +
  encodeURIComponent(websiteUrl + "/callback/");

const adminKthidList =
  Deno.env.get("ADMIN_KTHIDS") ?? (DEV_MODE ? "devuser" : "");

export const ADMIN_KTHID_SET = new Set(
  adminKthidList
    .split(/[\s,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

if (!DEV_MODE && ADMIN_KTHID_SET.size === 0) {
  console.warn("ADMIN_KTHIDS not configured; admin access disabled.");
}

export function isAllowedAdmin(kthid: string | undefined): boolean {
  if (!kthid) return false;
  if (ADMIN_KTHID_SET.size === 0) return false;
  return ADMIN_KTHID_SET.has(kthid.toLowerCase());
}

export const DEFAULT_DEV_USER = "devuser";
