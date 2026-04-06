const CONFIG = {
  UPLOAD_URL: "/api/transcribe/upload",
  PROXY_URL: "/api/transcribe",
  POLLING_INTERVAL: 5000,
  MAX_POLLING_ATTEMPTS: 120,
  MAX_FILE_SIZE: 1024 * 1024 * 1024,
  SUPPORTED_FORMATS: ["mp3", "wav", "m4a"],
  LANGUAGE_CODE: "pt",
  SESSION_KEY: "colectops_session",
  SESSION_DURATION: 24 * 60 * 60 * 1000,
};

let state = {
  isAuthenticated: false,
  sessionPassword: null,
  utterances: [],
  currentFile: null,
  isProcessing: false,
};

const elements = {
  loginSection: document.getElementById("loginSection"),
  loginForm: document.getElementById("loginForm"),
  passwordInput: document.getElementById("passwordInput"),
  togglePassword: document.getElementById("togglePassword"),
  loginError: document.getElementById("loginError"),
  mainApp: document.getElementById("mainApp"),
  logoutBtn: document.getElementById("logoutBtn"),
  uploadSection: document.getElementById("uploadSection"),
  processingSection: document.getElementById("processingSection"),
  resultsSection: document.getElementById("resultsSection"),
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  processingTitle: document.getElementById("processingTitle"),
  processingSubtitle: document.getElementById("processingSubtitle"),
  processingStatus: document.getElementById("processingStatus"),
  progressBar: document.getElementById("progressBar"),
  resultsContent: document.getElementById("resultsContent"),
  backBtn: document.getElementById("backBtn"),
  copyBtn: document.getElementById("copyBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toastMessage"),
};

function init() {
  checkSession();
  setupEventListeners();
}

function checkSession() {
  const session = localStorage.getItem(CONFIG.SESSION_KEY);
  if (session) {
    try {
      const sessionData = JSON.parse(session);
      const now = Date.now();
      if (sessionData.expiry > now) {
        state.isAuthenticated = true;
        state.sessionPassword = typeof sessionData.password === "string" ? sessionData.password : null;
        if (!state.sessionPassword) {
          localStorage.removeItem(CONFIG.SESSION_KEY);
          showLogin();
          return;
        }
        showMainApp();
        return;
      }
    } catch {}
    localStorage.removeItem(CONFIG.SESSION_KEY);
  }
  showLogin();
}

function createSession(password) {
  const sessionData = {
    created: Date.now(),
    expiry: Date.now() + CONFIG.SESSION_DURATION,
    password,
  };
  localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(sessionData));
}

function clearSession() {
  localStorage.removeItem(CONFIG.SESSION_KEY);
  state.isAuthenticated = false;
  state.sessionPassword = null;
}

function setupEventListeners() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.togglePassword.addEventListener("click", togglePasswordVisibility);
  elements.logoutBtn.addEventListener("click", handleLogout);
  elements.dropZone.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", handleFileSelect);
  elements.dropZone.addEventListener("dragover", handleDragOver);
  elements.dropZone.addEventListener("dragleave", handleDragLeave);
  elements.dropZone.addEventListener("drop", handleDrop);
  elements.backBtn.addEventListener("click", resetToUpload);
  elements.copyBtn.addEventListener("click", copyTranscription);
  elements.downloadBtn.addEventListener("click", downloadTranscription);
}

async function handleLogin(e) {
  e.preventDefault();
  const submitButton = elements.loginForm.querySelector("button[type='submit']");
  const password = elements.passwordInput.value;

  if (!password) {
    elements.loginError.classList.remove("hidden");
    return;
  }

  try {
    submitButton?.setAttribute("disabled", "true");
    const response = await fetch(`${CONFIG.PROXY_URL}/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Password": password,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error("invalid");
    }

    state.isAuthenticated = true;
    state.sessionPassword = password;
    createSession(password);
    elements.loginError.classList.add("hidden");
    showMainApp();
  } catch {
    elements.loginError.classList.remove("hidden");
    elements.passwordInput.value = "";
    elements.passwordInput.focus();
  } finally {
    submitButton?.removeAttribute("disabled");
  }
}

function handleLogout() {
  clearSession();
  state.utterances = [];
  state.currentFile = null;
  elements.passwordInput.value = "";
  showLogin();
}

function togglePasswordVisibility() {
  const input = elements.passwordInput;
  const eyeIcon = elements.togglePassword.querySelector(".eye-icon");
  const eyeOffIcon = elements.togglePassword.querySelector(".eye-off-icon");
  if (input.type === "password") {
    input.type = "text";
    eyeIcon.classList.add("hidden");
    eyeOffIcon.classList.remove("hidden");
  } else {
    input.type = "password";
    eyeIcon.classList.remove("hidden");
    eyeOffIcon.classList.add("hidden");
  }
}

function showLogin() {
  elements.loginSection.classList.remove("hidden");
  elements.mainApp.classList.add("hidden");
  elements.passwordInput.focus();
}

function showMainApp() {
  elements.loginSection.classList.add("hidden");
  elements.mainApp.classList.remove("hidden");
  showSection("upload");
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  elements.dropZone.classList.add("drag-over");
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  elements.dropZone.classList.remove("drag-over");
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  elements.dropZone.classList.remove("drag-over");
  const files = e.dataTransfer.files;
  if (files.length > 0) processFile(files[0]);
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) processFile(files[0]);
}

function validateFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (!CONFIG.SUPPORTED_FORMATS.includes(extension)) {
    throw new Error(`Formato nao suportado. Use: ${CONFIG.SUPPORTED_FORMATS.join(", ")}`);
  }
  if (file.size > CONFIG.MAX_FILE_SIZE) throw new Error("Arquivo muito grande. Tamanho maximo: 1GB");
  if (file.size === 0) throw new Error("O arquivo esta vazio");
  return true;
}

async function processFile(file) {
  if (!state.isAuthenticated) {
    showToast("Sessao expirada. Faca login novamente.", "error");
    handleLogout();
    return;
  }
  try {
    validateFile(file);
  } catch (error) {
    showToast(error.message, "error");
    return;
  }

  state.currentFile = file;
  state.isProcessing = true;
  showSection("processing");
  updateProgress(0, "Preparando upload...");

  try {
    updateProcessingUI("Enviando audio...", "Fazendo upload do arquivo para o servidor");
    updateProgress(10, `Enviando: ${file.name}`);
    const uploadUrl = await uploadAudio(file);
    updateProgress(30, "Upload concluido");

    updateProcessingUI("Iniciando transcricao...", "Processando audio com IA");
    updateProgress(40, "Iniciando processamento...");
    const transcriptId = await startTranscription(uploadUrl);
    updateProgress(50, "Transcricao iniciada");

    updateProcessingUI("Transcrevendo...", "Isso pode levar alguns minutos");
    const utterances = await pollTranscription(transcriptId);
    updateProgress(100, "Transcricao concluida!");

    state.utterances = utterances;
    displayResults(utterances);
  } catch (error) {
    console.error("Transcription error:", error);
    showToast(error.message, "error");
    resetToUpload();
  } finally {
    state.isProcessing = false;
  }
}

async function uploadAudio(file) {
  const response = await fetch(CONFIG.UPLOAD_URL, {
    method: "POST",
    headers: { "X-Password": state.sessionPassword },
    body: file,
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("API key invalida ou expirada");
    throw new Error(`Erro no upload: ${response.status}`);
  }
  const data = await response.json();
  if (!data.upload_url) throw new Error("Resposta invalida do servidor");
  return data.upload_url;
}

async function startTranscription(audioUrl) {
  const response = await fetch(`${CONFIG.PROXY_URL}/transcript`, {
    method: "POST",
    headers: {
      "X-Password": state.sessionPassword,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: CONFIG.LANGUAGE_CODE,
      speaker_labels: true,
    }),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Senha incorreta");
    throw new Error(`Erro ao iniciar transcricao: ${response.status}`);
  }
  const data = await response.json();
  if (!data.id) throw new Error("Resposta invalida ao iniciar transcricao");
  return data.id;
}

async function pollTranscription(transcriptId) {
  let attempts = 0;
  while (attempts < CONFIG.MAX_POLLING_ATTEMPTS) {
    const response = await fetch(`${CONFIG.PROXY_URL}/transcript/${transcriptId}`, {
      headers: { "X-Password": state.sessionPassword },
    });
    if (!response.ok) throw new Error(`Erro ao verificar transcricao: ${response.status}`);
    const data = await response.json();
    switch (data.status) {
      case "completed":
        if (!data.utterances) throw new Error("Transcricao completa mas sem dados de falantes");
        return data.utterances;
      case "error":
        throw new Error(`Erro na transcricao: ${data.error || "Erro desconhecido"}`);
      case "queued":
        updateProgress(50 + Math.min(attempts * 2, 40), "Na fila de processamento...");
        break;
      case "processing":
        updateProgress(50 + Math.min(attempts * 2, 45), "Processando audio...");
        break;
      default:
        throw new Error(`Status desconhecido: ${data.status}`);
    }
    attempts += 1;
    await sleep(CONFIG.POLLING_INTERVAL);
  }
  throw new Error("Timeout: A transcricao demorou muito para ser concluida");
}

function showSection(section) {
  elements.uploadSection.classList.add("hidden");
  elements.processingSection.classList.add("hidden");
  elements.resultsSection.classList.add("hidden");
  if (section === "upload") elements.uploadSection.classList.remove("hidden");
  if (section === "processing") elements.processingSection.classList.remove("hidden");
  if (section === "results") elements.resultsSection.classList.remove("hidden");
}

function updateProcessingUI(title, subtitle) {
  elements.processingTitle.textContent = title;
  elements.processingSubtitle.textContent = subtitle;
}

function updateProgress(percent, status) {
  elements.progressBar.style.width = `${percent}%`;
  if (status) elements.processingStatus.textContent = status;
}

function displayResults(utterances) {
  elements.resultsContent.innerHTML = "";
  utterances.forEach((utterance, index) => {
    const speakerClass = getSpeakerClass(utterance.speaker);
    const timeFormatted = formatTime(utterance.start);
    const el = document.createElement("div");
    el.className = "utterance";
    el.style.animationDelay = `${index * 50}ms`;
    el.innerHTML = `
      <div class="utterance-header">
        <span class="speaker-badge ${speakerClass}">Falante ${utterance.speaker}</span>
        <span class="utterance-time">${timeFormatted}</span>
      </div>
      <p class="utterance-text">${utterance.text}</p>
    `;
    elements.resultsContent.appendChild(el);
  });
  showSection("results");
}

function getSpeakerClass(speaker) {
  const speakers = ["A", "B", "C", "D"];
  const index = speakers.indexOf(speaker.toUpperCase());
  return index >= 0 ? `speaker-${speakers[index].toLowerCase()}` : "speaker-a";
}

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function resetToUpload() {
  state.utterances = [];
  state.currentFile = null;
  elements.fileInput.value = "";
  elements.progressBar.style.width = "0%";
  showSection("upload");
}

function copyTranscription() {
  const text = formatTranscriptionText();
  navigator.clipboard
    .writeText(text)
    .then(() => showToast("Transcricao copiada!", "success"))
    .catch(() => showToast("Erro ao copiar", "error"));
}

function downloadTranscription() {
  const text = formatTranscriptionText();
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const fileName = state.currentFile
    ? `transcricao_${state.currentFile.name.replace(/\.[^/.]+$/, "")}.txt`
    : "transcricao.txt";
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Download iniciado!", "success");
}

function formatTranscriptionText() {
  return state.utterances.map((u) => `Falante ${u.speaker}: ${u.text}`).join("\n\n");
}

function showToast(message, type = "info") {
  elements.toastMessage.textContent = message;
  elements.toast.className = `toast ${type}`;
  elements.toast.offsetHeight;
  elements.toast.classList.add("show");
  setTimeout(() => {
    elements.toast.classList.remove("show");
    setTimeout(() => {
      elements.toast.classList.add("hidden");
    }, 300);
  }, 3000);
  elements.toast.classList.remove("hidden");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

document.addEventListener("DOMContentLoaded", init);
