import type { FC } from "hono/jsx";
import ChatPanel from "./ChatPanel.tsx";
import BoardNavbar, { type BoardNavbarItem } from "./BoardNavbar.tsx";
import BingoBoard from "./BingoBoard.tsx";
import TopListBoard from "./TopListBoard.tsx";
import type { UserProfile } from "../shared/types.ts";

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
  const boardNavScript = `
    (() => {
      const section = document.getElementById("boardSection");
      if (!section) return;
      const nav = section.querySelector(".board-navbar");
      if (!nav) return;

      const buttons = Array.from(
        nav.querySelectorAll("button[data-view]")
      );
      const panels = Array.from(
        section.querySelectorAll("[data-board-view]")
      );

      const setActiveView = (view) => {
        if (!view) return;
        section.setAttribute("data-view", view);
        buttons.forEach((button) => {
          const isActive = button.dataset.view === view;
          button.setAttribute("aria-selected", isActive ? "true" : "false");
          button.classList.toggle("board-navbar__button--active", isActive);
        });
        panels.forEach((panel) => {
          const isActive = panel.dataset.boardView === view;
          panel.setAttribute("aria-hidden", isActive ? "false" : "true");
        });
      };

      nav.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-view]");
        if (!button) return;
        if (button.getAttribute("aria-selected") === "true") return;
        event.preventDefault();
        setActiveView(button.dataset.view);
      });

      if (!section.dataset.view && buttons[0]) {
        setActiveView(buttons[0].dataset.view);
      } else {
        setActiveView(section.dataset.view);
      }
    })();
  `.replace(/</g, "\\u003c");
  const boardNavItems: readonly BoardNavbarItem[] = [
    { id: "bingo", label: "Bräde" },
    { id: "toplist", label: "Topplista" },
  ];

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
        <section
          id="boardSection"
          class="board-section"
          data-view="bingo"
          aria-live="polite"
        >
          <BoardNavbar
            items={boardNavItems}
            activeId="bingo"
          />
          <BingoBoard cells={cells} localStorageIdent={localStorageIdent} />
          <TopListBoard />
        </section>
      </div>
      <script
        id="smingoConfig"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: configJson }}
      ></script>
      <script
        type="module"
        dangerouslySetInnerHTML={{ __html: boardNavScript }}
      ></script>
      <script type="module" src="/assets/chat-app.js"></script>
    </div>
  );
};

export default HomePage;
