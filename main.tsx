// main.tsx — DEV-friendly + SMINGO overlay that retriggers on re-completion
// Multiplier equals the CURRENT number of completed lines (1x, 2x, 3x, ...)

//Läskig AI kod men fixades samma dag som SM

import { Context, Hono } from "hono";
import { setSignedCookie } from "hono/cookie";
import Layout from "./components/Layout.tsx";
import HomePage from "./components/HomePage.tsx";
import AdminPage from "./components/AdminPage.tsx";
import TalmanPage from "./components/TalmanPage.tsx";
import cardsVM from "./cards-VM.ts";
import cardsSM from "./cards-SM.ts";
import { setupAdminSocket, setupPlayerSocket } from "./server/chat.ts";
import { handleUploadRequest } from "./server/upload.ts";
import { cookieSecret, DEV_MODE, loginRedirectUrl } from "./server/config.ts";
import {
  ensureAdminSession,
  ensurePlayerSession,
  resolveUserProfile,
  verifyLegacyLogin,
} from "./server/auth.ts";
import { createSeededRandom } from "./server/random.ts";

// Global configuration state
let currentCardSet: "VM" | "SM" = "SM"; // Default to SM

const smingoCss = Deno.readTextFileSync(
  new URL("./public/smingo.css", import.meta.url),
);
const smingoJs = Deno.readTextFileSync(
  new URL("./public/smingo.js", import.meta.url),
);
const chatAppJs = Deno.readTextFileSync(
  new URL("./public/js/chat-app.js", import.meta.url),
);
const adminAppJs = Deno.readTextFileSync(
  new URL("./public/js/admin-app.js", import.meta.url),
);
const talmanAppJs = Deno.readTextFileSync(
  new URL("./public/js/talman-app.js", import.meta.url),
);

const app = new Hono();

app.post("/api/upload", async (c: Context) => {
  const session = await ensurePlayerSession(c);
  if (session instanceof Response) return session;
  return handleUploadRequest(c);
});

// API endpoints for card set management
app.get("/api/cardset", async (c: Context) => {
  const session = await ensureAdminSession(c);
  if (session instanceof Response) return session;
  return c.json({ cardSet: currentCardSet });
});

app.post("/api/cardset", async (c: Context) => {
  const session = await ensureAdminSession(c);
  if (session instanceof Response) return session;
  
  const body = await c.req.json();
  if (body.cardSet === "SM" || body.cardSet === "VM") {
    currentCardSet = body.cardSet;
    return c.json({ success: true, cardSet: currentCardSet });
  }
  return c.json({ success: false, error: "Invalid card set" }, 400);
});

app.get("/assets/smingo.css", () =>
  new Response(smingoCss, {
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": DEV_MODE ? "no-store" : "public, max-age=300",
    },
  }));

app.get("/assets/smingo.js", () =>
  new Response(smingoJs, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": DEV_MODE ? "no-store" : "public, max-age=300",
    },
  }));

app.get("/assets/chat-app.js", () =>
  new Response(chatAppJs, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": DEV_MODE ? "no-store" : "public, max-age=300",
    },
  }));

app.get("/assets/admin-app.js", () =>
  new Response(adminAppJs, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": DEV_MODE ? "no-store" : "public, max-age=300",
    },
  }));

app.get("/assets/talman-app.js", () =>
  new Response(talmanAppJs, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": DEV_MODE ? "no-store" : "public, max-age=300",
    },
  }));
// Serve media files (like SMingo.mp3)
app.get("/media/:filename", async (c: Context) => {
  const filename = c.req.param("filename");
  try {
    const filePath = new URL(`./media/${filename}`, import.meta.url);
    const file = await Deno.readFile(filePath);

    // Determine content type based on file extension
    let contentType = "application/octet-stream";
    if (filename.endsWith(".mp3")) {
      contentType = "audio/mpeg";
    } else if (filename.endsWith(".wav")) {
      contentType = "audio/wav";
    } else if (filename.endsWith(".ogg")) {
      contentType = "audio/ogg";
    }

    return new Response(file, {
      headers: {
        "content-type": contentType,
        "cache-control": DEV_MODE ? "no-store" : "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error(`Failed to serve media file ${filename}:`, error);
    return new Response("File not found", { status: 404 });
  }
});

app.get("/callback/:code", async (c: Context) => {
  const code = c.req.param("code");
  const result = await verifyLegacyLogin(code);
  if (!result.success) {
    return c.text(result.message, 401);
  }
  await setSignedCookie(c, "kthid", result.kthid, cookieSecret!);
  return c.redirect("/");
});

app.get("/", async (c: Context) => {
  const cards = currentCardSet === "SM" ? cardsSM : cardsVM;
  const things = cards.toSorted();

  const session = await ensurePlayerSession(c);
  if (session instanceof Response) return session;

  const userKthId = session.kthid;
  const userProfile = await resolveUserProfile(userKthId);

  const baseName = [userProfile.firstName, userProfile.familyName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const nameWithoutYear = baseName || userKthId;
  const userDisplayName = userProfile.yearTag
    ? `${nameWithoutYear} (${userProfile.yearTag})`
    : nameWithoutYear;
  const stuff: string[] = [];
  let seed = 0;
  for (const ch of userKthId) seed = seed * 256 + ch.charCodeAt(0);
  for (const ch of new Date().toDateString()) {
    seed = seed * 256 + ch.charCodeAt(0);
  }

  const rand = createSeededRandom(seed);
  while (stuff.length < 25) {
    const [picked] = things.splice(Math.floor(rand() * things.length), 1);
    stuff.push(picked);
  }
  const localStorageIdent = Math.floor(rand() * 10000);

  return c.html(
    <Layout>
      <HomePage
        title={`SMingo ${DEV_MODE ? "(DEV)" : ""}`}
        cells={stuff}
        localStorageIdent={localStorageIdent}
        userId={userKthId}
        userDisplayName={userDisplayName}
        userProfile={userProfile}
      />
    </Layout>,
  );
});

app.get("/admin", async (c: Context) => {
  const session = await ensureAdminSession(c);
  if (session instanceof Response) return session;

  return c.html(
    <Layout>
      <AdminPage />
    </Layout>,
  );
});

app.get("/talman", async (c: Context) => {
  const session = await ensurePlayerSession(c);
  if (session instanceof Response) return session;

  return c.html(
    <Layout>
      <TalmanPage />
    </Layout>,
  );
});

app.get("/ws", async (c) => {
  const role = new URL(c.req.url).searchParams.get("role") ?? "player";

  if (role === "admin") {
    const auth = await ensureAdminSession(c);
    if (auth instanceof Response) return auth;
  }

  try {
    const { response, socket } = Deno.upgradeWebSocket(c.req.raw);
    if (role === "admin") {
      setupAdminSocket(socket);
    } else {
      setupPlayerSocket(socket);
    }
    return response;
  } catch (err) {
    console.error("Failed to upgrade websocket", err);
    return c.text("WebSocket upgrade failed", 400);
  }
});

const port = Number(Deno.env.get("PORT") ?? "8080");
Deno.serve({ port }, app.fetch);
