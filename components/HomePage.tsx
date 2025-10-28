import type { FC } from "hono/jsx";
import ChatPanel from "./ChatPanel.tsx";

interface UserProfile {
  kthId: string;
  email: string;
  firstName: string;
  familyName: string;
  yearTag: string;
}

interface HomePageProps {
  title: string;
  cells: readonly string[];
  localStorageIdent: number;
  userId: string;
  userDisplayName: string;
  userProfile: UserProfile;
}

const HomePage: FC<HomePageProps> = ({
  title,
  cells,
  localStorageIdent,
  userId,
  userDisplayName,
  userProfile,
}) => {
  const configJson = JSON.stringify({
    userId,
    userDisplayName,
    localStorageIdent,
    cells,
    userProfile,
  });

  return (
    <div class="home-content">
      <div
        id="highlightBanner"
        class="highlight-banner"
        aria-live="polite"
        aria-atomic="true"
      ></div>
      <header class="home-header">
        <div class="player-meta">
          <span>
            Logged in as <strong>{userDisplayName}</strong>
          </span>
        </div>
      </header>
      <div class="home-columns">
        <ChatPanel userId={userDisplayName} />
        <main class="board-column board-grid">
          {cells.map((thing, i) => (
            <button
              class="cell"
              _={`
                on click
                  toggle .checked on me
                  then set localStorage.clicked${localStorageIdent}_${i} to me matches .checked
                  then call window.checkBingo()
                  then if window.smingoSendState
                    call window.smingoSendState()
                  end
                end
                on load
                  if localStorage.clicked${localStorageIdent}_${i} == "true"
                    add .checked to me
                  end
                  call window.checkBingo()
                end
              `}
            >
              {thing}
            </button>
          ))}
        </main>
      </div>
      <script
        type="module"
        dangerouslySetInnerHTML={{
          __html: `(() => {
  const config = ${configJson};
  const socketUrl = (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + "/ws?role=player";
  let socket = null;
  let reconnectTimer = null;
  let latestClicked = readFromStorage();
  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatStatus = document.getElementById("chatStatus");
  const chatPlaceholder = chatMessages ? chatMessages.querySelector(".chat-placeholder") : null;
  const chatHistory = [];
  const MAX_CHAT_MESSAGES = 50;
  const highlightBanner = document.getElementById("highlightBanner");
  const highlightAnimations = new Set();
  const HIGHLIGHT_SPEED = 220; // pixels per second
  const HIGHLIGHT_GAP = 24; // px gap between messages
  const HIGHLIGHT_MIN_DURATION = 4; // seconds

  function getHighlightTail(now) {
    if (!highlightBanner) return window.innerWidth;
    const bannerWidth = highlightBanner.clientWidth || window.innerWidth;
    let tail = bannerWidth;
    highlightAnimations.forEach((item) => {
      const elapsed = (now - item.startTime) / 1000;
      const currentRight = item.startX + item.width - elapsed * HIGHLIGHT_SPEED;
      if (currentRight > tail) {
        tail = currentRight;
      }
    });
    return tail;
  }

  function readFromStorage() {
    const result = [];
    for (let i = 0; i < config.cells.length; i++) {
      if (localStorage.getItem("clicked" + config.localStorageIdent + "_" + i) === "true") {
        result.push(i);
      }
    }
    return result;
  }

  function readFromDom() {
    const buttons = document.querySelectorAll("main.board-grid button.cell");
    if (buttons.length !== config.cells.length) {
      return readFromStorage();
    }
    const result = [];
    buttons.forEach((btn, idx) => {
      if (btn.classList.contains("checked")) {
        result.push(idx);
      }
    });
    return result;
  }

  function send(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      socket.send(JSON.stringify(message));
    } catch (_) {
      return false;
    }
    return true;
  }

  function sendHello() {
    send({
      type: "hello",
      userId: config.userId,
      displayName: config.userDisplayName,
      board: config.cells,
      clicked: latestClicked,
    });
  }

  function sendStateSnapshot(snapshot) {
    if (!send({ type: "state", clicked: snapshot })) {
      latestClicked = snapshot;
    }
  }

  function sendStoredState() {
    latestClicked = readFromStorage();
    sendStateSnapshot(latestClicked);
  }

  function sendState() {
    const snapshot = readFromDom();
    latestClicked = snapshot;
    sendStateSnapshot(snapshot);
  }

  function enqueueHighlight(event) {
    if (!highlightBanner || !event || typeof event !== "object") return;
    const user = typeof event.userId === "string" && event.userId ? event.userId : "Someone";
    const cell = typeof event.cell === "string" && event.cell ? event.cell : "a square";
    const text = user + ' fick "' + cell + '"';
    const messageEl = document.createElement("div");
    messageEl.className = "highlight-banner__message";
    messageEl.textContent = text;
    messageEl.style.visibility = "hidden";
    highlightBanner.appendChild(messageEl);

    const messageWidth = messageEl.getBoundingClientRect().width || 0;
    const now = performance.now();
    const bannerWidth = highlightBanner.clientWidth || window.innerWidth;
    const startX = highlightAnimations.size > 0
      ? Math.max(getHighlightTail(now) + HIGHLIGHT_GAP, bannerWidth)
      : bannerWidth;
    const travelDistance = startX + messageWidth;
    const durationSeconds = Math.max(travelDistance / HIGHLIGHT_SPEED, HIGHLIGHT_MIN_DURATION);

    highlightBanner.classList.add("is-visible");
    messageEl.style.visibility = "";
    messageEl.style.transform = "translate3d(" + startX + "px, -50%, 0)";

    const animation = messageEl.animate(
      [
        { transform: "translate3d(" + startX + "px, -50%, 0)" },
        { transform: "translate3d(" + -messageWidth + "px, -50%, 0)" },
      ],
      {
        duration: durationSeconds * 1000,
        easing: "linear",
        fill: "forwards",
      },
    );

    const animationRecord = {
      el: messageEl,
      startX,
      width: messageWidth,
      startTime: now,
    };
    highlightAnimations.add(animationRecord);

    const cleanup = () => {
      highlightAnimations.delete(animationRecord);
      if (messageEl.parentElement === highlightBanner) {
        highlightBanner.removeChild(messageEl);
      }
      if (highlightAnimations.size === 0) {
        highlightBanner.classList.remove("is-visible");
      }
    };

    animation.addEventListener("finish", cleanup);
    animation.addEventListener("cancel", cleanup);
  }

  function addChatMessage(event) {
    if (!chatMessages || !event || typeof event !== "object") return;
    const { userId, message, timestamp } = event;
    if (typeof message !== "string" || !message.trim()) return;

    if (chatPlaceholder) {
      chatPlaceholder.remove();
    }

    const entry = {
      userId: typeof userId === "string" ? userId : "Unknown",
      message: message.trim(),
      timestamp: typeof timestamp === "number" ? timestamp : Date.now(),
      categories: Array.isArray(event.categories) ? event.categories.filter((item) => typeof item === "string") : [],
    };

    chatHistory.push(entry);
    while (chatHistory.length > MAX_CHAT_MESSAGES) {
      chatHistory.shift();
      if (chatMessages.firstElementChild) {
        chatMessages.removeChild(chatMessages.firstElementChild);
      }
    }

    const wrapper = document.createElement("article");
    const categories = new Set(entry.categories);
    const baseClass = "chat-message";
    wrapper.className = categories.has("bingo") ? baseClass + " chat-message--bingo" : baseClass;

    const header = document.createElement("header");
    header.className = "chat-message__meta";
    if (categories.has("bingo")) {
      const badge = document.createElement("span");
      badge.className = "chat-message__badge";
      badge.textContent = "BINGO";
      header.appendChild(badge);
    }
    const idSpan = document.createElement("span");
    idSpan.className = "chat-message__user";
    idSpan.textContent = entry.userId;
    const timeSpan = document.createElement("time");
    timeSpan.className = "chat-message__time";
    timeSpan.dateTime = new Date(entry.timestamp).toISOString();
    timeSpan.textContent = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    header.appendChild(idSpan);
    header.appendChild(timeSpan);

    const body = document.createElement("p");
    body.className = categories.has("bingo") ? "chat-message__body chat-message__body--bingo" : "chat-message__body";
    body.textContent = entry.message;

    wrapper.appendChild(header);
    wrapper.appendChild(body);
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function handleChatSubmit(event) {
    event.preventDefault();
    if (!chatInput) return;
    const value = chatInput.value.trim();
    if (!value) return;

    if (!send({ type: "chat", message: value })) {
      if (chatStatus) {
        chatStatus.textContent = "Connection lost. Trying to reconnect…";
      }
      return;
    }

    chatInput.value = "";
    if (chatStatus) {
      chatStatus.textContent = "";
    }
  }

  if (chatForm) {
    chatForm.addEventListener("submit", handleChatSubmit);
  }

  function handleMessage(event) {
    if (!event || typeof event.data !== "string") return;
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch (_) {
      return;
    }
    if (!payload || typeof payload !== "object") return;
    if (payload.type === "chat") {
      addChatMessage(payload);
    } else if (payload.type === "highlight") {
      enqueueHighlight(payload);
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer !== null) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 2000);
  }

  function connect() {
    socket = new WebSocket(socketUrl);
    socket.addEventListener("open", () => {
      latestClicked = readFromStorage();
      sendHello();
      sendStoredState();
      const sendDomState = () => window.setTimeout(() => sendState(), 0);
      if (document.readyState === "complete" || document.readyState === "interactive") {
        sendDomState();
      } else {
        document.addEventListener("DOMContentLoaded", sendDomState, { once: true });
      }
      if (chatStatus) {
        chatStatus.textContent = "";
      }
    });
    socket.addEventListener("close", () => {
      socket = null;
      scheduleReconnect();
      if (chatStatus) {
        chatStatus.textContent = "Disconnected. Reconnecting…";
      }
    });
    socket.addEventListener("error", () => {
      if (socket) {
        try {
          socket.close();
        } catch (_) {
          // ignore close errors
        }
      }
    });
    socket.addEventListener("message", handleMessage);
  }

  window.smingoSendState = () => {
    sendState();
  };

  connect();

  window.addEventListener("beforeunload", () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  });
})();`,
        }}
      />
    </div>
  );
};

export default HomePage;
