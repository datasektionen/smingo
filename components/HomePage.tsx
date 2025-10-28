import type { FC } from "hono/jsx";

interface HomePageProps {
  title: string;
  cells: readonly string[];
  localStorageIdent: number;
  userId: string;
}

const HomePage: FC<HomePageProps> = ({ title, cells, localStorageIdent, userId }) => {
  const configJson = JSON.stringify({ userId, localStorageIdent, cells });

  return (
    <>
      <header class="player-header">
        <h1>{title}</h1>
        <div class="player-session">
          <span>
            Logged in as <strong>{userId}</strong>
          </span>
          <form method="post" action="/logout" class="logout-form">
            <button type="submit" class="logout-button">Log out</button>
          </form>
        </div>
      </header>
      <main>
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
      <script
        type="module"
        dangerouslySetInnerHTML={{
          __html: `(() => {
  const config = ${configJson};
  const socketUrl = (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + "/ws?role=player";
  let socket = null;
  let reconnectTimer = null;
  let latestClicked = readFromStorage();

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
    const buttons = document.querySelectorAll("main button.cell");
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
    });
    socket.addEventListener("close", () => {
      socket = null;
      scheduleReconnect();
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
    </>
  );
};

export default HomePage;
