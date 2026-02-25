import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

/**
 * Cenário:
 *   Stages: A, B, C, D, E, F, G, H, I  (duration=5, latency=0)
 *   Precedências:
 *     A→B→C
 *     B→D→E→H
 *     D→F
 *     D→G→I
 *
 *   Grafo:
 *     A → B → C
 *         ↓
 *         D → E → H
 *         ├→ F
 *         └→ G → I
 *
 *   Tipologia: Unit 1, 5 locais (pisos)
 *
 *   Move: Pacote da Etapa D (piso 1) para a direita
 *   Esperado: E, F, G, H, I devem se ajustar em cascata
 */

type J = Record<string, unknown>;

async function setupScenario(app: ReturnType<typeof buildApp>, token: string) {
  const H = authHeaders(token);

  // 1. Building
  const bRes = await app.inject({ method: 'POST', url: '/buildings',
    headers: H, payload: { name: 'Movimento Dependentes', firstDate: '2024-01-01' } });
  expect(bRes.statusCode).toBe(201);
  const buildingId = (bRes.json() as J)['id'] as string;

  // 2. Diagrama
  const dRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams`,
    headers: H, payload: { name: 'Diagrama Principal' } });
  expect(dRes.statusCode).toBe(201);
  const diagramId = (dRes.json() as J)['id'] as string;

  // 3. Network
  const nRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
    headers: H, payload: { name: 'Rede 1' } });
  expect(nRes.statusCode).toBe(201);
  const networkId = (nRes.json() as J)['id'] as string;

  // 4. Stages: A, B, C, D, E, F, G, H, I
  const stageNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  const stageIds: Record<string, string> = {};
  for (const name of stageNames) {
    const sRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
      headers: H, payload: { name, duration: 5, latency: 0 } });
    expect(sRes.statusCode).toBe(201);
    stageIds[name] = (sRes.json() as J)['id'] as string;
  }

  // 5. Precedências: A→B, B→C, B→D, D→E, D→F, D→G, E→H, G→I
  const precedences: [string, string][] = [
    ['A', 'B'], ['B', 'C'], ['B', 'D'],
    ['D', 'E'], ['D', 'F'], ['D', 'G'],
    ['E', 'H'], ['G', 'I'],
  ];
  for (const [src, dst] of precedences) {
    const pRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/precedences`,
      headers: H, payload: {
        sourceStageId: stageIds[src]!,
        destinationStageId: stageIds[dst]!,
        opening: 1,
        latency: 0,
      } });
    expect(pRes.statusCode).toBe(201);
  }

  // 6. Tipologia: 1 unit + 5 locais
  const uRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/typologies`,
    headers: H, payload: { name: 'Bloco 1' } });
  expect(uRes.statusCode).toBe(201);
  const unitId = (uRes.json() as J)['id'] as string;

  for (let i = 1; i <= 5; i++) {
    const fRes = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/typologies`,
      headers: H, payload: { name: `Piso ${i}`, parentId: unitId } });
    expect(fRes.statusCode).toBe(201);
  }

  // 7. Criar Line (Network + Unit)
  const lRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/lines`,
    headers: H, payload: { networkId, placeId: unitId } });
  expect(lRes.statusCode).toBe(201);
  const lineId = (lRes.json() as J)['id'] as string;

  // 8. Buscar todos os pacotes
  const pkgsRes = await app.inject({ method: 'GET',
    url: `/buildings/${buildingId}/lines/${lineId}/packages`,
    headers: H });
  expect(pkgsRes.statusCode).toBe(200);
  const packages = pkgsRes.json() as Array<{
    id: string; stageId: string; placeId: string;
    startCol: number; endCol: number;
  }>;

  return { buildingId, lineId, stageIds, packages };
}

interface MovedPkg { id: string; startCol: number; endCol: number }

describe('Movement: dependentes em cascata', () => {
  it('ao mover stage D para a direita, dependentes E, F, G, H, I devem se ajustar', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const H = authHeaders(token);
    const { buildingId, lineId, stageIds, packages } = await setupScenario(app, token);

    // Pegar pacotes do piso 1 (primeiro local) para cada stage
    const pkgByStage = (stageName: string) => {
      const stageId = stageIds[stageName]!;
      // Piso 1 = menor startCol entre os pacotes do stage (é o primeiro no stacking)
      const stagePkgs = packages.filter(p => p.stageId === stageId);
      // Ordenar por startCol para pegar o primeiro piso
      stagePkgs.sort((a, b) => a.startCol - b.startCol);
      return stagePkgs[0]!;
    };

    const pkgD = pkgByStage('D');
    const pkgE = pkgByStage('E');
    const pkgF = pkgByStage('F');
    const pkgG = pkgByStage('G');
    const pkgH = pkgByStage('H');
    const pkgI = pkgByStage('I');

    // Posições iniciais antes do move
    const beforeD = pkgD.startCol;
    const beforeE = pkgE.startCol;
    const beforeF = pkgF.startCol;
    const beforeG = pkgG.startCol;
    const beforeH = pkgH.startCol;
    const beforeI = pkgI.startCol;

    // Sanity check: D deve estar posicionado DEPOIS de B
    const pkgB = pkgByStage('B');
    expect(pkgD.startCol).toBeGreaterThan(pkgB.startCol);

    // Move D para a direita em 10 colunas
    const shift = 10;
    const targetColumn = beforeD + shift;

    const moveRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${pkgD.id}/move`,
      headers: H,
      payload: { column: targetColumn },
    });

    expect(moveRes.statusCode).toBe(200);
    const moveBody = moveRes.json() as { movedCount: number; packages: MovedPkg[] };

    // Mais de 1 pacote deve ter sido movido (D + dependentes)
    expect(moveBody.movedCount).toBeGreaterThan(1);

    // D deve estar na resposta com a nova posição
    const movedD = moveBody.packages.find(p => p.id === pkgD.id);
    expect(movedD).toBeDefined();
    expect(movedD!.startCol).toBe(targetColumn);

    // duration=5, latency=0 → dependente começa em end+1 = start+5+1 = start+6
    const dEnd = targetColumn + 5; // endCol = startCol + duration

    // Dependentes diretos de D: E, F, G DEVEM estar na resposta
    const movedE = moveBody.packages.find(p => p.id === pkgE.id);
    const movedF = moveBody.packages.find(p => p.id === pkgF.id);
    const movedG = moveBody.packages.find(p => p.id === pkgG.id);

    expect(movedE).toBeDefined();
    expect(movedE!.startCol).toBeGreaterThanOrEqual(dEnd + 1);

    expect(movedF).toBeDefined();
    expect(movedF!.startCol).toBeGreaterThanOrEqual(dEnd + 1);

    expect(movedG).toBeDefined();
    expect(movedG!.startCol).toBeGreaterThanOrEqual(dEnd + 1);

    // Cascata: H depende de E, I depende de G
    const movedH = moveBody.packages.find(p => p.id === pkgH.id);
    const movedI = moveBody.packages.find(p => p.id === pkgI.id);

    expect(movedH).toBeDefined();
    expect(movedH!.startCol).toBeGreaterThanOrEqual(movedE!.endCol + 1);

    expect(movedI).toBeDefined();
    expect(movedI!.startCol).toBeGreaterThanOrEqual(movedG!.endCol + 1);

    // C NÃO deve ser afetado (C depende de B, não de D)
    const movedC = moveBody.packages.find(p => p.id === pkgByStage('C').id);
    expect(movedC).toBeUndefined();

    // A NÃO deve ser afetado
    const movedA = moveBody.packages.find(p => p.id === pkgByStage('A').id);
    expect(movedA).toBeUndefined();
  });

  it('após o move, re-fetch dos packages deve retornar posições atualizadas', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const H = authHeaders(token);
    const { buildingId, lineId, stageIds, packages } = await setupScenario(app, token);

    const pkgByStage = (stageName: string) => {
      const stageId = stageIds[stageName]!;
      const stagePkgs = packages.filter(p => p.stageId === stageId);
      stagePkgs.sort((a, b) => a.startCol - b.startCol);
      return stagePkgs[0]!;
    };

    const pkgD = pkgByStage('D');
    const shift = 10;
    const targetColumn = pkgD.startCol + shift;

    // Mover D
    const moveRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${pkgD.id}/move`,
      headers: H,
      payload: { column: targetColumn },
    });
    expect(moveRes.statusCode).toBe(200);
    const moveBody = moveRes.json() as { movedCount: number; packages: MovedPkg[] };

    // Re-fetch TODOS os packages via GET (simula o que o frontend faz)
    const refetchRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/lines/${lineId}/packages`,
      headers: H,
    });
    expect(refetchRes.statusCode).toBe(200);
    const refreshed = refetchRes.json() as Array<{
      id: string; stageId: string; startCol: number; endCol: number;
    }>;

    // Cada pacote retornado pelo move deve bater com o re-fetch
    for (const moved of moveBody.packages) {
      const fresh = refreshed.find(p => p.id === moved.id);
      expect(fresh).toBeDefined();
      expect(fresh!.startCol).toBe(moved.startCol);
      expect(fresh!.endCol).toBe(moved.endCol);
    }

    // Verificar que D no re-fetch está na posição correta
    const freshD = refreshed.find(p => p.id === pkgD.id);
    expect(freshD!.startCol).toBe(targetColumn);
  });

  it('após o move, DB deve refletir as novas posições de TODOS os pacotes movidos', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const H = authHeaders(token);
    const { buildingId, stageIds, packages } = await setupScenario(app, token);

    const pkgByStage = (stageName: string) => {
      const stageId = stageIds[stageName]!;
      const stagePkgs = packages.filter(p => p.stageId === stageId);
      stagePkgs.sort((a, b) => a.startCol - b.startCol);
      return stagePkgs[0]!;
    };

    const pkgD = pkgByStage('D');
    const shift = 10;
    const targetColumn = pkgD.startCol + shift;

    const moveRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${pkgD.id}/move`,
      headers: H,
      payload: { column: targetColumn },
    });
    const moveBody = moveRes.json() as { movedCount: number; packages: MovedPkg[] };

    // Verificar que CADA pacote movido foi persistido no SQLite
    for (const moved of moveBody.packages) {
      const row = app.ctx.db
        .prepare('SELECT start_col, end_col FROM packages WHERE id = ?')
        .get(moved.id) as { start_col: number; end_col: number } | undefined;
      expect(row).toBeDefined();
      expect(row!.start_col).toBe(moved.startCol);
      expect(row!.end_col).toBe(moved.endCol);
    }
  });
});
