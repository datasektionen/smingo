import type { FC } from "hono/jsx";

const TalmanPage: FC = () => (
  <main class="talman-page">
    <header class="talman-page__header">
      <h1>SMingo Talman</h1>
      <p>Den här sidan spelar upp alla SMingo-ljud när någon får bingo.</p>
    </header>
    <section class="talman-page__controls">
      <button
        id="talmanEnableAudio"
        class="talman-page__button"
        type="button"
        aria-describedby="talmanAudioHint"
      >
        Aktivera ljud
      </button>
      <p id="talmanAudioHint" class="talman-page__hint">
        Klicka först för att ge webbläsaren tillåtelse att spela ljud.
      </p>
      <p id="talmanStatus" class="talman-page__status" aria-live="polite"></p>
    </section>
    <section class="talman-page__log">
      <h2 class="talman-page__log-title">Senaste SMingo-händelser</h2>
      <ol id="talmanLog" class="talman-page__log-list" aria-live="polite"></ol>
    </section>
    <script type="module" src="/assets/talman-app.js"></script>
  </main>
);

export default TalmanPage;
