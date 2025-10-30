(() => {
  function getSmingoConfig() {
    const el = document.getElementById("smingoConfig");
    if (!el) {
      throw new Error("SMingo config element not found");
    }
    try {
      return JSON.parse(el.textContent || "{}");
    } catch (error) {
      console.error("Failed to parse SMingo config", error);
      return {};
    }
  }

  function initChatApp() {
    const config = getSmingoConfig();
    const socketUrl =
      (window.location.protocol === "https:" ? "wss://" : "ws://") +
      window.location.host +
      "/ws?role=player";
    let socket = null;
    let reconnectTimer = null;
    let latestClicked = readFromStorage();
    const chatMessages = document.getElementById("chatMessages");
    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const chatStatus = document.getElementById("chatStatus");
    const chatAttachButton = document.getElementById("chatAttachButton");
    const chatFileInput = document.getElementById("chatFileInput");
    const chatSubmitButton = chatForm
      ? chatForm.querySelector(".chat-submit")
      : null;
    const chatAttachmentInfo = document.getElementById("chatAttachmentInfo");
    const chatPlaceholder = chatMessages
      ? chatMessages.querySelector(".chat-placeholder")
      : null;
    const chatHistory = [];
    const chatUserDirectory = new Map();
    const MAX_CHAT_MESSAGES = 50;
    const highlightBanner = document.getElementById("highlightBanner");
    const highlightItems = new Set();
    let highlightFrame = null;
    let highlightLastTick = null;
    const peerSelections = new Map();
    const ownKthId =
      config.userProfile && typeof config.userProfile.kthId === "string"
        ? config.userProfile.kthId
        : config.userId;
    const PEER_TOOLTIP_PREFIX_SELF = "Också vald av:";
    const PEER_TOOLTIP_PREFIX_OTHERS = "Vald av:";
    const HIGHLIGHT_MIN_SPEED = 160; // pixels per second when queue is empty
    const HIGHLIGHT_MAX_SPEED = 1000; // pixels per second at high backlog
    const HIGHLIGHT_SPEED_THRESHOLD = 10; // backlog size to reach max speed
    const HIGHLIGHT_GAP = 24; // px gap between messages
    const mentionTargets = (() => {
      const targetSet = new Set();
      const normalize = (value) =>
        typeof value === "string"
          ? value
              .toLowerCase()
              .normalize("NFKD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]/g, "")
          : "";
      const push = (value) => {
        const normalized = normalize(value);
        if (normalized) targetSet.add(normalized);
      };
      if (config.userProfile) {
        const first = config.userProfile.firstName ?? "";
        const family = config.userProfile.familyName ?? "";
        push(first + family);
        if (first && family) push(first + " " + family);
        push(config.userProfile.kthId);
      }
      push(config.userDisplayName);
      push(config.userId);
      return { set: targetSet, normalize };
    })();
    const ATTACHMENT_ALLOWED_MIME_PREFIXES = ["image/", "video/"];
    const ATTACHMENT_IMAGE_EXTENSIONS = new Set([
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "avif",
      "bmp",
      "heic",
      "heif",
      "apng",
    ]);
    const ATTACHMENT_VIDEO_EXTENSIONS = new Set([
      "mp4",
      "webm",
      "mov",
      "m4v",
      "ogg",
      "ogv",
      "avi",
      "mkv",
      "gifv",
    ]);
    const ATTACHMENT_MAX_SIZE_BYTES = 25 * 1024 * 1024;
    const CHEVERETO_HOSTNAME = "imgcdn.dev";
    let pendingAttachment = null;
    let isUploadingAttachment = false;
    let statusMode = "idle";

    function setStatus(text, mode = "info", severity = "info") {
      if (!chatStatus) return;
      statusMode = mode;
      chatStatus.textContent = text;
      if (text && severity) {
        chatStatus.dataset.severity = severity;
      } else {
        chatStatus.removeAttribute("data-severity");
      }
    }

    function clearStatus(mode) {
      if (!chatStatus) return;
      if (mode && statusMode !== mode) return;
      statusMode = "idle";
      chatStatus.textContent = "";
      chatStatus.removeAttribute("data-severity");
    }

    function formatFileSize(bytes) {
      if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
        return "0 B";
      }
      const units = ["B", "KB", "MB", "GB"];
      let idx = 0;
      let value = bytes;
      while (value >= 1024 && idx < units.length - 1) {
        value /= 1024;
        idx++;
      }
      const decimals = value >= 10 || idx === 0 ? 0 : 1;
      return value.toFixed(decimals) + " " + units[idx];
    }

    function describeAttachment(file) {
      if (!file) return "";
      return file.name + " (" + formatFileSize(file.size) + ")";
    }

    function updateAttachmentInfo(text = "") {
      if (!chatAttachmentInfo) return;
      chatAttachmentInfo.textContent = text;
      if (text) {
        chatAttachmentInfo.dataset.visible = "1";
      } else {
        delete chatAttachmentInfo.dataset.visible;
      }
    }

    function isAllowedAttachment(file) {
      if (!file) return false;
      if (
        typeof file.type === "string" &&
        ATTACHMENT_ALLOWED_MIME_PREFIXES.some((prefix) =>
          file.type.startsWith(prefix)
        )
      ) {
        return true;
      }
      if (typeof file.name !== "string" || file.name.lastIndexOf(".") === -1) {
        return false;
      }
      const ext = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
      return (
        ATTACHMENT_IMAGE_EXTENSIONS.has(ext) ||
        ATTACHMENT_VIDEO_EXTENSIONS.has(ext)
      );
    }

    function resetAttachment() {
      pendingAttachment = null;
      if (chatFileInput instanceof HTMLInputElement) {
        chatFileInput.value = "";
      } else if (chatFileInput) {
        chatFileInput.removeAttribute("value");
      }
      if (chatAttachButton) {
        chatAttachButton.removeAttribute("data-selected");
      }
      updateAttachmentInfo("");
    }

    function setUploadingState(active) {
      isUploadingAttachment = active;
      if (chatForm) {
        chatForm.classList.toggle("chat-form--uploading", active);
        if (active) {
          chatForm.setAttribute("aria-busy", "true");
        } else {
          chatForm.removeAttribute("aria-busy");
        }
      }
      if (chatInput instanceof HTMLInputElement) {
        chatInput.readOnly = active;
        chatInput.classList.toggle("chat-input--uploading", active);
      }
      if (chatSubmitButton instanceof HTMLButtonElement) {
        chatSubmitButton.disabled = active;
      }
      if (chatAttachButton instanceof HTMLButtonElement) {
        chatAttachButton.disabled = active;
      } else if (chatAttachButton) {
        chatAttachButton.setAttribute(
          "aria-disabled",
          active ? "true" : "false"
        );
      }
    }

    function getFileExtension(name) {
      if (typeof name !== "string") return "";
      const lastDot = name.lastIndexOf(".");
      if (lastDot === -1 || lastDot === name.length - 1) return "";
      return name.slice(lastDot + 1).toLowerCase();
    }

    function determineAttachmentType(file, url) {
      const typeHint =
        file && typeof file.type === "string" ? file.type.toLowerCase() : "";
      if (typeHint.startsWith("video/")) return "video";
      if (typeHint.startsWith("image/")) return "image";
      const source = file && typeof file.name === "string" ? file.name : url;
      const ext = getFileExtension(source);
      if (ATTACHMENT_VIDEO_EXTENSIONS.has(ext)) return "video";
      return "image";
    }

    function normalizePreviewUrl(value) {
      if (typeof value !== "string") return "";
      const trimmed = value.trim();
      if (!/^https?:\/\//i.test(trimmed)) return "";
      try {
        const parsed = new URL(trimmed);
        return parsed.href;
      } catch (_) {
        return "";
      }
    }

    function inferPreviewTypeFromUrl(url) {
      if (typeof url !== "string" || !url) return "";
      let target = url;
      try {
        const parsed = new URL(url);
        target = parsed.pathname || "";
      } catch (_) {
        const qIndex = url.indexOf("?");
        target = qIndex === -1 ? url : url.slice(0, qIndex);
      }
      const ext = getFileExtension(target);
      if (!ext) return "";
      if (ATTACHMENT_VIDEO_EXTENSIONS.has(ext)) return "video";
      if (ATTACHMENT_IMAGE_EXTENSIONS.has(ext)) return "image";
      return "";
    }

    function createLinkPreview(url, type) {
      if (!url || !type) return null;
      const wrapper = document.createElement("div");
      wrapper.className =
        "chat-attachment " +
        (type === "video"
          ? "chat-attachment--video"
          : "chat-attachment--image");
      const link = document.createElement("a");
      link.className = "chat-attachmentLink";
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer noopener";

      let media = null;
      if (type === "video") {
        media = document.createElement("video");
        media.className = "chat-attachmentVideo";
        media.controls = true;
        media.preload = "metadata";
        media.src = url;
      } else {
        media = document.createElement("img");
        media.className = "chat-attachmentImage";
        media.loading = "lazy";
        media.decoding = "async";
        media.alt = "";
        media.src = url;
      }

      link.appendChild(media);
      wrapper.appendChild(link);
      return wrapper;
    }

    function isCheveretoUrl(url) {
      if (typeof url !== "string" || !url) return false;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") return false;
        const host = parsed.hostname.toLowerCase();
        return (
          host === CHEVERETO_HOSTNAME || host.endsWith("." + CHEVERETO_HOSTNAME)
        );
      } catch (_) {
        return false;
      }
    }

    function setAttachment(file) {
      pendingAttachment = file;
      if (chatAttachButton) {
        chatAttachButton.setAttribute("data-selected", "1");
      }
      updateAttachmentInfo("Bilaga: " + describeAttachment(file));
    }

    async function uploadAttachment(file) {
      const formData = new FormData();
      const filename =
        typeof file.name === "string" && file.name ? file.name : "upload";
      formData.append("attachment", file, filename);

      let response;
      try {
        response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
      } catch (networkError) {
        throw new Error(
          networkError && networkError.message
            ? networkError.message
            : "Network error"
        );
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {
        throw new Error("Upload failed: Unexpected response");
      }

      const errorDetail =
        (payload && typeof payload.error === "string" && payload.error) ||
        (payload &&
          payload.error &&
          typeof payload.error === "object" &&
          typeof payload.error.message === "string" &&
          payload.error.message) ||
        (payload && typeof payload.message === "string" && payload.message) ||
        "";

      if (!response.ok || errorDetail) {
        const errorMessage =
          errorDetail || response.statusText || "Upload failed";
        throw new Error(errorMessage);
      }

      const url = payload && typeof payload.url === "string" ? payload.url : "";
      const typeHint =
        payload && typeof payload.type === "string" ? payload.type : "";
      const nameHint =
        payload && typeof payload.name === "string" ? payload.name : "";

      if (!url) {
        throw new Error("Upload completed without a usable URL");
      }
      if (!isCheveretoUrl(url)) {
        throw new Error("Upload completed with an unexpected host");
      }
      const type =
        typeHint === "video"
          ? "video"
          : typeHint === "image"
          ? "image"
          : determineAttachmentType(file, url);
      const name = nameHint || (typeof file.name === "string" ? file.name : "");
      return { url, type, name };
    }

    function computeHighlightSpeed() {
      const backlog = Math.max(highlightItems.size, 1);
      if (backlog <= 1) return HIGHLIGHT_MIN_SPEED;
      const capped = Math.min(backlog, HIGHLIGHT_SPEED_THRESHOLD);
      const t = (capped - 1) / (HIGHLIGHT_SPEED_THRESHOLD - 1);
      return (
        HIGHLIGHT_MIN_SPEED + t * (HIGHLIGHT_MAX_SPEED - HIGHLIGHT_MIN_SPEED)
      );
    }

    function updatePeerIndicators() {
      const buttons = document.querySelectorAll("main.board-grid button.cell");
      if (
        !Array.isArray(config.cells) ||
        config.cells.length === 0 ||
        buttons.length === 0
      ) {
        return;
      }
      buttons.forEach((rawBtn, idx) => {
        const btn = rawBtn instanceof HTMLElement ? rawBtn : null;
        if (!btn) return;
        const cellValue = config.cells[idx];
        if (typeof cellValue !== "string") return;
        const participants = peerSelections.get(cellValue) || [];
        const selfSelected = btn.classList.contains("checked");
        const otherPlayers = participants.filter(
          (entry) => entry && entry.kthId !== ownKthId
        );
        const shouldShow =
          (selfSelected && otherPlayers.length > 0) ||
          (!selfSelected && participants.length > 0);
        let indicator = btn.querySelector(".cell-peer-indicator");
        if (shouldShow) {
          if (!indicator) {
            indicator = document.createElement("span");
            indicator.className = "cell-peer-indicator";
            indicator.setAttribute("aria-hidden", "true");
            btn.appendChild(indicator);
          }
          const namesSource = selfSelected ? otherPlayers : participants;
          const tooltipNames = namesSource
            .map((entry) =>
              entry && typeof entry.displayName === "string"
                ? entry.displayName
                : ""
            )
            .filter(Boolean);
          if (tooltipNames.length > 0) {
            const prefix = selfSelected
              ? PEER_TOOLTIP_PREFIX_SELF
              : PEER_TOOLTIP_PREFIX_OTHERS;
            const tooltip =
              tooltipNames.length === 1
                ? prefix + " " + tooltipNames[0]
                : prefix + "\\n" + tooltipNames.join("\\n");
            btn.setAttribute("title", tooltip);
            btn.dataset.peerTooltip = "1";
          }
        } else {
          if (indicator) {
            indicator.remove();
          }
          if (btn.dataset.peerTooltip === "1") {
            btn.removeAttribute("title");
            delete btn.dataset.peerTooltip;
          }
        }
      });
    }

    function ensureHighlightLoop() {
      if (highlightFrame !== null) return;
      highlightFrame = requestAnimationFrame(stepHighlightAnimation);
    }

    function stopHighlightLoop() {
      if (highlightFrame !== null) {
        cancelAnimationFrame(highlightFrame);
        highlightFrame = null;
      }
      highlightLastTick = null;
    }

    function stepHighlightAnimation(timestamp) {
      if (highlightItems.size === 0) {
        stopHighlightLoop();
        if (highlightBanner) {
          highlightBanner.classList.remove("is-visible");
        }
        return;
      }

      if (highlightLastTick === null) {
        highlightLastTick = timestamp;
      }
      const delta = Math.max((timestamp - highlightLastTick) / 1000, 0);
      highlightLastTick = timestamp;

      const speed = computeHighlightSpeed();
      const toRemove = [];

      highlightItems.forEach((item) => {
        item.elapsed += delta;
        item.position -= speed * delta;
        const distanceCovered = item.startX - item.position;
        const progress = Math.min(
          Math.max(distanceCovered / item.travelDistance, 0),
          1
        );
        const fadeInThreshold = 0.08;
        const fadeOutThreshold = 0.92;
        let opacity = 1;
        if (progress < fadeInThreshold) {
          opacity = Math.min(1, progress / fadeInThreshold);
        } else if (progress > fadeOutThreshold) {
          opacity = Math.max(0, (1 - progress) / (1 - fadeOutThreshold));
        }
        item.el.style.opacity = opacity.toFixed(3);
        item.el.style.transform =
          "translate3d(" + item.position + "px, -50%, 0)";

        if (item.position <= -item.width - HIGHLIGHT_GAP) {
          toRemove.push(item);
        }
      });

      if (toRemove.length > 0) {
        toRemove.forEach((item) => {
          highlightItems.delete(item);
          if (item.el.parentElement === highlightBanner) {
            highlightBanner.removeChild(item.el);
          }
        });
        if (highlightItems.size === 0 && highlightBanner) {
          highlightBanner.classList.remove("is-visible");
        }
      }

      highlightFrame = requestAnimationFrame(stepHighlightAnimation);
    }

    function getHighlightTail() {
      if (!highlightBanner) return window.innerWidth;
      const bannerWidth = highlightBanner.clientWidth || window.innerWidth;
      let tail = bannerWidth;
      highlightItems.forEach((item) => {
        const currentRight = item.position + item.width;
        if (currentRight > tail) {
          tail = currentRight;
        }
      });
      return tail;
    }

    function readFromStorage() {
      const result = [];
      for (let i = 0; i < config.cells.length; i++) {
        if (
          localStorage.getItem(
            "clicked" + config.localStorageIdent + "_" + i
          ) === "true"
        ) {
          result.push(i);
        }
      }
      return result;
    }

    function readFromDom() {
      const buttons = document.querySelectorAll("main.board-grid button.cell");
      if (buttons.length !== config.cells.length) {
        return readFromStorage();
      }
      const result = [];
      buttons.forEach((btn, idx) => {
        if (btn.classList.contains("checked")) {
          result.push(idx);
        }
      });
      return result;
    }

    function formatChatMessageText(message) {
      const fragment = document.createDocumentFragment();
      let hasSelfPing = false;
      const parts = message.match(/\\S+|\\s+/g) ?? [message];
      const urlPattern = /^(https?:\/\/[^\\s]+?)([.,!?)]*)$/i;
      const urls = [];

      for (const part of parts) {
        if (!part) continue;
        if (part.startsWith("@")) {
          const match = part.match(/^@\\S*/);
          const mentionText = match ? match[0] : part;
          const remainder = match ? part.slice(mentionText.length) : "";

          const span = document.createElement("span");
          span.className = "chat-mention";
          span.textContent = mentionText;

          const normalized = mentionTargets.normalize(mentionText.slice(1));
          if (mentionTargets.set.has(normalized)) {
            span.dataset.mentionSelf = "1";
            hasSelfPing = true;
          }

          fragment.append(span);
          if (remainder) {
            fragment.append(document.createTextNode(remainder));
          }
        } else if (urlPattern.test(part)) {
          const matches = part.match(urlPattern);
          const rawUrl = matches ? matches[1] : part;
          const trailing = matches ? matches[2] : "";
          const normalizedUrl = normalizePreviewUrl(rawUrl) || rawUrl;
          urls.push(normalizedUrl);
          const type = inferPreviewTypeFromUrl(normalizedUrl);
          if (!type) {
            const anchor = document.createElement("a");
            anchor.className = "chat-link";
            anchor.href = normalizedUrl;
            anchor.rel = "noreferrer noopener";
            anchor.target = "_blank";
            anchor.textContent = rawUrl;
            fragment.append(anchor);
          }
          if (trailing) {
            fragment.append(document.createTextNode(trailing));
          }
        } else {
          fragment.append(document.createTextNode(part));
        }
      }

      return { fragment, hasSelfPing, urls };
    }

    function createAttachmentPreview(entry) {
      if (
        !entry ||
        typeof entry.attachmentUrl !== "string" ||
        !entry.attachmentUrl
      )
        return null;
      if (!isCheveretoUrl(entry.attachmentUrl)) return null;
      const type = entry.attachmentType === "video" ? "video" : "image";
      const wrapper = document.createElement("div");
      wrapper.className =
        "chat-attachment " +
        (type === "video"
          ? "chat-attachment--video"
          : "chat-attachment--image");
      const link = document.createElement("a");
      link.className = "chat-attachmentLink";
      link.href = entry.attachmentUrl;
      link.target = "_blank";
      link.rel = "noreferrer noopener";

      let media = null;
      if (type === "video") {
        media = document.createElement("video");
        media.className = "chat-attachmentVideo";
        media.controls = true;
        media.preload = "metadata";
        media.src = entry.attachmentUrl;
      } else {
        media = document.createElement("img");
        media.className = "chat-attachmentImage";
        media.loading = "lazy";
        media.decoding = "async";
        media.alt = "";
        media.src = entry.attachmentUrl;
      }

      link.appendChild(media);
      wrapper.appendChild(link);

      return wrapper;
    }

    function appendLinkPreviews(urls, entry, container) {
      if (!Array.isArray(urls) || urls.length === 0) return;
      if (!container) return;
      const seen = new Set();
      if (
        entry &&
        typeof entry.attachmentUrl === "string" &&
        entry.attachmentUrl
      ) {
        seen.add(entry.attachmentUrl);
      }
      for (const raw of urls) {
        const normalized = normalizePreviewUrl(raw);
        if (!normalized || seen.has(normalized)) continue;
        const type = inferPreviewTypeFromUrl(normalized);
        if (!type) continue;
        const preview = createLinkPreview(normalized, type);
        if (!preview) continue;
        container.appendChild(preview);
        seen.add(normalized);
      }
    }

    function send(message) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      try {
        socket.send(JSON.stringify(message));
      } catch (_) {
        return false;
      }
      return true;
    }

    function sendHello() {
      send({
        type: "hello",
        userId: config.userId,
        displayName: config.userDisplayName,
        board: config.cells,
        clicked: latestClicked,
      });
    }

    function sendStateSnapshot(snapshot) {
      if (!send({ type: "state", clicked: snapshot })) {
        latestClicked = snapshot;
      }
    }

    function sendStoredState() {
      latestClicked = readFromStorage();
      sendStateSnapshot(latestClicked);
    }

    function sendState() {
      const snapshot = readFromDom();
      latestClicked = snapshot;
      sendStateSnapshot(snapshot);
      updatePeerIndicators();
    }

    function enqueueHighlight(event) {
      if (!highlightBanner || !event || typeof event !== "object") return;
      const user =
        typeof event.userId === "string" && event.userId
          ? event.userId
          : "Someone";
      const cell =
        typeof event.cell === "string" && event.cell ? event.cell : "a square";
      const text = user + ' fick "' + cell + '"';
      const messageEl = document.createElement("div");
      messageEl.className = "highlight-banner__message";
      messageEl.textContent = text;
      messageEl.style.visibility = "hidden";
      highlightBanner.appendChild(messageEl);

      const messageWidth = messageEl.getBoundingClientRect().width || 0;
      const bannerWidth = highlightBanner.clientWidth || window.innerWidth;
      const startTail =
        highlightItems.size > 0
          ? Math.max(getHighlightTail() + HIGHLIGHT_GAP, bannerWidth)
          : bannerWidth;
      const startX = startTail;
      const travelDistance = Math.max(startX + messageWidth, 1);

      highlightBanner.classList.add("is-visible");
      messageEl.style.visibility = "";
      messageEl.style.transform = "translate3d(" + startX + "px, -50%, 0)";
      messageEl.style.opacity = "0";

      const item = {
        el: messageEl,
        width: messageWidth,
        position: startX,
        startX,
        travelDistance,
        elapsed: 0,
      };
      highlightItems.add(item);
      ensureHighlightLoop();
    }

    function buildAvatarLabel(name) {
      if (typeof name !== "string") return "?";
      const trimmed = name.trim();
      if (!trimmed) return "?";
      const slices = trimmed.split(/\s+/).filter(Boolean);
      if (slices.length === 0) return "?";
      if (slices.length === 1) {
        return slices[0].slice(0, 2).toUpperCase();
      }
      const first = slices[0][0] || "";
      const last = slices[slices.length - 1][0] || "";
      const initials = (first + last).trim();
      return initials
        ? initials.toUpperCase()
        : trimmed.slice(0, 2).toUpperCase();
    }

    function createAvatarElement(entry, isContinuation) {
      const avatar = document.createElement("div");
      avatar.setAttribute("aria-hidden", "true");
      if (isContinuation) {
        avatar.className = "";
        delete avatar.dataset.kthId;
        return avatar;
      }
      avatar.className = "chat-message__avatar";
      const kthId = typeof entry.kthId === "string" ? entry.kthId : "";
      if (kthId) {
        avatar.textContent = "";
        avatar.setAttribute("title", kthId);
        const img = document.createElement("img");
        img.className = "chat-message__avatarImage";
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.src =
          "https://zfinger.datasektionen.se/user/" +
          encodeURIComponent(kthId) +
          "/image/100";
        img.addEventListener("error", () => {
          img.remove();
          avatar.classList.remove("chat-message__avatar--image");
          avatar.textContent = buildAvatarLabel(entry.userId);
          delete avatar.dataset.kthId;
          entry.kthId = "";
          chatUserDirectory.delete(entry.userId);
        });
        avatar.appendChild(img);
        avatar.classList.add("chat-message__avatar--image");
        avatar.dataset.kthId = kthId;
      } else {
        avatar.textContent = buildAvatarLabel(entry.userId);
        delete avatar.dataset.kthId;
      }
      return avatar;
    }

    function addChatMessage(event) {
      if (!chatMessages || !event || typeof event !== "object") return;
      const { userId, timestamp } = event;
      const rawMessage = typeof event.message === "string" ? event.message : "";
      const trimmedMessage = rawMessage.trim();
      const attachmentUrl =
        typeof event.attachmentUrl === "string" ? event.attachmentUrl : "";
      const attachmentType =
        event.attachmentType === "video"
          ? "video"
          : event.attachmentType === "image"
          ? "image"
          : "";
      const attachmentName =
        typeof event.attachmentName === "string"
          ? event.attachmentName.replace(/[\\r\\n]+/g, " ").slice(0, 120)
          : "";
      if (!trimmedMessage && !attachmentUrl) return;

      if (chatPlaceholder) {
        chatPlaceholder.remove();
      }

      const previousEntry =
        chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;

      const entry = {
        userId: typeof userId === "string" ? userId : "Unknown",
        message: trimmedMessage,
        timestamp: typeof timestamp === "number" ? timestamp : Date.now(),
        categories: Array.isArray(event.categories)
          ? event.categories.filter((item) => typeof item === "string")
          : [],
        kthId: typeof event.kthId === "string" ? event.kthId : "",
        attachmentUrl,
        attachmentType,
        attachmentName,
      };

      if (!entry.kthId && chatUserDirectory.has(entry.userId)) {
        entry.kthId = chatUserDirectory.get(entry.userId) || "";
      }

      const isContinuation =
        !!previousEntry && previousEntry.userId === entry.userId;
      if (
        !entry.kthId &&
        isContinuation &&
        previousEntry &&
        previousEntry.kthId
      ) {
        entry.kthId = previousEntry.kthId;
      }
      if (entry.kthId) {
        chatUserDirectory.set(entry.userId, entry.kthId);
      }

      chatHistory.push(entry);
      while (chatHistory.length > MAX_CHAT_MESSAGES) {
        chatHistory.shift();
        if (chatMessages.firstElementChild) {
          chatMessages.removeChild(chatMessages.firstElementChild);
        }
      }

      const wrapper = document.createElement("article");
      const categories = new Set(entry.categories);
      const baseClass = "chat-message";
      wrapper.className = categories.has("bingo")
        ? baseClass + " chat-message--bingo"
        : baseClass;
      wrapper.dataset.userId = entry.userId;
      if (isContinuation) {
        wrapper.classList.add("chat-message--continued");
      }

      const avatar = createAvatarElement(entry, isContinuation);
      const content = document.createElement("div");
      content.className = "chat-message__content";

      const shouldRenderMeta = categories.has("bingo") || !isContinuation;
      if (shouldRenderMeta) {
        const header = document.createElement("header");
        header.className = "chat-message__meta";
        if (categories.has("bingo")) {
          const badge = document.createElement("span");
          badge.className = "chat-message__badge";
          badge.textContent = "BINGO";
          header.appendChild(badge);
        }
        if (!isContinuation) {
          const idSpan = document.createElement("span");
          idSpan.className = "chat-message__user";
          idSpan.textContent = entry.userId;
          const timeSpan = document.createElement("time");
          timeSpan.className = "chat-message__time";
          timeSpan.dateTime = new Date(entry.timestamp).toISOString();
          timeSpan.textContent = new Date(entry.timestamp).toLocaleTimeString(
            [],
            {
              hour: "2-digit",
              minute: "2-digit",
            }
          );
          header.appendChild(idSpan);
          header.appendChild(timeSpan);
        }
        content.appendChild(header);
      }

      let formattedMessage = null;
      let linkUrls = [];
      if (entry.message) {
        const body = document.createElement("p");
        body.className = categories.has("bingo")
          ? "chat-message__body chat-message__body--bingo"
          : "chat-message__body";
        formattedMessage = formatChatMessageText(entry.message);
        body.appendChild(formattedMessage.fragment);
        content.appendChild(body);
        if (formattedMessage && Array.isArray(formattedMessage.urls)) {
          linkUrls = formattedMessage.urls;
        }
      }

      const attachmentElement = createAttachmentPreview(entry);
      if (attachmentElement) {
        content.appendChild(attachmentElement);
      }

      appendLinkPreviews(linkUrls, entry, content);

      wrapper.appendChild(avatar);
      wrapper.appendChild(content);

      chatMessages.appendChild(wrapper);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      if (formattedMessage && formattedMessage.hasSelfPing) {
        wrapper.classList.add("chat-message--ping");
      }
    }

    async function handleChatSubmit(event) {
      event.preventDefault();
      if (!chatInput || isUploadingAttachment) return;
      const value = chatInput.value.trim();
      const file = pendingAttachment;
      if (!value && !file) return;

      let attachmentUrl = "";
      let attachmentType = "";
      let attachmentName = "";

      if (file) {
        if (
          typeof file.size === "number" &&
          file.size > ATTACHMENT_MAX_SIZE_BYTES
        ) {
          setStatus(
            "Attachment is too large (" +
              formatFileSize(file.size) +
              "). Max " +
              formatFileSize(ATTACHMENT_MAX_SIZE_BYTES) +
              ".",
            "attachment",
            "error"
          );
          return;
        }
        setStatus(
          "Uploading " + describeAttachment(file) + "…",
          "upload",
          "info"
        );
        setUploadingState(true);
        try {
          const uploaded = await uploadAttachment(file);
          attachmentUrl = uploaded.url;
          attachmentType =
            uploaded.type || determineAttachmentType(file, uploaded.url);
          attachmentName =
            uploaded.name ||
            (typeof file.name === "string" && file.name ? file.name : "");
          const displayName = attachmentName || describeAttachment(file);
          setStatus("Attachment uploaded: " + displayName, "upload", "success");
        } catch (error) {
          const message =
            error && typeof error.message === "string" && error.message
              ? error.message
              : "Upload failed";
          setStatus("Upload failed: " + message, "upload", "error");
          return;
        } finally {
          setUploadingState(false);
        }
      }

      const payload = { type: "chat", message: value };
      if (attachmentUrl) {
        payload.attachmentUrl = attachmentUrl;
        payload.attachmentType = attachmentType;
        if (attachmentName) {
          payload.attachmentName = attachmentName;
        }
      }

      if (!send(payload)) {
        setStatus("Connection lost. Trying to reconnect…", "send", "error");
        return;
      }

      chatInput.value = "";
      if (attachmentUrl) {
        resetAttachment();
      }
      clearStatus("upload");
      clearStatus("attachment");
      clearStatus("send");
    }

    if (chatAttachButton) {
      chatAttachButton.addEventListener("click", () => {
        if (isUploadingAttachment) return;
        if (pendingAttachment) {
          resetAttachment();
          setStatus("Attachment removed.", "attachment", "info");
          window.setTimeout(() => clearStatus("attachment"), 3000);
        } else if (chatFileInput instanceof HTMLInputElement) {
          chatFileInput.click();
        }
      });
    }

    if (chatFileInput instanceof HTMLInputElement) {
      chatFileInput.addEventListener("change", () => {
        const file =
          chatFileInput.files && chatFileInput.files[0]
            ? chatFileInput.files[0]
            : null;
        if (!file) {
          resetAttachment();
          clearStatus("attachment");
          return;
        }
        if (!isAllowedAttachment(file)) {
          setStatus(
            "Only images or videos are allowed.",
            "attachment",
            "error"
          );
          resetAttachment();
          return;
        }
        if (
          typeof file.size === "number" &&
          file.size > ATTACHMENT_MAX_SIZE_BYTES
        ) {
          setStatus(
            "Attachment is too large (" +
              formatFileSize(file.size) +
              "). Max " +
              formatFileSize(ATTACHMENT_MAX_SIZE_BYTES) +
              ".",
            "attachment",
            "error"
          );
          resetAttachment();
          return;
        }
        setAttachment(file);
        setStatus(
          "Attachment ready: " + describeAttachment(file),
          "attachment",
          "info"
        );
        window.setTimeout(() => clearStatus("attachment"), 4000);
      });
    }

    if (chatForm) {
      chatForm.addEventListener("submit", handleChatSubmit);
    }

    function handleMessage(event) {
      if (!event || typeof event.data !== "string") return;
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "chatHistory") {
        const messages = Array.isArray(payload.messages)
          ? payload.messages
          : [];
        if (chatMessages) {
          chatMessages.innerHTML = "";
        }
        chatHistory.length = 0;
        chatUserDirectory.clear();
        if (messages.length === 0) {
          if (chatMessages && chatPlaceholder) {
            chatMessages.appendChild(chatPlaceholder);
          }
          return;
        }
        messages.forEach((message) => addChatMessage(message));
      } else if (payload.type === "chat") {
        addChatMessage(payload);
      } else if (payload.type === "highlight") {
        enqueueHighlight(payload);
      } else if (payload.type === "peerSelections") {
        peerSelections.clear();
        const selections = payload.selections;
        if (selections && typeof selections === "object") {
          Object.entries(selections).forEach(([cell, value]) => {
            if (typeof cell !== "string" || !Array.isArray(value)) return;
            if (
              !Array.isArray(config.cells) ||
              config.cells.indexOf(cell) === -1
            )
              return;
            const seen = new Set();
            const normalized = [];
            value.forEach((entry) => {
              if (!entry || typeof entry !== "object") return;
              const kthId = typeof entry.kthId === "string" ? entry.kthId : "";
              const displayName =
                typeof entry.displayName === "string" ? entry.displayName : "";
              if (!kthId || !displayName || seen.has(kthId)) return;
              seen.add(kthId);
              normalized.push({ kthId, displayName });
            });
            if (normalized.length > 0) {
              peerSelections.set(cell, normalized);
            }
          });
        }
        updatePeerIndicators();
      }
    }

    function scheduleReconnect() {
      if (reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 2000);
    }

    function connect() {
      socket = new WebSocket(socketUrl);
      socket.addEventListener("open", () => {
        latestClicked = readFromStorage();
        sendHello();
        sendStoredState();
        const sendDomState = () => window.setTimeout(() => sendState(), 0);
        if (
          document.readyState === "complete" ||
          document.readyState === "interactive"
        ) {
          sendDomState();
        } else {
          document.addEventListener("DOMContentLoaded", sendDomState, {
            once: true,
          });
        }
        clearStatus("connection");
        clearStatus("send");
      });
      socket.addEventListener("close", () => {
        socket = null;
        scheduleReconnect();
        setStatus("Disconnected. Reconnecting…", "connection", "error");
      });
      socket.addEventListener("error", () => {
        if (socket) {
          try {
            socket.close();
          } catch (_) {
            // ignore close errors
          }
        }
      });
      socket.addEventListener("message", handleMessage);
    }

    window.smingoSendState = () => {
      sendState();
    };

    connect();

    window.addEventListener("beforeunload", () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChatApp, { once: true });
  } else {
    initChatApp();
  }
})();
