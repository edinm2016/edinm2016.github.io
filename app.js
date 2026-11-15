const STORAGE_KEY = "ai-matrix-assistant-v1";
const MAX_CHATS = 40;
const MAX_HISTORY = 30;
const MAX_FILE_BYTES = 25 * 1024;
const MAX_FILES = 3;

const $ = (selector) => document.querySelector(selector);
const refs = {
  newChat: $("#newChat"), chatHistory: $("#chatHistory"), emptyHistory: $("#emptyHistory"), historySearch: $("#historySearch"),
  searchToggle: $("#searchToggle"), welcome: $("#welcome"), messages: $("#messages"), form: $("#chatForm"), input: $("#messageInput"),
  send: $("#sendButton"), fileInput: $("#fileInput"), attachmentArea: $("#attachmentArea"), attachmentConsent: $("#attachmentConsent"),
  attachmentCheck: $("#attachmentCheck"), providerStatus: $("#providerStatus"), statusDot: $("#statusDot"), topTitle: $("#topTitle"),
  settingsModal: $("#settingsModal"), settingsOpen: $("#settingsOpen"), topSettings: $("#topSettings"), settingsClose: $("#settingsClose"),
  settingsDone: $("#settingsDone"), settingsConnection: $("#settingsConnection"), settingsDot: $("#settingsDot"), settingsModel: $("#settingsModel"),
  responseStyle: $("#responseStyle"), markdownToggle: $("#markdownToggle"), toast: $("#toast"), sidebar: $("#sidebar"), menuToggle: $("#menuToggle"),
};

let state = loadState();
let pendingFiles = [];
let apiReady = false;
let apiModel = null;
let toastTimer;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.chats)) {
      return {
        chats: saved.chats.filter((chat) => chat && typeof chat.id === "string" && Array.isArray(chat.messages)).slice(0, MAX_CHATS),
        currentId: saved.currentId,
        responseStyle: ["balanced", "concise", "detailed"].includes(saved.responseStyle) ? saved.responseStyle : "balanced",
        markdown: saved.markdown !== false,
      };
    }
  } catch { /* Use a clean local session if storage is unavailable or invalid. */ }
  return { chats: [], currentId: null, responseStyle: "balanced", markdown: true };
}

function saveState() {
  try {
    state.chats.sort((a, b) => b.updatedAt - a.updatedAt);
    state.chats = state.chats.slice(0, MAX_CHATS);
    for (const chat of state.chats) chat.messages = chat.messages.slice(-MAX_HISTORY * 2);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  catch { showToast("Preglednik ne može sačuvati historiju razgovora."); }
}

function currentChat() { return state.chats.find((chat) => chat.id === state.currentId) ?? null; }

function ensureChat() {
  let chat = currentChat();
  if (!chat) {
    chat = { id: crypto.randomUUID(), title: "Novi razgovor", updatedAt: Date.now(), messages: [] };
    state.chats.unshift(chat);
    state.currentId = chat.id;
  }
  return chat;
}

function newChat() {
  state.currentId = null;
  pendingFiles = [];
  renderAttachments();
  refs.input.value = "";
  refs.input.style.height = "auto";
  renderConversation();
  refs.input.focus();
  refs.sidebar.classList.remove("open");
}

function updateChatTitle(chat) {
  const firstUser = chat.messages.find((message) => message.role === "user");
  if (firstUser) chat.title = firstUser.content.replace(/\s+/g, " ").trim().slice(0, 52) || "Novi razgovor";
}

function renderHistory() {
  const query = refs.historySearch.value.trim().toLocaleLowerCase();
  const chats = [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((chat) => !query || chat.title.toLocaleLowerCase().includes(query));
  refs.chatHistory.replaceChildren();
  refs.emptyHistory.classList.toggle("hidden", chats.length > 0 || Boolean(query));
  for (const chat of chats) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `history-item${chat.id === state.currentId ? " selected" : ""}`;
    button.title = chat.title;
    const title = document.createElement("span");
    title.textContent = chat.title;
    button.append(title);
    button.addEventListener("click", () => {
      state.currentId = chat.id;
      pendingFiles = [];
      renderAttachments();
      renderConversation();
      refs.sidebar.classList.remove("open");
    });
    refs.chatHistory.append(button);
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function markdownHtml(source) {
  let html = escapeHtml(source);
  const codeBlocks = [];
  html = html.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) => {
    const key = `@@CODE${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code>${code.replace(/\n$/, "")}</code></pre>`);
    return key;
  });
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  const lines = html.split("\n");
  const out = [];
  let inList = false;
  for (const line of lines) {
    const codeMatch = line.match(/^@@CODE(\d+)@@$/);
    if (codeMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(codeBlocks[Number(codeMatch[1])]);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${item[1]}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      if (heading) out.push(`<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`);
      else if (line.trim()) out.push(`<p>${line}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("").replace(/@@CODE(\d+)@@/g, (_, index) => codeBlocks[Number(index)] ?? "");
}

function addMessageNode(message, index) {
  const row = document.createElement("article");
  row.className = `message ${message.role}`;
  if (message.role === "assistant") {
    const icon = document.createElement("div");
    icon.className = "message-avatar";
    icon.textContent = "✳";
    row.append(icon);
  }
  const body = document.createElement("div");
  body.className = "message-content";
  if (message.role === "assistant" && state.markdown) body.innerHTML = markdownHtml(message.content);
  else body.textContent = message.content;
  row.append(body);
  if (message.role === "assistant" && !message.pending) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const copy = document.createElement("button");
    copy.className = "message-action";
    copy.type = "button";
    copy.textContent = "Kopiraj odgovor";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(message.content); showToast("Odgovor je kopiran."); }
      catch { showToast("Kopiranje nije dostupno u ovom pregledniku."); }
    });
    actions.append(copy);
    body.append(actions);
  }
  refs.messages.append(row);
}

function renderConversation() {
  const chat = currentChat();
  const hasMessages = Boolean(chat?.messages.length);
  refs.welcome.classList.toggle("hidden", hasMessages);
  refs.messages.classList.toggle("hidden", !hasMessages);
  refs.messages.replaceChildren();
  if (chat) chat.messages.forEach((message, index) => addMessageNode(message, index));
  refs.topTitle.textContent = chat?.title && hasMessages ? chat.title : "AI Assistant";
  renderHistory();
  requestAnimationFrame(() => { refs.messages.scrollTop = refs.messages.scrollHeight; });
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => refs.toast.classList.remove("show"), 2600);
}

function setProviderStatus(ready, model = null, reachable = true) {
  apiReady = ready;
  apiModel = model;
  refs.statusDot.classList.toggle("offline", !ready);
  refs.settingsDot.classList.toggle("offline", !ready);
  refs.providerStatus.textContent = ready ? `Povezan · ${model}` : reachable ? "AI servis nije povezan" : "Backend nije pokrenut";
  refs.settingsConnection.textContent = ready ? "AI Assistant je spreman za razgovor." : reachable ? "Backend radi, ali AI provajder još nije konfigurisan." : "Lokalni Matrix API trenutno nije dostupan.";
  refs.settingsModel.textContent = ready ? `Povezan model: ${model}` : "AI povezivanje nije aktivno";
}

async function loadProviderStatus() {
  try {
    const response = await fetch("/api/config", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("status");
    const config = await response.json();
    setProviderStatus(Boolean(config.chat_ready), config.model ?? null, true);
  } catch {
    setProviderStatus(false, null, false);
  }
}

function renderAttachments() {
  refs.attachmentArea.replaceChildren();
  refs.attachmentArea.classList.toggle("hidden", pendingFiles.length === 0);
  refs.attachmentConsent.classList.toggle("hidden", pendingFiles.length === 0);
  refs.attachmentCheck.checked = false;
  pendingFiles.forEach((file, index) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    const name = document.createElement("span");
    name.textContent = file.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Ukloni ${file.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => { pendingFiles.splice(index, 1); renderAttachments(); });
    chip.append(name, remove);
    refs.attachmentArea.append(chip);
  });
}

async function readFiles(fileList) {
  for (const file of [...fileList]) {
    if (pendingFiles.length >= MAX_FILES) { showToast(`Možeš dodati najviše ${MAX_FILES} datoteke.`); break; }
    if (file.size > MAX_FILE_BYTES) { showToast(`${file.name} je veći od dozvoljenih 25 KB.`); continue; }
    if (!/\.(txt|md|csv|json)$/i.test(file.name)) { showToast("Podržane su TXT, Markdown, CSV i JSON datoteke."); continue; }
    try { pendingFiles.push({ name: file.name, content: await file.text() }); }
    catch { showToast(`Ne mogu pročitati ${file.name}.`); }
  }
  renderAttachments();
}

function setBusy(busy) {
  refs.send.disabled = busy || (pendingFiles.length > 0 && !refs.attachmentCheck.checked);
  refs.send.textContent = busy ? "…" : "↑";
  refs.input.disabled = busy;
}

async function sendMessage(text) {
  const cleanText = text.trim();
  if (!cleanText || !apiReady) {
    if (!apiReady) showToast("AI Assistant treba da se poveže na backend server.");
    return;
  }
  const chat = ensureChat();
  const visibleText = pendingFiles.length
    ? `${cleanText}\n\nPriloženo: ${pendingFiles.map((file) => file.name).join(", ")}`
    : cleanText;
  chat.messages.push({ role: "user", content: visibleText });
  chat.updatedAt = Date.now();
  updateChatTitle(chat);
  const fileContext = pendingFiles.map((file) => `\n\n--- Početak datoteke: ${file.name} ---\n${file.content}\n--- Kraj datoteke ---`).join("");
  const requestMessages = chat.messages.filter((message) => !message.error).slice(-8).map((message) => ({ role: message.role, content: message.content }));
  if (fileContext) requestMessages[requestMessages.length - 1].content += `\n\nSadržaj priloženih datoteka:${fileContext}`;

  pendingFiles = [];
  renderAttachments();
  saveState();
  renderConversation();
  setBusy(true);

  const pending = document.createElement("article");
  pending.className = "message assistant";
  pending.id = "pendingReply";
  const icon = document.createElement("div"); icon.className = "message-avatar"; icon.textContent = "✳";
  const dots = document.createElement("div"); dots.className = "typing"; dots.innerHTML = "<i></i><i></i><i></i>";
  pending.append(icon, dots); refs.messages.append(pending);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ messages: requestMessages, response_style: state.responseStyle }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || "AI odgovor trenutno nije dostupan.");
    if (typeof result.reply !== "string" || !result.reply.trim()) throw new Error("AI nije vratio tekstualni odgovor.");
    chat.messages.push({ role: "assistant", content: result.reply.trim() });
    chat.updatedAt = Date.now();
    saveState();
  } catch (error) {
    chat.messages.push({ role: "assistant", content: `**Nisam uspio dobiti odgovor.** ${error.message || "Pokušaj ponovo."}`, error: true });
    chat.updatedAt = Date.now();
    saveState();
  } finally {
    setBusy(false);
    renderConversation();
  }
}

function openSettings() {
  refs.settingsModal.classList.remove("hidden");
  refs.responseStyle.value = state.responseStyle;
  refs.markdownToggle.checked = state.markdown;
  refs.settingsClose.focus();
}

function closeSettings() {
  refs.settingsModal.classList.add("hidden");
  refs.settingsOpen.focus();
}

refs.newChat.addEventListener("click", newChat);
refs.settingsOpen.addEventListener("click", openSettings);
refs.topSettings.addEventListener("click", openSettings);
refs.settingsClose.addEventListener("click", closeSettings);
refs.settingsDone.addEventListener("click", () => {
  state.responseStyle = refs.responseStyle.value;
  state.markdown = refs.markdownToggle.checked;
  saveState();
  renderConversation();
  closeSettings();
  showToast("Postavke su sačuvane.");
});
refs.settingsModal.addEventListener("click", (event) => { if (event.target === refs.settingsModal) closeSettings(); });
refs.menuToggle.addEventListener("click", () => refs.sidebar.classList.toggle("open"));
refs.searchToggle.addEventListener("click", () => {
  refs.historySearch.classList.toggle("hidden");
  if (!refs.historySearch.classList.contains("hidden")) refs.historySearch.focus();
  else { refs.historySearch.value = ""; renderHistory(); }
});
refs.historySearch.addEventListener("input", renderHistory);
refs.fileInput.addEventListener("change", async () => { await readFiles(refs.fileInput.files); refs.fileInput.value = ""; });
refs.attachmentCheck.addEventListener("change", () => setBusy(false));
refs.input.addEventListener("input", () => {
  refs.input.style.height = "auto";
  refs.input.style.height = `${Math.min(refs.input.scrollHeight, 150)}px`;
});
refs.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); refs.form.requestSubmit(); }
});
refs.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!apiReady) { showToast("AI servis nije povezan. Podesi lokalni backend prije slanja."); return; }
  if (refs.input.value.length > 20000) { showToast("Poruka je duža od dozvoljenih 20.000 znakova."); return; }
  if (pendingFiles.length && !refs.attachmentCheck.checked) { showToast("Potvrdi slanje sadržaja datoteka."); return; }
  const text = refs.input.value;
  refs.input.value = "";
  refs.input.style.height = "auto";
  await sendMessage(text);
});
document.querySelectorAll(".suggestion").forEach((button) => button.addEventListener("click", () => {
  refs.input.value = button.dataset.prompt;
  refs.input.focus();
  refs.input.dispatchEvent(new Event("input"));
}));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !refs.settingsModal.classList.contains("hidden")) closeSettings();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); newChat(); }
});

renderConversation();
loadProviderStatus();
