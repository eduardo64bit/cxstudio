const AI2FLOW_PATH = "/ai2flow";
const COLECTOPS_URL = "/colectops";

export default function ServiceHub() {
  return (
    <main className="service-hub">
      <section className="service-hub__hero">
        <p className="service-hub__eyebrow">CXStudio</p>
        <h1 className="service-hub__title">Escolha o servico</h1>
        <p className="service-hub__subtitle">O CXStudio centraliza os produtos da operacao.</p>
      </section>

      <section className="service-hub__grid" aria-label="Servicos disponiveis">
        <article className="service-card">
          <p className="service-card__tag">Operacoes</p>
          <h2 className="service-card__title">ColectOps</h2>
          <p className="service-card__text">Gestao operacional e acompanhamento de processos.</p>
          <a className="service-card__link" href={COLECTOPS_URL}>
            Abrir ColectOps
          </a>
        </article>

        <article className="service-card">
          <p className="service-card__tag">Jornadas</p>
          <h2 className="service-card__title">AI2Flow</h2>
          <p className="service-card__text">Editor visual de jornadas (antigo CXStudio).</p>
          <a className="service-card__link" href={AI2FLOW_PATH}>
            Abrir AI2Flow
          </a>
        </article>
      </section>
    </main>
  );
}
