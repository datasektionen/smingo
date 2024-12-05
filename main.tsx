import { Context, Hono } from "hono";
import { FC } from "hono/jsx";
import { getSignedCookie, setSignedCookie } from "hono/cookie";

const cookieSecret = Deno.env.get("COOKIE_SECRET");
const loginApiKey = Deno.env.get("LOGIN_API_KEY");

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
body {
  min-height: calc(100vh - 2ch);
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
      `}
      </style>
    </head>
    <body>
      {props.children}
    </body>
  </html>
);

app.get("/callback/:code", async (c: Context) => {
  const code = c.req.param("code");
  const resp = await fetch(
    `https://logout.datasektionen.se/legacyapi/verify/${
      encodeURIComponent(code)
    }?api_key=${loginApiKey}`,
  );
  const { user } = await resp.json();
  await setSignedCookie(c, "kthid", user, cookieSecret);
  return c.redirect("/");
});

app.get("/", async (c: Context) => {
  const things = [
    "“På min tid”",
    "“Kan vi hålla frågorna/diskussionen relevanta”",
    "SM behöver dag 3",
    "SM tar mer än 4 timmar",
    "Ingen säger något på diskussion, bara tummar upp",
    "“Tjing”",
    "Det sker en sakupplysning",
    "Någon (Olof) visar brain-rott på stora skärmen",
    "Det är fler än 2 ändringsyrkande på samma motion/proposition ",
    "Någon öppnar dörren när den ska vara stängd",
    "Talarlistan används",
    "Någon säger något halv-kul (minst 20% behöver skratta)",
    "Någon säger något jättekul (minst 80% behöver skratta)",
    "Någon hoppar/klättrar över en bänkrad",
    "Någon (Douglas) berättar sektionshistoria",
    "Motion avslås",
    "Någon tar mer än 10 sekunder på sig för att få mikrofonen att funka",
    "Ändring i föredragningslistan",
    "Någon i styrelsen tar av sig hatten",
    "“Kan du upprepa frågan?”",
    "Beslutsträd",
    "“Hej SM!” ",
    "Talman talar fel",
    "“Vill Någon vill lyfta originalmotionen eller någon alternativ kombination av ändringsyrkanden”",
    "VoteIT strular",
    "Kandidat/motionär presenterar i max 10 sekunder",
    "Talman avbryter någon mitt i meningen",
    "Sekreterare frågar om någons namn",
    "En motion/propp är klar på under 3 minuter",
    "Wikipediasidan för Schulze visas på skärmen",
    "Talman tappar förmågan att tala",
    "Fler än 5 personer vinner Betting",
    "En motion/propp tar mer än 30 minuter",
    "“SMingo!”",
    "SM börjar minst 15 min sent",
    "Man får glögg",
    "“Sluta stäng av mikrofonen”",
    "Sträck i debatten",
    "Någon jämkar sig",
  ];
  things.sort();

  const kthid = await getSignedCookie(c, cookieSecret, "kthid");
  if (!kthid) {
    return c.redirect(
      "https://logout.datasektionen.se/legacyapi/login?callback=" +
        encodeURIComponent("https://smingo.datasektionen.se/callback/"),
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

  return c.html(
    <Layout>
      <h1>SMingo</h1>
      <main>
        {stuff.map((thing, i) => (
          <button
            _={`
            on click toggle .checked on me then set localStorage.clicked${i} to me matches .checked end
            on load if localStorage.clicked${i} == "true" then add .checked to me end
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
