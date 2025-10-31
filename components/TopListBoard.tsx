import type { FC } from "hono/jsx";

const TopListBoard: FC = () => (
  <section
    id="board-view-toplist"
    class="board-column board-toplist"
    data-board-view="toplist"
    role="tabpanel"
    aria-labelledby="board-tab-toplist"
    aria-hidden="true"
  >
    <header class="board-toplist__header">
      <h2>Topplista</h2>
      <p class="board-toplist__subtitle">
        Se vilka spelare som har flest bingo och markerade rutor.
      </p>
      <p
        id="boardToplistUpdated"
        class="board-toplist__updated"
        aria-live="polite"
      ></p>
    </header>
    <div
      id="boardToplistEmpty"
      class="board-toplist__empty"
      aria-live="polite"
    >
      <p>Ingen är aktiv i topplistan ännu. Vänta på fler spelare!</p>
    </div>
    <ol
      id="boardToplistList"
      class="board-toplist__list"
      aria-live="polite"
    ></ol>
  </section>
);

export default TopListBoard;
