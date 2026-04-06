import { useState } from "react";
import { Mic, Send } from "lucide-react";

/**
 * Painel lateral do modo IA (layout placeholder; integração futura).
 */
export default function AiEditorPanel() {
  const [prompt, setPrompt] = useState("");

  return (
    <aside className="node-panel ai-panel">
      <h2>Modo IA</h2>
      <p className="ai-panel__hint">Descreva o fluxo ou a alteração desejada. Integração em seguida.</p>
      <label className="ai-panel__prompt-label">
        <span className="ai-panel__prompt-caption">Prompt</span>
        <textarea
          className="ai-panel__prompt"
          rows={8}
          value={prompt}
          placeholder="Ex.: adicionar um passo de validação após o início…"
          onChange={(e) => setPrompt(e.target.value)}
          spellCheck={false}
        />
      </label>
      <div className="ai-panel__actions">
        <button
          type="button"
          className="secondary icon-only-button"
          title="Voz (em breve)"
          aria-label="Conversar por voz com a IA"
          disabled
        >
          <Mic size={16} strokeWidth={2} aria-hidden />
        </button>
        <button type="button" className="ai-panel__send" disabled title="Enviar (em breve)" aria-label="Enviar prompt">
          <Send size={16} strokeWidth={2} aria-hidden />
          <span>Enviar</span>
        </button>
      </div>
    </aside>
  );
}
