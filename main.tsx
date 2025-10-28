// main.tsx — DEV-friendly + SMINGO overlay that retriggers on re-completion
// Multiplier equals the CURRENT number of completed lines (1x, 2x, 3x, ...)

//Läskig AI kod men fixades samma dag som SM

import { Context, Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import Layout from "./components/Layout.tsx";
import HomePage from "./components/HomePage.tsx";
import AdminPage from "./components/AdminPage.tsx";
import cards from "./cards.ts";

// ---- DEV toggle ------------------------------------------------------------
const DEV_MODE =
  Deno.env.get("DEV_MODE") === "1" || Deno.env.get("NODE_ENV") === "development";
// ---------------------------------------------------------------------------

const websiteUrl = Deno.env.get("WEBSITE_URL") ?? "http://localhost:8080";

// In dev, provide safe defaults so you can just run the app.
const cookieSecret =
  Deno.env.get("COOKIE_SECRET") ?? (DEV_MODE ? "dev-secret" : undefined);
const loginApiKey =
  Deno.env.get("LOGIN_API_KEY") ?? (DEV_MODE ? "dev-api-key" : undefined);

if (!DEV_MODE && (!cookieSecret || !loginApiKey)) {
  console.error("COOKIE_SECRET or LOGIN_API_KEY missing in environment");
  Deno.exit(1);
}

const loginRedirectUrl =
  "https://sso.datasektionen.se/legacyapi/login?callback=" +
  encodeURIComponent(websiteUrl + "/callback/");

const adminKthidList =
  Deno.env.get("ADMIN_KTHIDS") ?? (DEV_MODE ? "devuser" : "");
const ADMIN_KTHID_SET = new Set(
  adminKthidList
    .split(/[\s,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

if (!DEV_MODE && ADMIN_KTHID_SET.size === 0) {
  console.warn("ADMIN_KTHIDS not configured; admin access disabled.");
}

function isAllowedAdmin(kthid: string | undefined): boolean {
  if (!kthid) return false;
  if (ADMIN_KTHID_SET.size === 0) return false;
  return ADMIN_KTHID_SET.has(kthid.toLowerCase());
}

const seedMod = 2 ** 35 - 31;
function random(seed: number) {
  const a = 185852;
  let s = seed % seedMod;
  return function () {
    return (s = (s * a) % seedMod) / seedMod;
  };
}

const smingoCss = Deno.readTextFileSync(new URL("./public/smingo.css", import.meta.url));
const smingoJs = Deno.readTextFileSync(new URL("./public/smingo.js", import.meta.url));

const app = new Hono();

interface PlayerSession {
  id: string;
  userId: string;
  kthId: string;
  board: string[];
  clicked: number[];
  connectedAt: number;
  lastUpdate: number;
  bingoCount: number;
}

const playerSessions = new Map<string, PlayerSession>();
const adminSockets = new Set<WebSocket>();
const playerSockets = new Map<string, WebSocket>();
let playerCounter = 0;
const RECENT_CHAT_LIMIT = 50;

interface ChatRecord {
  type: "chat";
  userId: string;
  message: string;
  timestamp: number;
  categories: string[];
}

const recentChatMessages: ChatRecord[] = [];

function normalizeClicked(value: unknown, boardSize: number): number[] {
  if (!Array.isArray(value) || boardSize <= 0) return [];
  const unique = new Set<number>();
  for (const item of value) {
    const num = typeof item === "number" ? item : Number(item);
    if (Number.isInteger(num) && num >= 0 && num < boardSize) {
      unique.add(num);
    }
  }
  return Array.from(unique).sort((a, b) => a - b);
}

function serializePlayers() {
  return Array.from(playerSessions.values())
    .map((session) => ({
      id: session.id,
      userId: session.userId,
      kthId: session.kthId,
      board: session.board,
      clicked: session.clicked,
      connectedAt: session.connectedAt,
      lastUpdate: session.lastUpdate,
      bingoCount: session.bingoCount,
    }))
    .sort((a, b) => {
      const userCompare = a.userId.localeCompare(b.userId);
      if (userCompare !== 0) return userCompare;
      return a.id.localeCompare(b.id);
    });
}

function createAdminPayload() {
  return JSON.stringify({
    type: "active",
    players: serializePlayers(),
  });
}

function computeBingoCount(boardLength: number, clicked: readonly number[]): number {
  const size = Math.sqrt(boardLength);
  if (!Number.isFinite(size) || !Number.isInteger(size) || size <= 0) {
    return 0;
  }
  const n = size;
  const clickedSet = new Set(clicked);
  let count = 0;

  for (let r = 0; r < n; r++) {
    let rowComplete = true;
    for (let c = 0; c < n; c++) {
      if (!clickedSet.has(r * n + c)) {
        rowComplete = false;
        break;
      }
    }
    if (rowComplete) count++;
  }

  for (let c = 0; c < n; c++) {
    let colComplete = true;
    for (let r = 0; r < n; r++) {
      if (!clickedSet.has(r * n + c)) {
        colComplete = false;
        break;
      }
    }
    if (colComplete) count++;
  }

  let diag1Complete = true;
  let diag2Complete = true;
  for (let i = 0; i < n; i++) {
    if (!clickedSet.has(i * n + i)) {
      diag1Complete = false;
    }
    if (!clickedSet.has(i * n + (n - 1 - i))) {
      diag2Complete = false;
    }
  }
  if (diag1Complete) count++;
  if (diag2Complete) count++;

  return count;
}

function sendAdminState(target: WebSocket) {
  const payload = createAdminPayload();
  if (target.readyState === WebSocket.OPEN) {
    target.send(payload);
  } else if (target.readyState === WebSocket.CONNECTING) {
    target.addEventListener(
      "open",
      () => {
        if (target.readyState === WebSocket.OPEN) {
          target.send(payload);
        }
      },
      { once: true },
    );
  }
}

function broadcastAdminState() {
  const payload = createAdminPayload();
  for (const socket of [...adminSockets]) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    } else if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
      adminSockets.delete(socket);
    }
  }
}

function broadcastToPlayers(payload: string) {
  for (const [connectionId, socket] of [...playerSockets]) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    } else if (
      socket.readyState === WebSocket.CLOSING ||
      socket.readyState === WebSocket.CLOSED
    ) {
      playerSockets.delete(connectionId);
    }
  }
}

function broadcastChatMessage(message: ChatRecord) {
  recentChatMessages.push(message);
  if (recentChatMessages.length > RECENT_CHAT_LIMIT) {
    recentChatMessages.splice(0, recentChatMessages.length - RECENT_CHAT_LIMIT);
  }
  broadcastToPlayers(JSON.stringify(message));
}

function createPeerSelectionMap() {
  const map = new Map<string, Map<string, string>>();
  for (const session of playerSessions.values()) {
    if (!Array.isArray(session.board) || session.board.length === 0) continue;
    if (!Array.isArray(session.clicked) || session.clicked.length === 0) continue;
    const clickedSet = new Set(session.clicked);
    for (const idx of clickedSet) {
      if (idx < 0 || idx >= session.board.length) continue;
      const cellValue = session.board[idx];
      if (typeof cellValue !== "string" || cellValue.length === 0) continue;
      let entry = map.get(cellValue);
      if (!entry) {
        entry = new Map();
        map.set(cellValue, entry);
      }
      entry.set(session.kthId, session.userId);
    }
  }
  return map;
}

function broadcastPeerSelections() {
  if (playerSockets.size === 0) return;
  const selectionMap = createPeerSelectionMap();
  const selections: Record<string, { kthId: string; displayName: string }[]> = {};
  for (const [cell, players] of selectionMap.entries()) {
    selections[cell] = Array.from(players.entries()).map(([kthId, displayName]) => ({
      kthId,
      displayName,
    }));
  }
  const payload = JSON.stringify({
    type: "peerSelections",
    selections,
  });
  broadcastToPlayers(payload);
}

function sendChatHistory(target: WebSocket) {
  if (recentChatMessages.length === 0) return;
  const payload = JSON.stringify({
    type: "chatHistory",
    messages: recentChatMessages,
  });
  if (target.readyState === WebSocket.OPEN) {
    target.send(payload);
  } else if (target.readyState === WebSocket.CONNECTING) {
    target.addEventListener(
      "open",
      () => {
        if (target.readyState === WebSocket.OPEN) {
          target.send(payload);
        }
      },
      { once: true },
    );
  }
}

function setupAdminSocket(ws: WebSocket) {
  adminSockets.add(ws);
  const cleanup = () => {
    adminSockets.delete(ws);
  };
  ws.addEventListener("close", cleanup);
  ws.addEventListener("error", cleanup);
  sendAdminState(ws);
}

function setupPlayerSocket(ws: WebSocket) {
  const connectionId = `p-${++playerCounter}`;
  let session: PlayerSession | undefined;

  playerSockets.set(connectionId, ws);

  const cleanup = () => {
    if (session) {
      playerSessions.delete(connectionId);
      session = undefined;
      broadcastAdminState();
      broadcastPeerSelections();
    }
    playerSockets.delete(connectionId);
  };

  ws.addEventListener("close", cleanup);
  ws.addEventListener("error", cleanup);

  ws.addEventListener("message", (event: MessageEvent) => {
    if (typeof event.data !== "string") return;
    let payload: unknown;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (!payload || typeof payload !== "object") return;
    const data = payload as Record<string, unknown>;
    const type = data.type;

    if (type === "hello") {
      const board = Array.isArray(data.board)
        ? data.board.filter((item): item is string => typeof item === "string").slice(0, 25)
        : undefined;
      const clicked = normalizeClicked(data.clicked, board?.length ?? 0);
      const kthId = typeof data.userId === "string" && data.userId.length > 0
        ? data.userId
        : "unknown";
      const displayName = typeof data.displayName === "string" && data.displayName.length > 0
        ? data.displayName
        : kthId;

      if (!board || board.length === 0) return;

      if (!session) {
        session = {
          id: connectionId,
          userId: displayName,
          kthId,
          board,
          clicked,
          connectedAt: Date.now(),
          lastUpdate: Date.now(),
          bingoCount: computeBingoCount(board.length, clicked),
        };
        playerSessions.set(connectionId, session);
      } else {
        session.userId = displayName;
        session.kthId = kthId;
        session.board = board;
        session.clicked = clicked;
        session.lastUpdate = Date.now();
        session.bingoCount = computeBingoCount(session.board.length, session.clicked);
      }

      broadcastAdminState();
      broadcastPeerSelections();
      sendChatHistory(ws);
    } else if (type === "state") {
      if (!session) return;
      const previousBingoCount = session.bingoCount;
      const previousClicked = new Set(session.clicked);
      const nextClicked = normalizeClicked(data.clicked, session.board.length);
      const newCells = nextClicked.filter((index) => !previousClicked.has(index));
      session.clicked = nextClicked;
      session.lastUpdate = Date.now();
      session.bingoCount = computeBingoCount(session.board.length, session.clicked);
      broadcastAdminState();
      broadcastPeerSelections();
      if (newCells.length > 0) {
        for (const idx of newCells) {
          const cellValue = session.board[idx] ?? `Cell ${idx + 1}`;
          const highlightPayload = JSON.stringify({
            type: "highlight",
            userId: session.userId,
            cell: cellValue,
            timestamp: Date.now(),
          });
          broadcastToPlayers(highlightPayload);
        }
      }
      if (session.bingoCount > previousBingoCount) {
        const bingoNumber = session.bingoCount;
        const chatPayload: ChatRecord = {
          type: "chat",
          userId: session.userId,
          message: `${session.userId} got bingo #${bingoNumber}!`,
          timestamp: Date.now(),
          categories: ["bingo"],
        };
        broadcastChatMessage(chatPayload);
      }
    } else if (type === "chat") {
      if (!session) return;
      const rawMessage = typeof data.message === "string" ? data.message : "";
      const message = rawMessage
        .replace(/[\r\n]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, 300);
      if (!message) return;
      const chatPayload: ChatRecord = {
        type: "chat",
        userId: session.userId,
        message,
        timestamp: Date.now(),
        categories: [],
      };
      broadcastChatMessage(chatPayload);
    }
  });
}

app.get("/assets/smingo.css", () =>
  new Response(smingoCss, {
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": DEV_MODE ? "no-store" : "public, max-age=300",
    },
  }),
);

app.get("/assets/smingo.js", () =>
  new Response(smingoJs, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": DEV_MODE ? "no-store" : "public, max-age=300",
    },
  }),
);

app.get("/callback/:code", async (c: Context) => {
  if (DEV_MODE) {
    await setSignedCookie(c, "kthid", "devuser", cookieSecret!);
    return c.redirect("/");
  }

  const code = c.req.param("code");
  const resp = await fetch(
    `https://sso.datasektionen.se/legacyapi/verify/${encodeURIComponent(code)}?api_key=${loginApiKey}`,
  );

  const ct = resp.headers.get("content-type") ?? "";
  if (!resp.ok || !ct.includes("application/json")) {
    const text = await resp.text().catch(() => "");
    return c.text(`Login failed: ${text || resp.statusText}`, 401);
  }

  const { user } = await resp.json();
  await setSignedCookie(c, "kthid", user, cookieSecret!);
  return c.redirect("/");
});

app.get("/", async (c: Context) => {
  const things = cards.toSorted();

  // auth (disabled in dev)
  let kthid: string | undefined;
  if (DEV_MODE) {
    kthid = c.req.query("kthid") || "devuser";
    await setSignedCookie(c, "kthid", kthid, cookieSecret!);
  } else {
    const cookieValue = await getSignedCookie(c, cookieSecret!, "kthid");
    if (typeof cookieValue !== "string") {
      return c.redirect(loginRedirectUrl);
    }
    kthid = cookieValue;
  }

  const userKthId = kthid!;
  const userProfile = {
    kthId: userKthId,
    email: "",
    firstName: "",
    familyName: "",
    yearTag: "",
  };

  if (DEV_MODE) {
    userProfile.email = "dev@example.com";
    userProfile.firstName = "User";
    userProfile.familyName = userKthId;
    userProfile.yearTag = "D00";
  } else {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const directoryUrl =
        "http://sso.nomad.dsekt.internal/api/users?format=single&u=" + encodeURIComponent(userKthId);
      const response = await fetch(directoryUrl, { signal: controller.signal });
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === "object") {
          userProfile.email = typeof data.email === "string" ? data.email.trim() : "";
          userProfile.firstName = typeof data.firstName === "string" ? data.firstName.trim() : "";
          userProfile.familyName = typeof data.familyName === "string" ? data.familyName.trim() : "";
          userProfile.yearTag = typeof data.yearTag === "string" ? data.yearTag.trim() : "";
        }
      } else {
        console.warn("Failed to fetch user profile for", userKthId, response.status, response.statusText);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.warn("Directory lookup failed for", userKthId, error);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

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
  for (const ch of new Date().toDateString()) seed = seed * 256 + ch.charCodeAt(0);

  const rand = random(seed);
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
  let kthid: string | undefined;
  if (DEV_MODE) {
    kthid = c.req.query("kthid") || "devuser";
    await setSignedCookie(c, "kthid", kthid, cookieSecret!);
  } else {
    const cookieValue = await getSignedCookie(c, cookieSecret!, "kthid");
    if (typeof cookieValue !== "string") {
      return c.redirect(loginRedirectUrl);
    }
    kthid = cookieValue;
  }

  if (!isAllowedAdmin(kthid)) {
    return c.text("Forbidden", 403);
  }

  return c.html(
    <Layout>
      <AdminPage />
    </Layout>,
  );
});

app.get("/ws", async (c) => {
  const role = new URL(c.req.url).searchParams.get("role") ?? "player";

  if (role === "admin") {
    const kthid = await getSignedCookie(c, cookieSecret!, "kthid");
    if (typeof kthid !== "string" || !isAllowedAdmin(kthid)) {
      return c.text("Forbidden", 403);
    }
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
