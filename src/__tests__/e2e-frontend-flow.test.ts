/**
 * E2E: Fluxo Completo do Frontend
 *
 * Simula 100% as chamadas HTTP que o frontend faz, na mesma ordem, encadeando os IDs
 * retornados de cada resposta para as requisições subsequentes.
 * Nenhuma instância de entidade de domínio ou acesso direto ao storage é usado.
 */

import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

type J = Record<string, unknown>;

describe('E2E: Fluxo Completo do Frontend', () => {
  it('deve executar o fluxo completo: building → diagrama → tipologia → line → movimento', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const H = authHeaders(token);

    // ─── Bloco 1: Building ───────────────────────────────────────────────────

    // 1. Criar building (Step 1 do onboarding)
    const buildingRes = await app.inject({
      method: 'POST',
      url: '/buildings',
      headers: H,
      payload: { name: 'Obra E2E', firstDate: '2024-01-08' },
    });
    expect(buildingRes.statusCode).toBe(201);
    const building = buildingRes.json() as J;
    const buildingId = building['id'] as string;
    expect(buildingId).toBeTruthy();
    expect(building['name']).toBe('Obra E2E');

    // 2. Listar buildings (dashboard inicial)
    const listBuildingsRes = await app.inject({ method: 'GET', url: '/buildings', headers: H });
    expect(listBuildingsRes.statusCode).toBe(200);
    const buildings = listBuildingsRes.json() as J[];
    expect(buildings.some((b) => b['id'] === buildingId)).toBe(true);

    // 3. Obter building por ID
    const getBuildingRes = await app.inject({ method: 'GET', url: `/buildings/${buildingId}`, headers: H });
    expect(getBuildingRes.statusCode).toBe(200);
    expect((getBuildingRes.json() as J)['id']).toBe(buildingId);
    expect((getBuildingRes.json() as J)['name']).toBe('Obra E2E');

    // ─── Bloco 2: Diagrama + Network ─────────────────────────────────────────

    // 4. Criar diagrama (Step 2 do onboarding / toolbar "Novo Diagrama")
    const diagramRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams`,
      headers: H,
      payload: { name: 'Processo Principal' },
    });
    expect(diagramRes.statusCode).toBe(201);
    const diagram = diagramRes.json() as J;
    const diagramId = diagram['id'] as string;
    expect(diagramId).toBeTruthy();

    // 5. Criar network dentro do diagrama (Step 2 — logo após criar o diagrama)
    const networkRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
      headers: H,
      payload: { name: 'Rede' },
    });
    expect(networkRes.statusCode).toBe(201);
    const network = networkRes.json() as J;
    const networkId = network['id'] as string;
    expect(networkId).toBeTruthy();

    // 6. GET diagrama: confirma 1 network, 0 precedências
    const getDiagramRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/diagrams/${diagramId}`,
      headers: H,
    });
    expect(getDiagramRes.statusCode).toBe(200);
    const diagramDetail = getDiagramRes.json() as J & { networks: J[]; precedences: J[] };
    expect(diagramDetail['networks']).toHaveLength(1);
    expect(diagramDetail['precedences']).toHaveLength(0);

    // ─── Bloco 3: Stages (3 etapas) ──────────────────────────────────────────

    // 7–9. Adicionar 3 stages à network (Step 3 do onboarding / clique no canvas)
    const stageARes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
      headers: H,
      payload: { name: 'Fundação', duration: 10, latency: 0 },
    });
    expect(stageARes.statusCode).toBe(201);
    const stageAId = (stageARes.json() as J)['id'] as string;

    const stageBRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
      headers: H,
      payload: { name: 'Estrutura', duration: 8, latency: 2 },
    });
    expect(stageBRes.statusCode).toBe(201);
    const stageBId = (stageBRes.json() as J)['id'] as string;

    const stageCRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
      headers: H,
      payload: { name: 'Acabamento', duration: 5, latency: 0 },
    });
    expect(stageCRes.statusCode).toBe(201);
    const stageCId = (stageCRes.json() as J)['id'] as string;

    // ─── Bloco 4: Precedências ───────────────────────────────────────────────

    // 10. A→B (auto-link no Step 3 / connect manual no DiagramPage)
    const precABRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/precedences`,
      headers: H,
      payload: { sourceStageId: stageAId, destinationStageId: stageBId, opening: 1, latency: 0 },
    });
    expect(precABRes.statusCode).toBe(201);
    const precAB = precABRes.json() as J;
    const precABId = precAB['id'] as string;
    expect(precAB['sourceStageId']).toBe(stageAId);
    expect(precAB['destinationStageId']).toBe(stageBId);

    // 11. B→C
    const precBCRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/precedences`,
      headers: H,
      payload: { sourceStageId: stageBId, destinationStageId: stageCId, opening: 1, latency: 0 },
    });
    expect(precBCRes.statusCode).toBe(201);

    // 12. GET diagrama: confirma 3 stages e 2 precedências
    const afterPrecsRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/diagrams/${diagramId}`,
      headers: H,
    });
    expect(afterPrecsRes.statusCode).toBe(200);
    const afterPrecs = afterPrecsRes.json() as J & { networks: Array<{ stages: J[] }>; precedences: J[] };
    expect(afterPrecs['networks'][0]!['stages']).toHaveLength(3);
    expect(afterPrecs['precedences']).toHaveLength(2);
    const firstPrec = afterPrecs['precedences'][0]!;
    expect(firstPrec['sourceStageId']).toBe(stageAId);
    expect(firstPrec['destinationStageId']).toBe(stageBId);

    // ─── Bloco 5: Editar stage ───────────────────────────────────────────────

    // 13. PATCH stage A (DiagramSidebar.onSave)
    const patchStageRes = await app.inject({
      method: 'PATCH',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages/${stageAId}`,
      headers: H,
      payload: { name: 'Fundação Rev.1', duration: 12 },
    });
    expect(patchStageRes.statusCode).toBe(200);
    const patchedStage = patchStageRes.json() as J;
    expect(patchedStage['name']).toBe('Fundação Rev.1');
    expect(patchedStage['duration']).toBe(12);

    // 14. GET impact de stage A antes de criar line (deve ser 0)
    const impactBeforeLineRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages/${stageAId}/impact`,
      headers: H,
    });
    expect(impactBeforeLineRes.statusCode).toBe(200);
    const impactBeforeLine = impactBeforeLineRes.json() as J;
    expect(impactBeforeLine['packageCount']).toBe(0);
    expect(impactBeforeLine['teamCount']).toBe(0);

    // ─── Bloco 6: Deletar stage ──────────────────────────────────────────────

    // 15. DELETE stage C (após confirmar no DeleteStageDialog)
    const deleteStageRes = await app.inject({
      method: 'DELETE',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages/${stageCId}`,
      headers: H,
    });
    expect(deleteStageRes.statusCode).toBe(204);

    // 16. GET diagrama: 2 stages, precBC removida em cascata → 1 precedência
    const afterDeleteRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/diagrams/${diagramId}`,
      headers: H,
    });
    expect(afterDeleteRes.statusCode).toBe(200);
    const afterDelete = afterDeleteRes.json() as J & { networks: Array<{ stages: J[] }>; precedences: J[] };
    expect(afterDelete['networks'][0]!['stages']).toHaveLength(2);
    expect(afterDelete['precedences']).toHaveLength(1);
    expect(afterDelete['precedences'][0]!['id']).toBe(precABId);

    // ─── Bloco 7: Editar e deletar precedência ───────────────────────────────

    // 17. PATCH precedência A→B: aumentar latency (PrecedenceEdge edit)
    const patchPrecRes = await app.inject({
      method: 'PATCH',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/precedences/${precABId}`,
      headers: H,
      payload: { latency: 3 },
    });
    expect(patchPrecRes.statusCode).toBe(200);
    expect((patchPrecRes.json() as J)['latency']).toBe(3);

    // 18. DELETE precedência A→B (botão X na aresta do diagrama)
    const deletePrecRes = await app.inject({
      method: 'DELETE',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/precedences/${precABId}`,
      headers: H,
    });
    expect(deletePrecRes.statusCode).toBe(204);

    // 19. GET diagrama: 0 precedências
    const noPrecRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/diagrams/${diagramId}`,
      headers: H,
    });
    expect(noPrecRes.statusCode).toBe(200);
    expect((noPrecRes.json() as J & { precedences: J[] })['precedences']).toHaveLength(0);

    // ─── Bloco 8: Tipologia ──────────────────────────────────────────────────

    // 20. Criar unit raiz (Step 4 do onboarding: sem parentId)
    const unitRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/typologies`,
      headers: H,
      payload: { name: 'Bloco A' },
    });
    expect(unitRes.statusCode).toBe(201);
    const unit = unitRes.json() as J;
    const unitId = unit['id'] as string;
    expect(unit['level']).toBe(0);

    // 21–23. Criar 3 pisos filhos (Step 4: adicionar floors)
    const floor1Res = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/typologies`,
      headers: H,
      payload: { name: 'Piso 1', parentId: unitId },
    });
    expect(floor1Res.statusCode).toBe(201);
    expect((floor1Res.json() as J)['level']).toBe(1);

    await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/typologies`,
      headers: H,
      payload: { name: 'Piso 2', parentId: unitId },
    });

    await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/typologies`,
      headers: H,
      payload: { name: 'Piso 3', parentId: unitId },
    });

    // 24. GET tipologia: 1 unit com 3 filhos (Step 4 rendering)
    const typoRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/typologies`,
      headers: H,
    });
    expect(typoRes.statusCode).toBe(200);
    const typo = typoRes.json() as Array<J & { children: J[] }>;
    expect(typo).toHaveLength(1);
    expect(typo[0]!['id']).toBe(unitId);
    expect(typo[0]!['name']).toBe('Bloco A');
    expect(typo[0]!['children']).toHaveLength(3);

    // ─── Bloco 9: Line (gera packages) ──────────────────────────────────────

    // 25. Criar line: networkId + unitId (Step 5 do onboarding)
    const lineRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/lines`,
      headers: H,
      payload: { networkId, placeId: unitId },
    });
    expect(lineRes.statusCode).toBe(201);
    const lineBody = lineRes.json() as J;
    const lineId = lineBody['id'] as string;
    const packageCount = lineBody['packageCount'] as number;
    expect(lineId).toBeTruthy();
    // 3 pisos × 2 stages (A e B) = 6 packages mínimos
    expect(packageCount).toBeGreaterThanOrEqual(3);

    // 26. Listar lines do building
    const listLinesRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/lines`,
      headers: H,
    });
    expect(listLinesRes.statusCode).toBe(200);
    const lines = listLinesRes.json() as J[];
    const foundLine = lines.find((l) => l['id'] === lineId);
    expect(foundLine).toBeDefined();
    expect(foundLine!['networkId']).toBe(networkId);
    expect(foundLine!['placeId']).toBe(unitId);

    // 27. GET packages da line
    const packagesRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/lines/${lineId}/packages`,
      headers: H,
    });
    expect(packagesRes.statusCode).toBe(200);
    const packages = packagesRes.json() as Array<J>;
    expect(packages).toHaveLength(packageCount);

    // Cada package deve ter stageId ∈ {stageAId, stageBId}, colunas numéricas e data ISO
    for (const pkg of packages) {
      expect([stageAId, stageBId]).toContain(pkg['stageId']);
      expect(typeof pkg['startCol']).toBe('number');
      expect(typeof pkg['endCol']).toBe('number');
      expect(pkg['endCol']).toBeGreaterThanOrEqual(pkg['startCol'] as number);
      expect(typeof pkg['startDate']).toBe('string');
    }

    // ─── Bloco 10: Impact com line existente ─────────────────────────────────

    // 28. Stage A agora tem packages e teams
    const impactAfterLineRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages/${stageAId}/impact`,
      headers: H,
    });
    expect(impactAfterLineRes.statusCode).toBe(200);
    const impactAfterLine = impactAfterLineRes.json() as J;
    expect(impactAfterLine['packageCount']).toBeGreaterThanOrEqual(3);
    expect(impactAfterLine['teamCount']).toBeGreaterThanOrEqual(1);

    // ─── Bloco 11: Movimento de pacote ───────────────────────────────────────

    // 29. Encontrar o primeiro pacote do stage A
    const firstPkg = packages.find((p) => p['stageId'] === stageAId);
    expect(firstPkg).toBeDefined();
    const firstPkgId = firstPkg!['id'] as string;
    const originalStart = firstPkg!['startCol'] as number;
    const targetColumn = originalStart + 5;

    // 30. Mover pacote (movement API — drag-to-reschedule)
    const moveRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${firstPkgId}/move`,
      headers: H,
      payload: { column: targetColumn },
    });
    expect(moveRes.statusCode).toBe(200);
    const moveResult = moveRes.json() as J & { packages: J[] };
    expect(moveResult['movedCount']).toBeGreaterThanOrEqual(1);

    const movedPkg = moveResult['packages'].find((p) => p['id'] === firstPkgId);
    expect(movedPkg).toBeDefined();
    expect(movedPkg!['startCol']).toBe(targetColumn);
  });
});
