// main.tsx — DEV-friendly + SMINGO overlay that retriggers on re-completion
// Multiplier equals the CURRENT number of completed lines (1x, 2x, 3x, ...)

//Läskig AI kod men fixades samma dag som SM

import { Context, Hono } from "hono";
import { FC } from "hono/jsx";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import cards from "./cards.ts";

// ---- DEV toggle ------------------------------------------------------------
const DEV_MODE =
  Deno.env.get("DEV_MODE") === "1" || Deno.env.get("NODE_ENV") === "development";
// ---------------------------------------------------------------------------

const websiteUrl = Deno.env.get("WEBSITE_URL") ?? "http://localhost:8080";

// In dev, provide safe defaults so you can just run the app.
const cookieSecret =
  Deno.env.get("COOKIE_SECRET") ?? (DEV_MODE ? "dev-secret" : undefined);
const loginApiKey =
  Deno.env.get("LOGIN_API_KEY") ?? (DEV_MODE ? "dev-api-key" : undefined);

if (!DEV_MODE && (!cookieSecret || !loginApiKey)) {
  console.error("COOKIE_SECRET or LOGIN_API_KEY missing in environment");
  Deno.exit(1);
}

const seedMod = 2 ** 35 - 31;
function random(seed: number) {
  const a = 185852;
  let s = seed % seedMod;
  return function () {
    return (s = (s * a) % seedMod) / seedMod;
  };
}

const app = new Hono();

const Layout: FC = (props) => (
  <html>
    <head>
      <script src="https://unpkg.com/hyperscript.org@0.9.13"></script>
      {/* lightweight confetti */}
      <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
      <style>
        {`
* { margin: 0; padding: 0; box-sizing: border-box; }
body { min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
h1 { margin: 16px 0; }
main {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  width: calc(90vw);
  max-width: 1100px;
  gap: 1ch;
  flex-grow: 1;
  padding-bottom: 24px;
}
button {
  border: 1px solid #111;
  font-size: 22px;
  padding: 14px;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: transform .05s ease, background .2s ease, color .2s ease, box-shadow .2s ease;
  box-shadow: 0 2px 0 rgba(0,0,0,.15);
}
button:active { transform: translateY(1px); }
button.checked {
  background: seagreen;
  color: white;
  box-shadow: 0 4px 20px rgba(46,139,87,.45);
}
footer { padding-block: 20px; }

/* --- SMINGO overlay --- */
#smingoOverlay[hidden] { display: none !important; }
#smingoOverlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: radial-gradient(ellipse at center, rgba(0,0,0,.15), rgba(0,0,0,.35));
  z-index: 9999;
  animation: fadeIn .25s ease forwards;
}

.smingoText {
  --scale: 1;
  --spinDur: 2.5s;
  --hueDur: 6s;
  --twist: 0deg;

  font-size: calc(clamp(48px, 12vw, 160px) * var(--scale));
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;

  /* fancy gradient text */
  background: conic-gradient(from 120deg at 50% 50%,
    #ff5f6d, #ffc371, #47cf73, #00c6ff, #8a2be2, #ff5f6d);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;

  /* faux 3D depth via text-shadow stack */
  text-shadow:
    1px 1px 0 rgba(0,0,0,.15),
    2px 2px 0 rgba(0,0,0,.12),
    3px 3px 0 rgba(0,0,0,.10),
    4px 4px 0 rgba(0,0,0,.08),
    6px 6px 0 rgba(0,0,0,.06);

  transform-style: preserve-3d;
  animation:
    hueShift var(--hueDur) linear infinite,
    spin3d var(--spinDur) cubic-bezier(.34,.01,.33,1) infinite;
}

@keyframes spin3d {
  0%   { transform: rotateX(0deg) rotateY(0deg) rotateZ(calc(var(--twist) * 0)) translateZ(0); }
  25%  { transform: rotateX(10deg) rotateY(90deg) rotateZ(calc(var(--twist) * 0.5)) translateZ(6px); }
  50%  { transform: rotateX(12deg) rotateY(180deg) rotateZ(calc(var(--twist) * 1)) translateZ(10px); }
  75%  { transform: rotateX(10deg) rotateY(270deg) rotateZ(calc(var(--twist) * 0.5)) translateZ(6px); }
  100% { transform: rotateX(0deg) rotateY(360deg) rotateZ(calc(var(--twist) * 0)) translateZ(0); }
}

@keyframes hueShift {
  0%   { filter: hue-rotate(0deg) saturate(120%); }
  50%  { filter: hue-rotate(180deg) saturate(160%); }
  100% { filter: hue-rotate(360deg) saturate(120%); }
}

@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        `}
      </style>

      {/* Bingo checker + overlay logic — retrigger on re-completion; multiplier = current lines */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function () {
  const N = 5; // 5x5 grid
  let hideTimer = null;

  // Track which lines were complete on the previous check
  // IDs: r0..r4 (rows), c0..c4 (cols), d0,d1 (diagonals)
  let prevCompleted = new Set();

  function isChecked(btn) { return btn.classList.contains('checked'); }
  function getButtons() { return Array.from(document.querySelectorAll('main button.cell')); }

  function getCompletedLines() {
    const btns = getButtons();
    const done = new Set();
    if (btns.length < N*N) return done;

    // rows & cols
    for (let r = 0; r < N; r++) {
      let rowAll = true, colAll = true;
      for (let c = 0; c < N; c++) {
        rowAll &&= isChecked(btns[r*N + c]);
        colAll &&= isChecked(btns[c*N + r]);
      }
      if (rowAll) done.add(\`r\${r}\`);
      if (colAll) done.add(\`c\${r}\`);
    }
    // diagonals
    let d1 = true, d2 = true;
    for (let i = 0; i < N; i++) {
      d1 &&= isChecked(btns[i*N + i]);
      d2 &&= isChecked(btns[i*N + (N-1-i)]);
    }
    if (d1) done.add('d0');
    if (d2) done.add('d1');

    return done;
  }

  function launchConfetti(mult) {
    if (typeof confetti !== 'function') return;

    const base = 180;
    const burst = Math.min(600, Math.floor(base * Math.max(1, mult)));
    const duration = 1500 * (1 + 0.5 * Math.max(0, mult - 1));
    const end = Date.now() + duration;

    (function frame() {
      const sideCount = Math.max(3, Math.floor(3 * Math.max(1, mult)));
      confetti({ particleCount: sideCount, angle: 60, spread: 60, origin: { x: 0 } });
      confetti({ particleCount: sideCount, angle: 120, spread: 60, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
    confetti({ particleCount: burst, spread: 75, startVelocity: 45, origin: { y: 0.6 } });
  }

  function updateSmingoText(mult) {
    const textEl = document.getElementById('smingoText');
    if (!textEl) return;

    textEl.textContent = mult >= 2 ? \`\${mult}x SMINGO\` : 'SMINGO';

    const scale = Math.min(2.2, 1 + 0.28 * (mult - 1));
    const spinDur = Math.max(0.75, 2.5 / (1 + 0.25 * (mult - 1)));
    const hueDur  = Math.max(1.2, 6 / (1 + 0.2 * (mult - 1)));
    const twist   = Math.min(28, 8 * (mult - 1));

    textEl.style.setProperty('--scale', String(scale));
    textEl.style.setProperty('--spinDur', \`\${spinDur.toFixed(2)}s\`);
    textEl.style.setProperty('--hueDur',  \`\${hueDur.toFixed(2)}s\`);
    textEl.style.setProperty('--twist',   \`\${twist}deg\`);
  }

  function showSmingo(mult) {
    const overlay = document.getElementById('smingoOverlay');
    if (!overlay) return;

    updateSmingoText(mult);
    overlay.removeAttribute('hidden');

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideSmingo, 10000);

    launchConfetti(mult);
  }

  function hideSmingo() {
    const overlay = document.getElementById('smingoOverlay');
    if (!overlay) return;
    overlay.setAttribute('hidden', '');
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  // Click anywhere inside overlay hides it
  window.addEventListener('click', (e) => {
    const overlay = document.getElementById('smingoOverlay');
    if (!overlay || overlay.hasAttribute('hidden')) return;
    if (overlay.contains(e.target)) hideSmingo();
  });

  // Public: called after each click + on load via hyperscript
  window.checkBingo = function() {
    const current = getCompletedLines();

    // Lines that just transitioned from incomplete -> complete
    let added = 0;
    for (const id of current) {
      if (!prevCompleted.has(id)) added++;
    }

    if (added > 0) {
      // Multiplier = number of lines currently complete
      const multiplier = current.size;
      showSmingo(multiplier);
    }

    // If nothing is complete, hide overlay
    if (current.size === 0) hideSmingo();

    // Store snapshot for next comparison
    prevCompleted = new Set(current);
  };

  // Initial check (celebrates any existing lines on load)
  window.addEventListener('DOMContentLoaded', () => setTimeout(window.checkBingo, 0));
})();
          `,
        }}
      />
    </head>
    <body>
      {/* overlay */}
      <div id="smingoOverlay" hidden>
        <div id="smingoText" class="smingoText">SMINGO</div>
      </div>

      {props.children}
      <footer>{Math.random() < 0.1 ? "SMIIIIINGOOO!" : ""}</footer>
    </body>
  </html>
);

app.get("/callback/:code", async (c: Context) => {
  if (DEV_MODE) {
    await setSignedCookie(c, "kthid", "devuser", cookieSecret!);
    return c.redirect("/");
  }

  const code = c.req.param("code");
  const resp = await fetch(
    `https://sso.datasektionen.se/legacyapi/verify/${encodeURIComponent(code)}?api_key=${loginApiKey}`,
  );

  const ct = resp.headers.get("content-type") ?? "";
  if (!resp.ok || !ct.includes("application/json")) {
    const text = await resp.text().catch(() => "");
    return c.text(`Login failed: ${text || resp.statusText}`, 401);
  }

  const { user } = await resp.json();
  await setSignedCookie(c, "kthid", user, cookieSecret!);
  return c.redirect("/");
});

app.get("/", async (c: Context) => {
  const things = cards.toSorted();

  // auth (disabled in dev)
  let kthid: string | undefined;
  if (DEV_MODE) {
    kthid = "devuser";
  } else {
    kthid = await getSignedCookie(c, cookieSecret!, "kthid");
    if (!kthid) {
      return c.redirect(
        "https://sso.datasektionen.se/legacyapi/login?callback=" +
          encodeURIComponent(websiteUrl + "/callback/"),
      );
    }
  }

  const stuff: string[] = [];
  let seed = 0;
  for (const ch of kthid) seed = seed * 256 + ch.charCodeAt(0);
  for (const ch of new Date().toDateString()) seed = seed * 256 + ch.charCodeAt(0);

  const rand = random(seed);
  while (stuff.length < 25) {
    const [picked] = things.splice(Math.floor(rand() * things.length), 1);
    stuff.push(picked);
  }
  const localStorageIdent = Math.floor(rand() * 10000);

  return c.html(
    <Layout>
      <h1>SMingo {DEV_MODE ? "(DEV)" : ""}</h1>
      <main>
        {stuff.map((thing, i) => (
          <button
            class="cell"
            // Persist selection + trigger bingo check via hyperscript
            _={`
              on click
                toggle .checked on me
                then set localStorage.clicked${localStorageIdent}_${i} to me matches .checked
                then call window.checkBingo()
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
    </Layout>,
  );
});

const port = Number(Deno.env.get("PORT") ?? "8080");
Deno.serve({ port }, app.fetch);
