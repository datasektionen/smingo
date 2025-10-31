import type { FC } from "hono/jsx";

const Layout: FC = (props) => (
  <html>
    <head>
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
