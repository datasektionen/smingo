import type { FC } from "hono/jsx";

const AdminPage: FC = () => (
  <>
    <h1>Admin</h1>
    <main class="admin-page">
      <section class="admin-controls">
        <p id="adminStatus" class="admin-status">Connecting…</p>
        <div class="admin-controls__filters">
          <label class="admin-field">
            <span class="admin-label">Search</span>
            <input
              id="adminSearch"
              class="admin-input"
              type="search"
              placeholder="Search user…"
              autocomplete="off"
            />
          </label>
          <label class="admin-field">
            <span class="admin-label">Sort</span>
            <select id="adminSort" class="admin-input">
              <option value="name">Alphabetical</option>
              <option value="bingo">Most bingos</option>
              <option value="updated">Recently updated</option>
            </select>
          </label>
        </div>
      </section>
      <div class="admin-content">
        <aside
          id="adminUsers"
          class="admin-users"
          aria-label="Active players"
          role="listbox"
        ></aside>
        <section
          id="adminDetail"
          class="admin-detail"
          aria-live="polite"
          aria-busy="true"
        >
          <p class="admin-placeholder">Select a player to view their board.</p>
        </section>
      </div>
    </main>
    <script type="module" src="/assets/admin-app.js"></script>
  </>
);

export default AdminPage;
