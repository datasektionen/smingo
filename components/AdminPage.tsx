import type { FC } from "hono/jsx";

const AdminPage: FC = () => (
  <>
    <h1>Admin</h1>
    <main class="admin-page">
      <section class="admin-controls">
        <p id="adminStatus" class="admin-status">Connecting…</p>
        <div class="admin-controls__filters">
          <label class="admin-field">
            <span class="admin-label">Search</span>
            <input
              id="adminSearch"
              class="admin-input"
              type="search"
              placeholder="Search user…"
              autocomplete="off"
            />
          </label>
          <label class="admin-field">
            <span class="admin-label">Sort</span>
            <select id="adminSort" class="admin-input">
              <option value="name">Alphabetical</option>
              <option value="bingo">Most bingos</option>
              <option value="updated">Recently updated</option>
            </select>
          </label>
        </div>
      </section>
      <div class="admin-content">
        <aside
          id="adminUsers"
          class="admin-users"
          aria-label="Active players"
          role="listbox"
        ></aside>
        <section
          id="adminDetail"
          class="admin-detail"
          aria-live="polite"
          aria-busy="true"
        >
          <p class="admin-placeholder">Select a player to view their board.</p>
        </section>
      </div>
    </main>
    <script
      type="module"
      dangerouslySetInnerHTML={{
        __html: `(() => {
  const statusEl = document.getElementById("adminStatus");
  const listEl = document.getElementById("adminUsers");
  const detailEl = document.getElementById("adminDetail");
  const searchInput = document.getElementById("adminSearch");
  const sortSelect = document.getElementById("adminSort");
  const socketUrl = (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + "/ws?role=admin";
  let socket = null;
  let reconnectTimer = null;

  const state = {
    players: [],
    filtered: [],
    selectedId: null,
    searchTerm: "",
    sortMode: sortSelect ? sortSelect.value : "name",
  };

  let connectionState = "Connecting…";

  function setConnectionState(next) {
    connectionState = next;
    updateStatus();
  }

  function setBusy(isBusy) {
    if (!detailEl) return;
    detailEl.setAttribute("aria-busy", isBusy ? "true" : "false");
  }

  function updateStatus() {
    if (!statusEl) return;
    if (!state.players.length) {
      statusEl.textContent = connectionState;
      return;
    }
    const visible = state.filtered.length;
    const total = state.players.length;
    const label = visible === 1 ? "player" : "players";
    let sortLabel = "";
    switch (state.sortMode) {
      case "bingo":
        sortLabel = "sorted by most bingos";
        break;
      case "updated":
        sortLabel = "sorted by last update";
        break;
      default:
        sortLabel = "sorted alphabetically";
    }
    const filterText = visible === total ? \`\${visible} \${label}\` : \`\${visible} of \${total} \${label}\`;
    statusEl.textContent = \`\${connectionState} • \${filterText} • \${sortLabel}\`;
  }

  function formatTime(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
    return new Date(value).toLocaleTimeString();
  }

  function formatRelative(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "";
    const delta = Date.now() - value;
    if (delta < 0) return "just now";
    const seconds = Math.floor(delta / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return \`\${seconds}s ago\`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return \`\${minutes}m ago\`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return \`\${hours}h ago\`;
    const days = Math.floor(hours / 24);
    return \`\${days}d ago\`;
  }

  function normalizePlayers(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((player) => {
        if (!player || typeof player !== "object") return null;
        const board = Array.isArray(player.board)
          ? player.board.filter((item) => typeof item === "string")
          : [];
        const clicked = Array.isArray(player.clicked)
          ? player.clicked
              .map((n) => (typeof n === "number" ? n : Number(n)))
              .filter((n) => Number.isInteger(n) && n >= 0 && n < board.length)
          : [];
        const id = typeof player.id === "string" ? player.id : String(player.id ?? "");
        return {
          id,
          userId: typeof player.userId === "string" && player.userId ? player.userId : "Unknown user",
          board,
          clicked,
          connectedAt: typeof player.connectedAt === "number" ? player.connectedAt : 0,
          lastUpdate: typeof player.lastUpdate === "number" ? player.lastUpdate : 0,
          bingoCount: typeof player.bingoCount === "number" ? player.bingoCount : 0,
        };
      })
      .filter(Boolean);
  }

  function applyFilters() {
    const term = state.searchTerm.trim().toLowerCase();
    let filtered = state.players.slice();
    if (term) {
      filtered = filtered.filter((player) => player.userId.toLowerCase().includes(term));
    }

    switch (state.sortMode) {
      case "bingo":
        filtered.sort((a, b) => {
          if (b.bingoCount !== a.bingoCount) return b.bingoCount - a.bingoCount;
          if (b.lastUpdate !== a.lastUpdate) return b.lastUpdate - a.lastUpdate;
          return a.userId.localeCompare(b.userId);
        });
        break;
      case "updated":
        filtered.sort((a, b) => {
          if (b.lastUpdate !== a.lastUpdate) return b.lastUpdate - a.lastUpdate;
          return a.userId.localeCompare(b.userId);
        });
        break;
      default:
        filtered.sort((a, b) => {
          const byName = a.userId.localeCompare(b.userId);
          if (byName !== 0) return byName;
          return a.id.localeCompare(b.id);
        });
        break;
    }

    state.filtered = filtered;
    if (!state.selectedId || !filtered.some((player) => player.id === state.selectedId)) {
      state.selectedId = filtered.length ? filtered[0].id : null;
    }

    renderList();
    renderDetail();
    updateStatus();
  }

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!state.filtered.length) {
      listEl.removeAttribute("aria-activedescendant");
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = state.players.length === 0
        ? "No active players."
        : "No players match your search.";
      listEl.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const player of state.filtered) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.id = player.id;
      btn.id = player.id;
      btn.className = "admin-user" + (player.id === state.selectedId ? " selected" : "");
      btn.setAttribute("role", "option");

      const name = document.createElement("span");
      name.className = "admin-user__name";
      name.textContent = player.userId;

      const bingo = document.createElement("span");
      bingo.className = "admin-user__bingo";
      bingo.textContent = \`\${player.bingoCount} bingo\${player.bingoCount === 1 ? "" : "s"}\`;

      const updated = document.createElement("span");
      updated.className = "admin-user__meta";
      updated.textContent = player.lastUpdate
        ? \`Updated \${formatRelative(player.lastUpdate)}\`
        : "No updates yet";

      btn.append(name, bingo, updated);
      fragment.appendChild(btn);
    }

    listEl.appendChild(fragment);
    if (state.selectedId) {
      listEl.setAttribute("aria-activedescendant", state.selectedId);
    } else {
      listEl.removeAttribute("aria-activedescendant");
    }
  }

  function renderDetail() {
    if (!detailEl) return;
    detailEl.innerHTML = "";

    if (!state.selectedId) {
      const placeholder = document.createElement("p");
      placeholder.className = "admin-placeholder";
      placeholder.textContent = state.players.length
        ? "Select a player to view their board."
        : "Waiting for active players…";
      detailEl.appendChild(placeholder);
      return;
    }

    const player = state.players.find((item) => item.id === state.selectedId);
    if (!player) {
      const placeholder = document.createElement("p");
      placeholder.className = "admin-placeholder";
      placeholder.textContent = "Player not found.";
      detailEl.appendChild(placeholder);
      return;
    }

    const card = document.createElement("article");
    card.className = "admin-card";

    const header = document.createElement("header");
    header.className = "admin-card__header";

    const titleRow = document.createElement("div");
    titleRow.className = "admin-card__title";

    const title = document.createElement("h2");
    title.textContent = player.userId;

    const badge = document.createElement("span");
    badge.className = "admin-bingo";
    badge.textContent = \`\${player.bingoCount} bingo\${player.bingoCount === 1 ? "" : "s"}\`;

    titleRow.append(title, badge);

    const meta = document.createElement("p");
    meta.className = "admin-card__meta";
    meta.textContent = \`Connected \${formatTime(player.connectedAt)} • Updated \${formatTime(player.lastUpdate)}\`;

    const metaSecondary = document.createElement("p");
    metaSecondary.className = "admin-card__meta--secondary";
    metaSecondary.textContent = player.lastUpdate ? \`(\${formatRelative(player.lastUpdate)})\` : "";

    header.append(titleRow, meta);
    if (player.lastUpdate) {
      header.appendChild(metaSecondary);
    }
    card.appendChild(header);

    if (!player.board.length) {
      const empty = document.createElement("p");
      empty.className = "admin-placeholder";
      empty.textContent = "No board data available.";
      card.appendChild(empty);
    } else {
      const grid = document.createElement("div");
      grid.className = "admin-grid";
      const clickedSet = new Set(player.clicked);
      player.board.forEach((cellText, idx) => {
        const cell = document.createElement("div");
        cell.className = "admin-cell" + (clickedSet.has(idx) ? " checked" : "");
        cell.textContent = String(cellText);
        grid.appendChild(cell);
      });
      card.appendChild(grid);
    }

    detailEl.appendChild(card);
  }

  function handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      if (data && data.type === "active") {
        state.players = normalizePlayers(data.players);
        applyFilters();
        setBusy(false);
      }
    } catch (_err) {
      // ignore malformed payloads
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer !== null) return;
    setConnectionState("Disconnected • Reconnecting soon…");
    if (listEl) {
      listEl.innerHTML = "";
      listEl.removeAttribute("aria-activedescendant");
    }
    state.players = [];
    state.filtered = [];
    state.selectedId = null;
    if (detailEl) {
      detailEl.innerHTML = "";
      const placeholder = document.createElement("p");
      placeholder.className = "admin-placeholder";
      placeholder.textContent = "Reconnecting…";
      detailEl.appendChild(placeholder);
    }
    setBusy(true);
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 2000);
  }

  function connect() {
    setBusy(true);
    setConnectionState("Connecting…");
    socket = new WebSocket(socketUrl);
    socket.addEventListener("open", () => {
      setBusy(true);
      setConnectionState("Connected");
      updateStatus();
    });
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", () => {
      socket = null;
      scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      if (socket) {
        try {
          socket.close();
        } catch (_) {
          // ignore
        }
      }
    });
  }

  if (listEl) {
    listEl.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("button.admin-user") : null;
      if (!target || !target.dataset.id) return;
      if (state.selectedId === target.dataset.id) return;
      state.selectedId = target.dataset.id;
      renderList();
      renderDetail();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.searchTerm = searchInput.value ?? "";
      applyFilters();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      state.sortMode = sortSelect.value;
      applyFilters();
    });
  }

  connect();

  window.addEventListener("beforeunload", () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  });
})();`,
      }}
    />
  </>
);

export default AdminPage;
