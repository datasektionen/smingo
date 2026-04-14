export const DEV_MODE =
  Deno.env.get("DEV_MODE") === "1" || Deno.env.get("NODE_ENV") === "development";

export const websiteUrl = Deno.env.get("WEBSITE_URL") ?? "http://localhost:8080";

export const cookieSecret =
  Deno.env.get("COOKIE_SECRET") ?? (DEV_MODE ? "dev-secret" : undefined);

export const ssoIssuerUrl =
  Deno.env.get("SSO_ISSUER_URL") ?? "https://sso.datasektionen.se/op";

export const ssoClientId =
  Deno.env.get("SSO_CLIENT_ID") ?? (DEV_MODE ? "dev-client-id" : undefined);

export const ssoClientSecret =
  Deno.env.get("SSO_CLIENT_SECRET") ??
    (DEV_MODE ? "dev-client-secret" : undefined);

export const ssoScopes = (Deno.env.get("SSO_SCOPES") ??
  "openid profile email").split(/\s+/).filter(Boolean);

export const ssoRedirectUrl = new URL("/auth/callback", websiteUrl).toString();

if (!DEV_MODE && (!cookieSecret || !ssoClientId || !ssoClientSecret)) {
  console.error(
    "COOKIE_SECRET, SSO_CLIENT_ID, or SSO_CLIENT_SECRET missing in environment",
  );
  Deno.exit(1);
}

export const rfingerApiKey =
  Deno.env.get("RFINGER_API_KEY") ?? (DEV_MODE ? "dev-rfinger-key" : undefined);

export const rfingerApiBaseUrl =
  Deno.env.get("RFINGER_API_BASE_URL") ?? "https://rfinger.datasektionen.se/api";

if (!DEV_MODE && !rfingerApiKey) {
  console.warn("RFINGER_API_KEY not configured; avatars will be unavailable.");
}

export const ssoUserApiUrl =
  Deno.env.get("SSO_USER_API_URL") ?? "http://sso.nomad.dsekt.internal";

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
