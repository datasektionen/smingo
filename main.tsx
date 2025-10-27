import { Context, Hono } from "hono";
import { FC } from "hono/jsx";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import cards from "./cards.ts";

const cookieSecret = Deno.env.get("COOKIE_SECRET");
const loginApiKey = Deno.env.get("LOGIN_API_KEY");
const websiteUrl = Deno.env.get("WEBSITE_URL");

if (!cookieSecret || !loginApiKey) {
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
      <style>
        {`
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}

main {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  width: calc(90vw);
  gap: 1ch;
  flex-grow: 1;
}

button {
  border: 1px solid black;
  font-size: 22px;
  padding: 14px;
}

button.checked {
  background-color: seagreen;
  color: white;
}
footer {
  padding-block: 20px;
}
      `}
      </style>
    </head>
    <body>
      {props.children}
      <footer>{Math.random() < 0.1 ? "SMIIIIINGOOO!" : ""}</footer>
    </body>
  </html>
);

app.get("/callback/:code", async (c: Context) => {
  const code = c.req.param("code");
  const resp = await fetch(
    `https://sso.datasektionen.se/legacyapi/verify/${
      encodeURIComponent(code)
    }?api_key=${loginApiKey}`,
  );
  const { user } = await resp.json();
  await setSignedCookie(c, "kthid", user, cookieSecret);
  return c.redirect("/");
});

app.get("/", async (c: Context) => {
  const things = cards.toSorted();

  const kthid = await getSignedCookie(c, cookieSecret, "kthid");
  if (!kthid) {
    return c.redirect(
      "https://sso.datasektionen.se/legacyapi/login?callback=" +
        encodeURIComponent(websiteUrl + "/callback/"),
    );
  }

  const stuff = [];
  let seed = 0;
  for (const c of kthid) {
    seed *= 256;
    seed += c.charCodeAt(0);
  }
  for (const c of new Date().toDateString()) {
    seed *= 256;
    seed += c.charCodeAt(0);
  }
  const rand = random(seed);
  while (stuff.length < 25) {
    const [bungus] = things.splice(Math.floor(rand() * things.length), 1);
    stuff.push(bungus);
  }
  const localStorageIdent = Math.floor(rand() * 10000);

  return c.html(
    <Layout>
      <h1>VMingo</h1>
      <main>
        {stuff.map((thing, i) => (
          <button
            _={`
            on click toggle .checked on me then set localStorage.clicked${localStorageIdent}_${i} to me matches .checked end
            on load if localStorage.clicked${localStorageIdent}_${i} == "true" then add .checked to me end
          `}
          >
            {thing}
          </button>
        ))}
      </main>
    </Layout>,
  );
});

if (Deno.env.has("PORT")) {
  Deno.serve({ port: parseInt(Deno.env.get("PORT")!) }, app.fetch);
} else {
  Deno.serve(app.fetch);
}
