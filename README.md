# AI2Flow

Editor visual de jornadas com canvas livre, grid por lanes e conexões avançadas.

O projeto evoluiu de um flow editor genérico para uma ferramenta orientada a **jornadas cross-departamentais**, com foco em legibilidade, edição rápida e organização por raias/colunas.

## Estado atual da ferramenta

- **Canvas com React Flow**: pan/zoom (trackpad, mouse, spacebar), minimap e controles.
- **Grid por lanes**: lanes e colunas renderizadas como overlay (não como nodes), com expansão/redução de linha/coluna e validações.
- **Posicionamento derivado**: nodes em lanes são posicionados pelo par `laneId` + `columnIndex` (sem posição livre manual nesses casos).
- **Tipos de node**:
  - `action`: card principal da jornada
  - `comment`: observações rápidas no fluxo
  - `anchor`: ponto de roteamento livre para quebrar/organizar trajetos
- **Conexões avançadas**:
  - tipos de traçado (`bezier`, `smoothstep`, `straight`)
  - seta na origem/destino
  - convenção semântica de handles: `R1..R5`, `L1..L5`, `T1..T5`, `B1..B5`
  - edição de cotovelo e afastamento em conectores ortogonais
  - seleção automática de nova conexão para personalização
  - destaque visual forte quando edge está selecionada
- **Editor lateral**:
  - edição de nós, edges, títulos de lanes e colunas
  - conectores por lado (`0..5`) com campo numérico
  - canais por node e metadados JSON
- **Persistência**:
  - `localStorage`
  - import/export JSON em `public/flows/flow.json`
- **Histórico local**: undo/redo com snapshots.

## Stack

- `React 18`
- `TypeScript`
- `Vite`
- `@xyflow/react` (React Flow)
- `lucide-react`
- `dagre` (apoio para layout)

## Estrutura do projeto

```txt
src/
  components/
    FlowNode.tsx           # render dos nodes (action/comment/anchor)
    FlowLabeledEdge.tsx    # render das edges + label interativo
    LaneGridOverlay.tsx    # overlay de lanes/colunas e controles de grid
    NodeEditorPanel.tsx    # painel de edição contextual
    Toolbar.tsx            # ações gerais (add, layout, undo/redo etc.)
  constants/
    nodeTemplates.ts
    edgePath.ts
    laneColors.ts
    channels.ts
    fieldLimits.ts
    mockFlow.ts
  context/
    FlowCanvasContext.tsx
  types/
    flow.ts
  utils/
    storage.ts
    edgePathRail.ts
    orthogonalStraightSegments.ts
    orthogonalSliderApplicability.ts
  App.tsx                  # orquestração do estado, layout e eventos
  styles.css               # estilos globais e componentes visuais
public/
  flows/flow.json          # modelo de fluxo de referência
```

## Rodando localmente

Pré-requisito: Node.js via [nvm](https://github.com/nvm-sh/nvm).

```bash
# instala o nvm (só na primeira vez)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts

# instala dependências e sobe o servidor
npm install
npm run dev
```

Acesse em `http://localhost:5173`.

### Ambiente local do ColectOps

Para testar `http://localhost:5173/colectops` com login e transcrição:

1. copie `.env.example` para `.env.local`
2. preencha:
   - `ASSEMBLYAI_API_KEY`
   - `ACCESS_PASSWORD`
3. rode `npm run dev`

O servidor de desenvolvimento do Vite faz o proxy local de `/api/transcribe/*` usando essas variáveis.

Build:

```bash
npm run build
npm run preview
```

## Deploy

O deploy é automático via **Vercel**. Todo push na branch `main` dispara um novo deploy.

Fluxo padrao de publicacao (private -> public):

```bash
# no private
scripts/publish-to-public.sh --apply

# no public (../cxstudio)
npm ci
npm run build
git add .
git commit -m "descricao"
git push origin main
```

Acompanhe o status em [vercel.com/dashboard](https://vercel.com/dashboard).

### Dry-run de sincronizacao

Antes de aplicar, voce pode auditar o que sera enviado:

```bash
scripts/publish-to-public.sh --dry-run
```

Os caminhos permitidos para publicacao ficam em `publish-allowlist.txt`.

## Documentacao de arquitetura e evolucao

A documentacao agora segue modelo de portfolio (`cxstudio` pai de `ai2flow` e `colectops`).

Comece por:

- `docs/README.md`
- `docs/platform/PORTFOLIO_ARCHITECTURE.md`
- `docs/products/ai2flow/README.md`
- `docs/products/colectops/README.md`

Pacote tecnico atual de AI2Flow:

- `docs/products/ai2flow/ARCHITECTURE.md`
- `docs/products/ai2flow/PROJECT_REVIEW.md`
- `docs/products/ai2flow/TEAM_ONBOARDING.md`
- `docs/products/ai2flow/DOMAIN_MODEL.md`
- `docs/products/ai2flow/PERSISTENCE.md`
- `docs/products/ai2flow/SCALING_ARCHITECTURE.md`
- `docs/products/ai2flow/PROJECT_HANDOFF_AI2FLOW.md`
- `docs/products/ai2flow/CONTRIBUTING.md`

## Convenção de conectores (handles)

- `R1..R5`: lado direito
- `L1..L5`: lado esquerdo
- `T1..T5`: topo
- `B1..B5`: base

Padrão sugerido para fluxos simples:

- `sourceHandle: "R1"`
- `targetHandle: "L1"`

Observação: o app possui migração automática para formatos legados de handle, mas novos JSONs devem seguir a convenção acima.
