import { sanitizeAttachmentInput } from "./attachments.ts";

export interface PlayerSession {
  id: string;
  userId: string;
  kthId: string;
  board: string[];
  clicked: number[];
  connectedAt: number;
  lastUpdate: number;
  bingoCount: number;
}

export interface ChatRecord {
  type: "chat";
  userId: string;
  kthId: string;
  message: string;
  timestamp: number;
  categories: string[];
  attachmentUrl?: string;
  attachmentType?: "image" | "video";
  attachmentName?: string;
}

const playerSessions = new Map<string, PlayerSession>();
const adminSockets = new Set<WebSocket>();
const playerSockets = new Map<string, WebSocket>();
let playerCounter = 0;

const RECENT_CHAT_LIMIT = 50;
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

function serializeLeaderboard() {
  return Array.from(playerSessions.values())
    .map((session) => ({
      userId: session.userId,
      kthId: session.kthId,
      bingoCount: session.bingoCount,
      boxCount: session.clicked.length,
      board: Array.isArray(session.board) ? session.board.slice() : [],
      clicked: Array.isArray(session.clicked) ? session.clicked.slice() : [],
    }))
    .sort((a, b) => {
      if (b.bingoCount !== a.bingoCount) return b.bingoCount - a.bingoCount;
      if (b.boxCount !== a.boxCount) return b.boxCount - a.boxCount;
      return a.userId.localeCompare(b.userId);
    });
}

function createLeaderboardPayload() {
  return JSON.stringify({
    type: "leaderboard",
    players: serializeLeaderboard(),
    updatedAt: Date.now(),
  });
}

function computeBingoCount(
  boardLength: number,
  clicked: readonly number[],
): number {
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

export function broadcastAdminState() {
  const payload = createAdminPayload();
  for (const socket of [...adminSockets]) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    } else if (
      socket.readyState === WebSocket.CLOSING ||
      socket.readyState === WebSocket.CLOSED
    ) {
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

export function broadcastChatMessage(message: ChatRecord) {
  recentChatMessages.push(message);
  if (recentChatMessages.length > RECENT_CHAT_LIMIT) {
    recentChatMessages.splice(0, recentChatMessages.length - RECENT_CHAT_LIMIT);
  }
  broadcastToPlayers(JSON.stringify(message));
}

function broadcastLeaderboard() {
  if (playerSockets.size === 0) return;
  const payload = createLeaderboardPayload();
  broadcastToPlayers(payload);
}

function createPeerSelectionMap() {
  const map = new Map<string, Map<string, string>>();
  for (const session of playerSessions.values()) {
    if (!Array.isArray(session.board) || session.board.length === 0) continue;
    if (!Array.isArray(session.clicked) || session.clicked.length === 0) {
      continue;
    }
    const clickedSet = new Set(session.clicked);
    for (const idx of clickedSet) {
      if (idx < 0 || idx >= session.board.length) continue;
      const cellValue = session.board[idx];
      if (typeof cellValue !== "string" || cellValue.length === 0) continue;
      let entry = map.get(cellValue);
      if (!entry) {
        entry = new Map<string, string>();
        map.set(cellValue, entry);
      }
      entry.set(session.kthId, session.userId);
    }
  }
  return map;
}

export function broadcastPeerSelections() {
  if (playerSockets.size === 0) return;
  const selectionMap = createPeerSelectionMap();
  const selections: Record<string, { kthId: string; displayName: string }[]> =
    {};
  for (const [cell, players] of selectionMap.entries()) {
    selections[cell] = Array.from(players.entries()).map((
      [kthId, displayName],
    ) => ({
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

export function sendChatHistory(target: WebSocket) {
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

export function setupAdminSocket(ws: WebSocket) {
  adminSockets.add(ws);
  const cleanup = () => {
    adminSockets.delete(ws);
  };
  ws.addEventListener("close", cleanup);
  ws.addEventListener("error", cleanup);
  sendAdminState(ws);
}

export function setupPlayerSocket(ws: WebSocket) {
  const connectionId = `p-${++playerCounter}`;
  let session: PlayerSession | undefined;

  playerSockets.set(connectionId, ws);

  const cleanup = () => {
    if (session) {
      playerSessions.delete(connectionId);
      session = undefined;
      broadcastAdminState();
      broadcastPeerSelections();
      broadcastLeaderboard();
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
        ? data.board.filter((item): item is string => typeof item === "string")
          .slice(0, 25)
        : undefined;
      const clicked = normalizeClicked(data.clicked, board?.length ?? 0);
      const kthId = typeof data.userId === "string" && data.userId.length > 0
        ? data.userId
        : "unknown";
      const displayName =
        typeof data.displayName === "string" && data.displayName.length > 0
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
        session.bingoCount = computeBingoCount(
          session.board.length,
          session.clicked,
        );
      }

      broadcastAdminState();
      broadcastPeerSelections();
      broadcastLeaderboard();
      sendChatHistory(ws);
    } else if (type === "state") {
      if (!session) return;
      const previousBingoCount = session.bingoCount;
      const previousClicked = new Set(session.clicked);
      const nextClicked = normalizeClicked(data.clicked, session.board.length);
      const newCells = nextClicked.filter((index) =>
        !previousClicked.has(index)
      );
      session.clicked = nextClicked;
      session.lastUpdate = Date.now();
      session.bingoCount = computeBingoCount(
        session.board.length,
        session.clicked,
      );
      broadcastAdminState();
      broadcastPeerSelections();
      broadcastLeaderboard();
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
          userId: "",
          kthId: session.kthId,
          message: `${session.userId} got bingo #${bingoNumber}!`,
          timestamp: Date.now(),
          categories: ["bingo"],
        };
        broadcastChatMessage(chatPayload);
      }
    } else if (type === "chat") {
      if (!session) return;
      const rawMessage = typeof data.message === "string" ? data.message : "";
      const attachment = sanitizeAttachmentInput(
        data.attachmentUrl,
        data.attachmentType,
        data.attachmentName,
      );
      const message = rawMessage
        .replace(/[\r\n]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, 300);
      if (!message && !attachment) return;
      const chatPayload: ChatRecord = {
        type: "chat",
        userId: session.userId,
        kthId: session.kthId,
        message,
        timestamp: Date.now(),
        categories: [],
      };
      if (attachment) {
        chatPayload.attachmentUrl = attachment.url;
        chatPayload.attachmentType = attachment.type;
        if (attachment.name) {
          chatPayload.attachmentName = attachment.name;
        }
      }
      broadcastChatMessage(chatPayload);
    }
  });
}

export function getActivePlayerCount() {
  return playerSessions.size;
}
