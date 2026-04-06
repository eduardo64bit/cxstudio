import "../styles/design-system.css";

const componentCatalog = [
  "AiEditorPanel",
  "AnchorGlyph",
  "ColectOpsApp",
  "EdgeArrowMarkerIcon",
  "EdgeLineAppearanceIcons",
  "EdgePathTypeIcon",
  "FlowLabeledEdge",
  "FlowNode",
  "LaneGridOverlay",
  "LoginModal",
  "NodeEditorPanel",
  "ServiceHub",
  "Toolbar",
];

const colorTokens = [
  { name: "--bg-primary", value: "#f3f4f6" },
  { name: "--bg-card", value: "#ffffff" },
  { name: "--accent-primary", value: "#1f2937" },
  { name: "--accent-secondary", value: "#2563eb" },
  { name: "--accent-tertiary", value: "#dc2626" },
  { name: "--text-primary", value: "#17202a" },
  { name: "--text-secondary", value: "#475569" },
  { name: "--border-color", value: "#e2e8f0" },
];

export default function DesignSystemPage() {
  return (
    <main className="ds-page">
      <header className="ds-header">
        <p className="ds-eyebrow">CXStudio</p>
        <h1>Design System</h1>
        <p>Página única para revisar e ajustar padrões visuais do AI2Flow e ColectOps.</p>
      </header>

      <section className="ds-section">
        <h2>Paleta Base</h2>
        <div className="ds-color-grid">
          {colorTokens.map((token) => (
            <article key={token.name} className="ds-color-card">
              <div className="ds-color-swatch" style={{ background: token.value }} />
              <strong>{token.name}</strong>
              <span>{token.value}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="ds-section">
        <h2>Tipografia</h2>
        <div className="ds-typography">
          <p className="ds-text-xs">Texto XS - suporte e metadados</p>
          <p className="ds-text-sm">Texto SM - labels e secundário</p>
          <p className="ds-text-md">Texto MD - corpo padrão</p>
          <p className="ds-text-lg">Texto LG - títulos internos</p>
          <p className="ds-text-xl">Texto XL - cabeçalho</p>
        </div>
      </section>

      <section className="ds-section">
        <h2>Botões</h2>
        <div className="ds-buttons">
          <button className="ds-btn ds-btn-primary" type="button">
            Primário
          </button>
          <button className="ds-btn ds-btn-secondary" type="button">
            Secundário
          </button>
          <button className="ds-btn ds-btn-danger" type="button">
            Danger
          </button>
          <button className="ds-btn ds-btn-ghost" type="button">
            Ghost
          </button>
        </div>
      </section>

      <section className="ds-section">
        <h2>Inputs e Feedback</h2>
        <div className="ds-forms">
          <label className="ds-label" htmlFor="ds-input">
            Exemplo de input
          </label>
          <input id="ds-input" className="ds-input" type="text" placeholder="Digite algo..." />
          <p className="ds-help">Texto auxiliar para orientar preenchimento.</p>
          <p className="ds-error">Mensagem de erro de validação.</p>
        </div>
      </section>

      <section className="ds-section">
        <h2>Badges de Falante (ColectOps)</h2>
        <div className="ds-speakers">
          <span className="colectops-speaker colectops-speaker--a">Falante A</span>
          <span className="colectops-speaker colectops-speaker--b">Falante B</span>
          <span className="colectops-speaker colectops-speaker--c">Falante C</span>
          <span className="colectops-speaker colectops-speaker--d">Falante D</span>
        </div>
      </section>

      <section className="ds-section">
        <h2>Catálogo de Componentes</h2>
        <p className="ds-caption">Componentes atuais disponíveis no domínio principal do app.</p>
        <div className="ds-components-grid">
          {componentCatalog.map((componentName) => (
            <div key={componentName} className="ds-component-item">
              <code>{componentName}</code>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
