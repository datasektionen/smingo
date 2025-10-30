import type { FC } from "hono/jsx";
import ChatPanel from "./ChatPanel.tsx";
import type { UserProfile } from "../shared/types.ts";

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
  }).replace(/</g, "\\u003c");

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
            Inloggad som <strong>{userDisplayName}</strong>
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
        id="smingoConfig"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: configJson }}
      ></script>
      <script type="module" src="/assets/chat-app.js"></script>
    </div>
  );
};

export default HomePage;
