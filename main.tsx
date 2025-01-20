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
    `https://sso.datasektionen.se/legacyapi/verify/${
      encodeURIComponent(code)
    }?api_key=${loginApiKey}`,
  );
  const { user } = await resp.json();
  await setSignedCookie(c, "kthid", user, cookieSecret);
  return c.redirect("/");
});

app.get("/", async (c: Context) => {
  const things = [
    `Ändring i föredragningslistan`,
    `Årsmötet vill bryta mot stadgarna`,
    `Årsredovisningen ej färdig`,
    `Beslutsträd`,
    `"Den svenska lagstiftningen för föreningar säger"`,
    `Det är fler än 2 ändringsyrkande på samma motion/proposition`,
    `Det saknas kandidater, vakantställning`,
    `Det sker en sakupplysning`,
    `Det var bättre förr`,
    `Diskussion på samma punkt över en timme`,
    `Diskussion som "fråga"`,
    `En motion/propp ingen förstår`,
    `En motion/propp är klar på under 3 minuter`,
    `En motion/propp tar mer än 30 minuter`,
    `En nämnd kuppar SM`,
    `Fler än 5 personer vinner Betting`,
    `Folk blir påminda att fokusera på valkandidaternas positiva sidor`,
    `Folk utan rösträtt röstar`,
    `Folk utan yrkanderätt yrkar`,
    `För få eluttag`,
    `"Hej SM!"`,
    `Ingen revisor är på plats`,
    `Ingen säger något på diskussion, bara tummar upp`,
    `Ingen vet vilket ändringsyrkande som gäller`,
    `Justerarna lämnar innan mötets slut`,
    `Kandidat/motionär presenterar i max 10 sekunder`,
    `"Kan du upprepa frågan?"`,
    `"Kan vi hålla frågorna/diskussionen relevanta"`,
    `Mikrofonerna strular`,
    `Mötesordförande börjar argumentera för en ståndpunkt i sakfråga`,
    `Mötesordförande citerar mötesordningen fel`,
    `Mötesordförande glömmer vilken punkt mötet är på`,
    `Mötesordförande läser upp fel att-sats`,
    `Mötesordförande mumlar i rask takt`,
    `Mötesordförande suckar högljutt åt någons förslag`,
    `Motion avslås`,
    `Motionssvar saknas`,
    `Någon anser betting vara riggat`,
    `Någon däremot? "Nej"`,
    `Någon (Douglas) berättar sektionshistoria`,
    `Någon drar över talartiden och vägrar sluta prata`,
    `Någon hoppar/klättrar över en bänkrad`,
    `Någon i styrelsen tar av sig hatten`,
    `Någon jämkar sig`,
    `Någon kallas rättshaverist`,
    `Någon klagar på betting inte öppnats`,
    `Någon (Olof) visar brain-rott på stora skärmen`,
    `Någon öppnar dörren när den ska vara stängd`,
    `Någon säger något halv-kul (minst 20% behöver skratta)`,
    `Någon säger något jättekul (minst 80% behöver skratta)`,
    `Någons telefon låter under beslut`,
    `Någon tar mer än 10 sekunder på sig för att få mikrofonen att funka`,
    `Någon tar upp en stadgeändring som övrig fråga`,
    `Något annat än en ordförandeklubba agerar ordförandeklubba`,
    `Något kallas odemokratiskt`,
    `Okynnesvotering`,
    `Ordningsfråga i ordningsfråga`,
    `Ordningsfråga om beslutsordningen`,
    `Ordvits ingen skrattar åt`,
    `"På min tid"`,
    `Personval i rösträknar och/eller justerarval`,
    `Rösträknarna glömmer att meddela resultat av sluten omröstning`,
    `Rummet är en kvav öken`,
    `Sekreterare frågar om någons namn`,
    `Skämt om medias ekonomi`,
    `"Sluta stäng av mikrofonen"`,
    `SM behöver dag 2`,
    `SM börjar minst 15 min sent`,
    `"SMingo!"`,
    `SM tar mer än 3 timmar`,
    `Stadgarna säger emot sig själva`,
    `Sträck i debatten`,
    `Streck i debatten-debatt > 15 min`,
    `Styrelsen har smugit in en oseriös att-sats`,
    `Styrelsen hävdar praxis`,
    `Talarlistan används`,
    `Talman avbryter någon mitt i meningen`,
    `Talman talar fel`,
    `Talman tappar förmågan att tala`,
    `Teknikstrul följt av livlig diskussion om lösning`,
    `"Tjing"`,
    `Valkandidat dyker inte upp på SM`,
    `Valkandidater har gått iväg`,
    `"Vi behöver inte prata om motionen då alla läst handlingarna"`,
    `"Vill Någon vill lyfta originalmotionen eller någon alternativ kombination av ändringsyrkanden"`,
    `Elektroniskt röstningssystem strular`,
    `WiFi strular`,
    `Wikipediasidan för Schulze visas på skärmen`,
    `Yrkning efter bilaga`,
  ];
  things.sort();

  const kthid = await getSignedCookie(c, cookieSecret, "kthid");
  if (!kthid) {
    return c.redirect(
      "https://sso.datasektionen.se/legacyapi/login?callback=" +
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
  const localStorageIdent = Math.floor(rand() * 10000);

  return c.html(
    <Layout>
      <h1>SMingo</h1>
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
