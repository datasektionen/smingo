import type { FC } from "hono/jsx";

interface ChatPanelProps {
  userId: string;
}

const ChatPanel: FC<ChatPanelProps> = ({ userId }) => (
  <aside class="chat-panel" aria-label="Live chat">
    <header class="chat-header">
      <h2>Chatt</h2>
    </header>
    <div id="chatMessages" class="chat-messages" aria-live="polite" aria-relevant="additions">
      <p class="chat-placeholder">Hej världen!</p>
    </div>
    <form id="chatForm" class="chat-form" autocomplete="off">
      <label for="chatInput" class="chat-label">Meddelande</label>
      <div class="chat-input-row">
        <input
          id="chatInput"
          name="message"
          class="chat-input"
          type="text"
          placeholder="Skicka nått kul..."
          maxlength={300}
          required
        />
        <button type="submit" class="chat-submit">↲</button>
      </div>
      <p id="chatStatus" class="chat-status" role="status" aria-live="polite"></p>
    </form>
  </aside>
);

export default ChatPanel;
