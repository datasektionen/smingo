import type { FC } from "hono/jsx";

interface BoardNavbarItem {
  readonly id: string;
  readonly label: string;
}

interface BoardNavbarProps {
  readonly items: readonly BoardNavbarItem[];
  readonly activeId: string;
}

const BoardNavbar: FC<BoardNavbarProps> = ({ items, activeId }) => (
  <nav class="board-navbar" aria-label="Board navigation" role="tablist">
    {items.map((item) => {
      const isActive = item.id === activeId;
      const buttonId = `board-tab-${item.id}`;
      const contentId = `board-view-${item.id}`;

      return (
        <button
          key={item.id}
          type="button"
          id={buttonId}
          role="tab"
          aria-controls={contentId}
          aria-selected={isActive ? "true" : "false"}
          data-view={item.id}
          class={`board-navbar__button${isActive ? " board-navbar__button--active" : ""}`}
        >
          {item.label}
        </button>
      );
    })}
  </nav>
);

export type { BoardNavbarItem };
export default BoardNavbar;
