import type { FC } from "hono/jsx";

interface ChatPanelProps {
  userId: string;
}

const ChatPanel: FC<ChatPanelProps> = ({ userId }) => (
  <aside class="chat-panel" aria-label="Live chat">
    <header class="chat-header">
      <h1>SMingo</h1>
    </header>
    <div id="chatMessages" class="chat-messages" aria-live="polite" aria-relevant="additions">
      <p class="chat-placeholder">Hej världen!</p>
    </div>
    <form id="chatForm" class="chat-form" autocomplete="off">
      <p class="chat-tips">Du kan pinga med @FörnamnEfternamn eller @kthid</p>
      <div class="chat-input-row">
        <button
          type="button"
          id="chatAttachButton"
          class="chat-attach"
          aria-label="Attach a file"
          title="Attach a file"
        >
          📎
        </button>
        <input
          id="chatInput"
          name="message"
          class="chat-input"
          type="text"
          placeholder="Skicka nått kul..."
          maxlength={300}
        />
        <input
          id="chatFileInput"
          name="attachment"
          class="chat-file-input"
          type="file"
          accept="image/*,video/*"
          hidden
        />
        <button type="submit" class="chat-submit">↲</button>
      </div>
      <p id="chatAttachmentInfo" class="chat-attachment-info" aria-live="polite"></p>
      <p id="chatStatus" class="chat-status" role="status" aria-live="polite"></p>
    </form>
  </aside>
);

export default ChatPanel;
