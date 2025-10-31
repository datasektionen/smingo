(() => {
  const statusEl = document.getElementById("talmanStatus");
  const logList = document.getElementById("talmanLog");
  const enableButton = document.getElementById("talmanEnableAudio");

  if (!statusEl || !logList || !enableButton) {
    console.warn("Talman page markup missing required elements.");
    return;
  }

  let socket = null;
  let reconnectTimer = null;
  let audioEnabled = false;
  const pendingSounds = [];
  const MAX_LOG_ITEMS = 20;

  function setStatus(message, tone = "info") {
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  }

  function scheduleReconnect() {
    if (reconnectTimer !== null) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 2000);
  }

  function playSound(multiplier) {
    if (
      typeof window.smingoPlaySound === "function" &&
      Number.isFinite(multiplier) &&
      multiplier > 0
    ) {
      window.smingoPlaySound(multiplier);
    }
  }

  function processPending() {
    if (!audioEnabled || pendingSounds.length === 0) return;
    while (pendingSounds.length > 0) {
      const next = pendingSounds.shift();
      playSound(next.multiplier);
    }
  }

  function appendLog(entry) {
    const { userId, multiplier, timestamp } = entry;
    const item = document.createElement("li");
    item.className = "talman-page__log-item";

    const time = document.createElement("time");
    time.className = "talman-page__log-time";
    const date = Number.isFinite(timestamp)
      ? new Date(timestamp)
      : new Date();
    time.dateTime = date.toISOString();
    time.textContent = date.toLocaleTimeString();

    const text = document.createElement("span");
    text.className = "talman-page__log-text";
    text.textContent = `${userId} fick SMingo #${multiplier}`;

    item.append(time, text);
    logList.insertBefore(item, logList.firstChild);
    while (logList.children.length > MAX_LOG_ITEMS) {
      logList.removeChild(logList.lastChild);
    }
  }

  function handleSmingo(payload) {
    const multiplier = Number(payload.bingoCount);
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return;
    }
    const userId =
      typeof payload.userId === "string" && payload.userId.trim()
        ? payload.userId.trim()
        : payload.kthId || "Okänd spelare";
    const timestamp =
      typeof payload.timestamp === "number" ? payload.timestamp : Date.now();

    appendLog({ userId, multiplier, timestamp });

    if (audioEnabled) {
      playSound(multiplier);
    } else {
      pendingSounds.push({ multiplier, timestamp });
      setStatus("Ljud väntar på att aktiveras.", "warn");
    }
  }

  function handleMessage(event) {
    if (!event || typeof event.data !== "string") return;
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    if (data.type === "smingo") {
      handleSmingo(data);
    }
  }

  function connect() {
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore
      }
    }
    setStatus("Ansluter...", "info");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/ws`;
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      setStatus("Ansluten till SMingo-flödet.", "success");
    });
    socket.addEventListener("close", () => {
      setStatus("Frånkopplad. Försöker ansluta igen...", "warn");
      scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      setStatus("Fel på anslutningen.", "error");
      if (socket) {
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
    });
    socket.addEventListener("message", handleMessage);
  }

  enableButton.addEventListener("click", () => {
    audioEnabled = true;
    setStatus("Ljud aktiverat. Väntar på SMingos...", "success");
    processPending();
  });

  connect();
})();
