import type { Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import type { UserProfile } from "../shared/types.ts";
import {
  ADMIN_KTHID_SET,
  DEFAULT_DEV_USER,
  DEV_MODE,
  cookieSecret,
  isAllowedAdmin,
  loginApiKey,
  loginRedirectUrl,
} from "./config.ts";

export async function ensurePlayerSession(
  c: Context,
): Promise<{ kthid: string } | Response> {
  if (DEV_MODE) {
    const kthid = c.req.query("kthid") || DEFAULT_DEV_USER;
    await setSignedCookie(c, "kthid", kthid, cookieSecret!);
    return { kthid };
  }

  const cookieValue = await getSignedCookie(c, cookieSecret!, "kthid");
  if (typeof cookieValue !== "string") {
    return c.redirect(loginRedirectUrl);
  }

  return { kthid: cookieValue };
}

export async function ensureAdminSession(
  c: Context,
): Promise<{ kthid: string } | Response> {
  const result = await ensurePlayerSession(c);
  if (result instanceof Response) {
    return result;
  }

  if (!isAllowedAdmin(result.kthid)) {
    return c.text("Forbidden", 403);
  }

  return result;
}

export async function resolveUserProfile(kthId: string): Promise<UserProfile> {
  const profile: UserProfile = {
    kthId,
    email: "",
    firstName: "",
    familyName: "",
    yearTag: "",
  };

  if (DEV_MODE) {
    profile.email = "dev@example.com";
    profile.firstName = "User";
    profile.familyName = kthId;
    profile.yearTag = "D00";
    return profile;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const directoryUrl =
      "http://sso.nomad.dsekt.internal/api/users?format=single&u=" +
      encodeURIComponent(kthId);
    const response = await fetch(directoryUrl, { signal: controller.signal });
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data === "object") {
        profile.email = typeof data.email === "string" ? data.email.trim() : "";
        profile.firstName = typeof data.firstName === "string"
          ? data.firstName.trim()
          : "";
        profile.familyName = typeof data.familyName === "string"
          ? data.familyName.trim()
          : "";
        profile.yearTag = typeof data.yearTag === "string"
          ? data.yearTag.trim()
          : "";
      }
    } else {
      console.warn(
        "Failed to fetch user profile for",
        kthId,
        response.status,
        response.statusText,
      );
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      console.warn("Directory lookup failed for", kthId, error);
    }
  } finally {
    clearTimeout(timeout);
  }

  return profile;
}

export async function verifyLegacyLogin(code: string): Promise<
  { success: true; kthid: string } | { success: false; message: string }
> {
  if (DEV_MODE) {
    return { success: true, kthid: DEFAULT_DEV_USER };
  }

  if (!loginApiKey) {
    return { success: false, message: "LOGIN_API_KEY not configured." };
  }

  const resp = await fetch(
    `https://sso.datasektionen.se/legacyapi/verify/${encodeURIComponent(code)}?api_key=${loginApiKey}`,
  );

  const ct = resp.headers.get("content-type") ?? "";
  if (!resp.ok || !ct.includes("application/json")) {
    const text = await resp.text().catch(() => "");
    return {
      success: false,
      message: `Login failed: ${text || resp.statusText}`,
    };
  }

  const body = await resp.json();
  const user = body?.user;
  if (typeof user !== "string" || !user) {
    return { success: false, message: "Login failed: invalid response" };
  }

  return { success: true, kthid: user };
}

export function getAdminCount() {
  return ADMIN_KTHID_SET.size;
}
