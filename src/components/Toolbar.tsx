import { useEffect, useRef } from "react";
import {
  Crosshair,
  FolderOpen,
  ImageDown,
  MessageSquare,
  RefreshCw,
  Save,
  SaveAll,
  SquarePen,
  Sparkles,
  Zap,
} from "lucide-react";
import { EDGE_PATH_LABELS, FLOW_EDGE_PATH_TYPES, type FlowEdgePathType } from "../constants/edgePath";
import type { FlowNodeType } from "../types/flow";
import { NODE_TYPE_LABELS } from "../constants/nodeTemplates";
import { EdgePathTypeIcon } from "./EdgePathTypeIcon";

interface ToolbarProps {
  aiMode: boolean;
  onAiModeToggle: () => void;
  editorPanelOpen: boolean;
  onEditorPanelToggle: () => void;
  onAddNode: (nodeType: FlowNodeType) => void;
  onSave: () => void;
  onSaveAs: () => void;
  /** SVG do fluxo visível (Figma / edição vetorial). */
  onExportSvg: () => void;
  onOpen: (file: File) => void;
  onReloadProjectFlow: () => void;
  defaultEdgePathType: FlowEdgePathType;
  onDefaultEdgePathTypeChange: (type: FlowEdgePathType) => void;
}

export default function Toolbar({
  aiMode,
  onAiModeToggle,
  editorPanelOpen,
  onEditorPanelToggle,
  onAddNode,
  onSave,
  onSaveAs,
  onExportSvg,
  onOpen,
  onReloadProjectFlow,
  defaultEdgePathType,
  onDefaultEdgePathTypeChange,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileMenuRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (fileMenuRef.current?.contains(target)) return;
      fileMenuRef.current?.removeAttribute("open");
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <header className="toolbar">
      <div className="toolbar__left">
        <div className="toolbar-ai-group" role="group" aria-label="Modo IA">
          <button
            type="button"
            className={`secondary icon-only-button${aiMode ? " toolbar-icon-toggle--selected" : ""}`}
            onClick={onAiModeToggle}
            title={aiMode ? "Sair do modo IA" : "Modo IA"}
            aria-pressed={aiMode}
            aria-label={aiMode ? "Desativar modo IA" : "Ativar modo IA"}
          >
            <Sparkles size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="toolbar-separator" aria-hidden />
        <div className="toolbar-add-node-group" role="group" aria-label="Adicionar nó">
          <button
            type="button"
            className="secondary icon-only-button"
            onClick={() => onAddNode("action")}
            title={`Adicionar ${NODE_TYPE_LABELS.action}`}
            aria-label={`Adicionar ${NODE_TYPE_LABELS.action}`}
          >
            <Zap size={18} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="secondary icon-only-button"
            onClick={() => onAddNode("comment")}
            title={`Adicionar ${NODE_TYPE_LABELS.comment}`}
            aria-label={`Adicionar ${NODE_TYPE_LABELS.comment}`}
          >
            <MessageSquare size={18} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="secondary icon-only-button"
            onClick={() => onAddNode("anchor")}
            title={`Adicionar ${NODE_TYPE_LABELS.anchor}`}
            aria-label={`Adicionar ${NODE_TYPE_LABELS.anchor}`}
          >
            <Crosshair size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="toolbar-separator" aria-hidden />
        <div className="toolbar-edge-path-group" role="radiogroup" aria-label="Padrão de conexão">
          {FLOW_EDGE_PATH_TYPES.map((value) => {
            const selected = defaultEdgePathType === value;
            return (
              <button
                key={value}
                type="button"
                className={`secondary icon-only-button${selected ? " toolbar-icon-toggle--selected" : ""}`}
                role="radio"
                aria-checked={selected}
                onClick={() => onDefaultEdgePathTypeChange(value)}
                title={EDGE_PATH_LABELS[value]}
                aria-label={EDGE_PATH_LABELS[value]}
              >
                <EdgePathTypeIcon pathType={value} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="toolbar__right">
        <div className="toolbar-separator" aria-hidden />
        <details ref={fileMenuRef} className="toolbar-file-menu">
          <summary className="secondary icon-only-button" title="Arquivo" aria-label="Arquivo">
            <Save size={18} strokeWidth={2} aria-hidden />
          </summary>
          <div className="toolbar-file-menu__list" role="menu" aria-label="Funções de arquivo">
            <button
              type="button"
              className="toolbar-file-menu__item"
              role="menuitem"
              onClick={() => fileInputRef.current?.click()}
            >
              <FolderOpen size={16} strokeWidth={2} aria-hidden />
              <span>Abrir</span>
            </button>
            <button type="button" className="toolbar-file-menu__item" role="menuitem" onClick={onReloadProjectFlow}>
              <RefreshCw size={16} strokeWidth={2} aria-hidden />
              <span>Recarregar</span>
            </button>
            <button type="button" className="toolbar-file-menu__item" role="menuitem" onClick={onSave}>
              <Save size={16} strokeWidth={2} aria-hidden />
              <span>Salvar</span>
            </button>
            <button type="button" className="toolbar-file-menu__item" role="menuitem" onClick={onSaveAs}>
              <SaveAll size={16} strokeWidth={2} aria-hidden />
              <span>Salvar como…</span>
            </button>
            <button type="button" className="toolbar-file-menu__item" role="menuitem" onClick={onExportSvg}>
              <ImageDown size={16} strokeWidth={2} aria-hidden />
              <span>Exportar SVG</span>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onOpen(file);
              e.currentTarget.value = "";
            }}
          />
        </details>
        <div className="toolbar-separator" aria-hidden />
        <button
          type="button"
          className={`secondary icon-only-button${editorPanelOpen ? " toolbar-icon-toggle--selected" : ""}`}
          onClick={onEditorPanelToggle}
          title={editorPanelOpen ? "Ocultar painel de edição" : "Mostrar painel de edição"}
          aria-pressed={editorPanelOpen}
          aria-label={editorPanelOpen ? "Ocultar painel de edição da direita" : "Mostrar painel de edição da direita"}
        >
          <SquarePen size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </header>
  );
}
