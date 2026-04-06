import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/colectops.css";

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
} as const;

type AppSection = "upload" | "processing" | "results";
type ToastType = "info" | "success" | "error";

interface Utterance {
  speaker: string;
  text: string;
  start: number;
}

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getSpeakerClass(speaker: string): string {
  const normalized = speaker.toUpperCase();
  if (normalized === "B") return "colectops-speaker--b";
  if (normalized === "C") return "colectops-speaker--c";
  if (normalized === "D") return "colectops-speaker--d";
  return "colectops-speaker--a";
}

function formatTranscriptionText(utterances: Utterance[]): string {
  return utterances.map((u) => `Falante ${u.speaker}: ${u.text}`).join("\n\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ColectOpsApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionPassword, setSessionPassword] = useState<string | null>(null);
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [section, setSection] = useState<AppSection>("upload");
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTitle, setProcessingTitle] = useState("Enviando audio...");
  const [processingSubtitle, setProcessingSubtitle] = useState("Aguarde enquanto processamos seu arquivo");
  const [processingStatus, setProcessingStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: "", type: "info" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (message: string, type: ToastType = "info") => {
    setToast({ visible: true, message, type });
    window.setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONFIG.SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { expiry?: number; password?: string };
      if (typeof parsed.expiry === "number" && parsed.expiry > Date.now() && typeof parsed.password === "string" && parsed.password) {
        setSessionPassword(parsed.password);
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem(CONFIG.SESSION_KEY);
      }
    } catch {
      localStorage.removeItem(CONFIG.SESSION_KEY);
    }
  }, []);

  const createSession = (password: string) => {
    const sessionData = {
      created: Date.now(),
      expiry: Date.now() + CONFIG.SESSION_DURATION,
      password,
    };
    localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(sessionData));
  };

  const clearSession = () => {
    localStorage.removeItem(CONFIG.SESSION_KEY);
    setIsAuthenticated(false);
    setSessionPassword(null);
  };

  const updateProgress = (next: number, status?: string) => {
    setProgress(next);
    if (status) setProcessingStatus(status);
  };

  const updateProcessingUI = (title: string, subtitle: string) => {
    setProcessingTitle(title);
    setProcessingSubtitle(subtitle);
  };

  const validateFile = (file: File) => {
    const extension = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!CONFIG.SUPPORTED_FORMATS.includes(extension as (typeof CONFIG.SUPPORTED_FORMATS)[number])) {
      throw new Error(`Formato nao suportado. Use: ${CONFIG.SUPPORTED_FORMATS.join(", ")}`);
    }
    if (file.size > CONFIG.MAX_FILE_SIZE) throw new Error("Arquivo muito grande. Tamanho maximo: 1GB");
    if (file.size === 0) throw new Error("O arquivo esta vazio");
  };

  const uploadAudio = async (file: File, password: string) => {
    const response = await fetch(CONFIG.UPLOAD_URL, {
      method: "POST",
      headers: { "X-Password": password },
      body: file,
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("Senha incorreta");
      throw new Error(`Erro no upload: ${response.status}`);
    }
    const data = (await response.json()) as { upload_url?: string };
    if (!data.upload_url) throw new Error("Resposta invalida do servidor");
    return data.upload_url;
  };

  const startTranscription = async (audioUrl: string, password: string) => {
    const response = await fetch(`${CONFIG.PROXY_URL}/transcript`, {
      method: "POST",
      headers: {
        "X-Password": password,
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
    const data = (await response.json()) as { id?: string };
    if (!data.id) throw new Error("Resposta invalida ao iniciar transcricao");
    return data.id;
  };

  const pollTranscription = async (transcriptId: string, password: string) => {
    let attempts = 0;
    while (attempts < CONFIG.MAX_POLLING_ATTEMPTS) {
      const response = await fetch(`${CONFIG.PROXY_URL}/transcript/${transcriptId}`, {
        headers: { "X-Password": password },
      });
      if (!response.ok) throw new Error(`Erro ao verificar transcricao: ${response.status}`);
      const data = (await response.json()) as { status?: string; utterances?: Utterance[]; error?: string };
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
  };

  const resetToUpload = () => {
    setUtterances([]);
    setCurrentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setProgress(0);
    setProcessingStatus("");
    setSection("upload");
  };

  const processFile = async (file: File) => {
    if (!isAuthenticated || !sessionPassword) {
      showToast("Sessao expirada. Faca login novamente.", "error");
      clearSession();
      return;
    }
    try {
      validateFile(file);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Arquivo invalido", "error");
      return;
    }

    setCurrentFile(file);
    setIsProcessing(true);
    setSection("processing");
    updateProgress(0, "Preparando upload...");

    try {
      updateProcessingUI("Enviando audio...", "Fazendo upload do arquivo para o servidor");
      updateProgress(10, `Enviando: ${file.name}`);
      const uploadUrl = await uploadAudio(file, sessionPassword);
      updateProgress(30, "Upload concluido");

      updateProcessingUI("Iniciando transcricao...", "Processando audio com IA");
      updateProgress(40, "Iniciando processamento...");
      const transcriptId = await startTranscription(uploadUrl, sessionPassword);
      updateProgress(50, "Transcricao iniciada");

      updateProcessingUI("Transcrevendo...", "Isso pode levar alguns minutos");
      const result = await pollTranscription(transcriptId, sessionPassword);
      updateProgress(100, "Transcricao concluida!");
      setUtterances(result);
      setSection("results");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Falha ao processar arquivo", "error");
      resetToUpload();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPassword) {
      setLoginError("Senha incorreta");
      return;
    }
    try {
      setIsSubmittingLogin(true);
      const response = await fetch(`${CONFIG.PROXY_URL}/auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Password": loginPassword,
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("invalid");
      setSessionPassword(loginPassword);
      setIsAuthenticated(true);
      createSession(loginPassword);
      setLoginError(null);
      setSection("upload");
    } catch {
      setLoginError("Senha incorreta");
      setLoginPassword("");
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setLoginPassword("");
    resetToUpload();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatTranscriptionText(utterances));
      showToast("Transcricao copiada!", "success");
    } catch {
      showToast("Erro ao copiar", "error");
    }
  };

  const handleDownload = () => {
    const text = formatTranscriptionText(utterances);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const fileName = currentFile ? `transcricao_${currentFile.name.replace(/\.[^/.]+$/, "")}.txt` : "transcricao.txt";
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast("Download iniciado!", "success");
  };

  const utteranceItems = useMemo(
    () =>
      utterances.map((utterance, index) => (
        <div key={`${utterance.start}-${index}`} className="colectops-utterance">
          <div className="colectops-utterance__header">
            <span className={`colectops-speaker ${getSpeakerClass(utterance.speaker)}`}>Falante {utterance.speaker}</span>
            <span className="colectops-utterance__time">{formatTime(utterance.start)}</span>
          </div>
          <p className="colectops-utterance__text">{utterance.text}</p>
        </div>
      )),
    [utterances],
  );

  if (!isAuthenticated) {
    return (
      <main className="colectops-shell">
        <section className="colectops-login">
          <h1>ColectOps</h1>
          <p>Transcricao com identificacao de falantes</p>
          <form onSubmit={handleLogin} className="colectops-login__form">
            <label htmlFor="colectops-password">Senha de acesso</label>
            <div className="colectops-password">
              <input
                id="colectops-password"
                type={showPassword ? "text" : "password"}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            {loginError ? <p className="colectops-login__error">{loginError}</p> : null}
            <button type="submit" disabled={isSubmittingLogin}>
              {isSubmittingLogin ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="colectops-shell">
      <header className="colectops-header">
        <div>
          <h1>ColectOps</h1>
          <p>Transcricao com identificacao de falantes</p>
        </div>
        <button onClick={handleLogout}>Sair</button>
      </header>

      {section === "upload" ? (
        <section className="colectops-upload">
          <div
            className={`colectops-dropzone${isDragOver ? " colectops-dropzone--over" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragOver(false);
            }}
            onDrop={handleDrop}
          >
            <h2>Arraste seu audio aqui</h2>
            <p>ou clique para selecionar</p>
            <small>MP3, WAV, M4A - Max 1GB</small>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4"
              hidden
              onChange={handleFileInputChange}
            />
          </div>
        </section>
      ) : null}

      {section === "processing" ? (
        <section className="colectops-processing">
          <h2>{processingTitle}</h2>
          <p>{processingSubtitle}</p>
          <div className="colectops-progress">
            <div style={{ width: `${progress}%` }} />
          </div>
          <p className="colectops-processing__status">{processingStatus}</p>
          {isProcessing ? <p className="colectops-processing__hint">Aguarde, isso pode levar alguns minutos.</p> : null}
        </section>
      ) : null}

      {section === "results" ? (
        <section className="colectops-results">
          <div className="colectops-results__actions">
            <button onClick={resetToUpload}>Nova transcricao</button>
            <div>
              <button onClick={handleCopy}>Copiar</button>
              <button onClick={handleDownload}>Baixar .txt</button>
            </div>
          </div>
          <div className="colectops-results__content">{utteranceItems}</div>
        </section>
      ) : null}

      {toast.visible ? <div className={`colectops-toast colectops-toast--${toast.type}`}>{toast.message}</div> : null}
    </main>
  );
}
