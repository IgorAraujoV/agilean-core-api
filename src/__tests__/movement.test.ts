import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

async function createProjectWithPackage(app: ReturnType<typeof buildApp>, token: string) {
  const bRes = await app.inject({ method: 'POST', url: '/buildings',
    headers: authHeaders(token),
    payload: { name: 'Test', firstDate: '2024-01-01' } });
  const buildingId: string = bRes.json().id;

  const dRes = await app.inject({ method: 'POST', url: `/buildings/${buildingId}/diagrams`,
    headers: authHeaders(token),
    payload: { name: 'Diagrama' } });
  const diagramId: string = dRes.json().id;

  const nRes = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
    headers: authHeaders(token),
    payload: { name: 'Rede' } });
  const networkId: string = nRes.json().id;

  const s1Res = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
    headers: authHeaders(token),
    payload: { name: 'Fase 1', duration: 5, latency: 0 } });
  const stage1Id: string = s1Res.json().id;

  const s2Res = await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
    headers: authHeaders(token),
    payload: { name: 'Fase 2', duration: 3, latency: 0 } });
  const stage2Id: string = s2Res.json().id;

  await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/precedences`,
    headers: authHeaders(token),
    payload: { sourceStageId: stage1Id, destinationStageId: stage2Id, opening: 1, latency: 0 } });

  const uRes = await app.inject({ method: 'POST', url: `/buildings/${buildingId}/typologies`,
    headers: authHeaders(token),
    payload: { name: 'Bloco A' } });
  const unitId: string = uRes.json().id;
  await app.inject({ method: 'POST', url: `/buildings/${buildingId}/typologies`,
    headers: authHeaders(token),
    payload: { name: 'Piso 1', parentId: unitId } });

  const lRes = await app.inject({ method: 'POST', url: `/buildings/${buildingId}/lines`,
    headers: authHeaders(token),
    payload: { networkId, placeId: unitId } });
  const lineId: string = lRes.json().id;

  const pkgsRes = await app.inject({ method: 'GET',
    url: `/buildings/${buildingId}/lines/${lineId}/packages`,
    headers: authHeaders(token) });
  const packages = pkgsRes.json() as Array<{ id: string; stageId: string; startCol: number }>;
  const firstPkg = packages.find(p => p.stageId === stage1Id)!;

  return { buildingId, firstPkg };
}

describe('Movement endpoint', () => {
  it('should move a package and return patch', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, firstPkg } = await createProjectWithPackage(app, token);

    const targetColumn = firstPkg.startCol + 2;
    const res = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/packages/${firstPkg.id}/move`,
      headers: authHeaders(token),
      payload: { column: targetColumn },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.movedCount).toBeGreaterThan(0);
    expect(body.packages[0].id).toBeDefined();

    const movedPkg = body.packages.find((p: { id: string }) => p.id === firstPkg.id);
    expect(movedPkg?.startCol).toBe(targetColumn);
  });

  it('should persist moved packages to DB', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, firstPkg } = await createProjectWithPackage(app, token);
    const targetColumn = firstPkg.startCol + 2;

    await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/packages/${firstPkg.id}/move`,
      headers: authHeaders(token),
      payload: { column: targetColumn } });

    const row = app.ctx.db
      .prepare('SELECT start_col FROM packages WHERE id = ?')
      .get(firstPkg.id) as { start_col: number } | undefined;
    expect(row?.start_col).toBe(targetColumn);
  });

  it('should return 404 for unknown package', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const bRes = await app.inject({ method: 'POST', url: '/buildings',
      headers: authHeaders(token),
      payload: { name: 'T', firstDate: '2024-01-01' } });
    const buildingId: string = bRes.json().id;

    const res = await app.inject({ method: 'POST',
      url: `/buildings/${buildingId}/packages/nonexistent/move`,
      headers: authHeaders(token),
      payload: { column: 5 } });
    expect(res.statusCode).toBe(404);
  });
});
