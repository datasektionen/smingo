import type { Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import type { UserProfile } from "../shared/types.ts";
import {
  ADMIN_KTHID_SET,
  DEFAULT_DEV_USER,
  DEV_MODE,
  cookieSecret,
  isAllowedAdmin,
  ssoClientId,
  ssoClientSecret,
  ssoIssuerUrl,
  ssoRedirectUrl,
  ssoScopes,
  ssoUserApiUrl,
} from "./config.ts";

const LOGIN_STATE_COOKIE = "login_state";
const LOGIN_STATE_TTL_SECONDS = 10 * 60;

type OidcConfig = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
};

let oidcConfigPromise: Promise<OidcConfig> | null = null;

async function getOidcConfig(): Promise<OidcConfig> {
  if (!oidcConfigPromise) {
    const base = ssoIssuerUrl.endsWith("/") ? ssoIssuerUrl : `${ssoIssuerUrl}/`;
    const wellKnownUrl = new URL(".well-known/openid-configuration", base)
      .toString();
    oidcConfigPromise = fetch(wellKnownUrl)
      .then(async (resp) => {
        if (!resp.ok) {
          throw new Error(
            `OIDC discovery failed: ${resp.status} ${resp.statusText}`,
          );
        }
        const data = await resp.json();
        return {
          authorization_endpoint: data.authorization_endpoint,
          token_endpoint: data.token_endpoint,
          userinfo_endpoint: data.userinfo_endpoint,
        };
      })
      .catch((error) => {
        oidcConfigPromise = null;
        throw error;
      });
  }
  return oidcConfigPromise;
}

function buildLoginUrl(config: OidcConfig, state: string): string {
  const url = new URL(config.authorization_endpoint);
  url.searchParams.set("client_id", ssoClientId!);
  url.searchParams.set("redirect_uri", ssoRedirectUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ssoScopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function getSessionKthId(c: Context): Promise<string | null> {
  const cookieValue = await getSignedCookie(c, cookieSecret!, "kthid");
  return typeof cookieValue === "string" ? cookieValue : null;
}

export async function ensurePlayerSession(
  c: Context,
): Promise<{ kthid: string } | Response> {
  if (DEV_MODE) {
    const kthid = c.req.query("kthid") || DEFAULT_DEV_USER;
    await setSignedCookie(c, "kthid", kthid, cookieSecret!);
    return { kthid };
  }

  const cookieValue = await getSessionKthId(c);
  if (!cookieValue) {
    const state = crypto.randomUUID();
    await setSignedCookie(c, LOGIN_STATE_COOKIE, state, cookieSecret!, {
      httpOnly: true,
      sameSite: "Lax",
      secure: !DEV_MODE,
      maxAge: LOGIN_STATE_TTL_SECONDS,
      path: "/",
    });
    try {
      const oidcConfig = await getOidcConfig();
      return c.redirect(buildLoginUrl(oidcConfig, state));
    } catch (error) {
      console.error("Failed to build login redirect", error);
      return c.text("Login unavailable", 503);
    }
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
      `${ssoUserApiUrl}/api/users?format=single&u=${encodeURIComponent(kthId)}`;
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

export async function verifyOidcLogin(
  c: Context,
  code: string | undefined,
  state: string | undefined,
): Promise<{ success: true; kthid: string } | { success: false; message: string }> {
  if (DEV_MODE) {
    return { success: true, kthid: DEFAULT_DEV_USER };
  }

  if (!code || !state) {
    return { success: false, message: "Login failed: missing code or state." };
  }

  const expectedState = await getSignedCookie(
    c,
    cookieSecret!,
    LOGIN_STATE_COOKIE,
  );
  if (typeof expectedState !== "string" || expectedState !== state) {
    return { success: false, message: "Login failed: invalid state." };
  }

  await setSignedCookie(c, LOGIN_STATE_COOKIE, "", cookieSecret!, {
    httpOnly: true,
    sameSite: "Lax",
    secure: !DEV_MODE,
    maxAge: 0,
    path: "/",
  });

  if (!ssoClientId || !ssoClientSecret) {
    return { success: false, message: "SSO client not configured." };
  }

  let oidcConfig: OidcConfig;
  try {
    oidcConfig = await getOidcConfig();
  } catch (error) {
    return {
      success: false,
      message: `Login failed: ${error instanceof Error ? error.message : "OIDC discovery failed"}`,
    };
  }

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: ssoRedirectUrl,
  });

  const tokenResp = await fetch(oidcConfig.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "authorization": `Basic ${btoa(`${ssoClientId}:${ssoClientSecret}`)}`,
    },
    body: tokenBody,
  });

  if (!tokenResp.ok) {
    const text = await tokenResp.text().catch(() => "");
    return {
      success: false,
      message: `Login failed: ${text || tokenResp.statusText}`,
    };
  }

  const tokenJson = await tokenResp.json();
  const accessToken = tokenJson?.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    return { success: false, message: "Login failed: missing access token." };
  }

  const userinfoResp = await fetch(oidcConfig.userinfo_endpoint, {
    headers: {
      "authorization": `Bearer ${accessToken}`,
    },
  });

  if (!userinfoResp.ok) {
    const text = await userinfoResp.text().catch(() => "");
    return {
      success: false,
      message: `Login failed: ${text || userinfoResp.statusText}`,
    };
  }

  const userinfo = await userinfoResp.json();
  const kthid = typeof userinfo?.sub === "string"
    ? userinfo.sub
    : typeof userinfo?.kthid === "string"
    ? userinfo.kthid
    : "";

  if (!kthid) {
    return { success: false, message: "Login failed: missing user id." };
  }

  return { success: true, kthid };
}

export function getAdminCount() {
  return ADMIN_KTHID_SET.size;
}
