import type { FC } from "hono/jsx";

interface BingoBoardProps {
  readonly cells: readonly string[];
  readonly localStorageIdent: number;
}

const BingoBoard: FC<BingoBoardProps> = ({ cells, localStorageIdent }) => (
  <main
    id="board-view-bingo"
    class="board-column board-grid"
    data-board-view="bingo"
    role="tabpanel"
    aria-labelledby="board-tab-bingo"
    aria-hidden="false"
  >
    {cells.map((thing, index) => (
      <button
        key={`${localStorageIdent}-${index}`}
        class="cell"
        data-index={index}
        _={`
          on click
            toggle .checked on me
            then set localStorage.clicked${localStorageIdent}_${index} to me matches .checked
            then call window.checkBingo()
            then if window.smingoSendState
              call window.smingoSendState()
            end
          end
          on load
            if localStorage.clicked${localStorageIdent}_${index} == "true"
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
);

export default BingoBoard;
