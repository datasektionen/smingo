import type { FC } from "hono/jsx";

const storageInitializationScript = `(() => {
  const DATE_KEY = "current_date";
  try {
    const today = new Date().toISOString().split("T")[0];
    const stored = localStorage.getItem(DATE_KEY);
    if (stored && stored !== today) {
      localStorage.clear();
    }
    if (!stored || stored !== today) {
      localStorage.setItem(DATE_KEY, today);
    }
  } catch (error) {
    console.warn("Failed to access localStorage", error);
  }
})();`.replace(/</g, "\\u003c");

const Layout: FC = (props) => (
  <html>
    <head>
      <script
        dangerouslySetInnerHTML={{ __html: storageInitializationScript }}
      ></script>
      <script src="https://unpkg.com/hyperscript.org@0.9.13"></script>
      <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
      <link rel="stylesheet" href="/assets/smingo.css" />
      <link rel="icon" type="image/png" href="/media/favicon.png" />
      <script defer src="/assets/smingo.js"></script>
    </head>
    <body>
      <div id="smingoOverlay" hidden>
        <div id="smingoText" class="smingoText">SMINGO</div>
      </div>
      <div class="page-shell">{props.children}</div>
      <footer class="page-footer">{Math.random() < 0.1 ? "SMIIIIINGOOO!" : ""}</footer>
    </body>
  </html>
);

export default Layout;
