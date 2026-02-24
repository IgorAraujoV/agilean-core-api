import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

async function createFullStructure(app: ReturnType<typeof buildApp>, token: string) {
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

  await app.inject({ method: 'POST',
    url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
    headers: authHeaders(token),
    payload: { name: 'Fase 1', duration: 5, latency: 0 } });

  const uRes = await app.inject({ method: 'POST', url: `/buildings/${buildingId}/typologies`,
    headers: authHeaders(token),
    payload: { name: 'Bloco A' } });
  const unitId: string = uRes.json().id;

  await app.inject({ method: 'POST', url: `/buildings/${buildingId}/typologies`,
    headers: authHeaders(token),
    payload: { name: 'Piso 1', parentId: unitId } });
  await app.inject({ method: 'POST', url: `/buildings/${buildingId}/typologies`,
    headers: authHeaders(token),
    payload: { name: 'Piso 2', parentId: unitId } });

  return { buildingId, networkId, unitId };
}

describe('Lines endpoints', () => {
  it('should create a line with packages persisted to DB', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, networkId, unitId } = await createFullStructure(app, token);

    const res = await app.inject({ method: 'POST', url: `/buildings/${buildingId}/lines`,
      headers: authHeaders(token),
      payload: { networkId, placeId: unitId } });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.packageCount).toBeGreaterThan(0);

    // Verificar que packages foram persistidos no SQLite
    const count = app.ctx.db
      .prepare('SELECT COUNT(*) as n FROM packages')
      .get() as { n: number };
    expect(count.n).toBe(body.packageCount);
  });

  it('should list lines', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, networkId, unitId } = await createFullStructure(app, token);
    await app.inject({ method: 'POST', url: `/buildings/${buildingId}/lines`,
      headers: authHeaders(token),
      payload: { networkId, placeId: unitId } });

    const res = await app.inject({ method: 'GET', url: `/buildings/${buildingId}/lines`,
      headers: authHeaders(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(1);
  });

  it('should return 404 for unknown building', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const res = await app.inject({ method: 'POST', url: '/buildings/unknown/lines',
      headers: authHeaders(token),
      payload: { networkId: 'n1', placeId: 'p1' } });
    expect(res.statusCode).toBe(404);
  });

  it('should list packages with dates, status and progress', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const { buildingId, networkId, unitId } = await createFullStructure(app, token);
    const createRes = await app.inject({ method: 'POST', url: `/buildings/${buildingId}/lines`,
      headers: authHeaders(token),
      payload: { networkId, placeId: unitId } });
    const lineId: string = createRes.json().id;

    const res = await app.inject({ method: 'GET',
      url: `/buildings/${buildingId}/lines/${lineId}/packages`,
      headers: authHeaders(token) });
    expect(res.statusCode).toBe(200);
    const pkgs = res.json();
    expect(pkgs.length).toBeGreaterThan(0);

    const pkg = pkgs[0];
    expect(typeof pkg.startCol).toBe('number');
    expect(typeof pkg.endCol).toBe('number');
    expect(pkg.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(pkg.endDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(pkg.plannedStartDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(pkg.plannedEndDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(pkg.executionStart).toBeNull();
    expect(pkg.executionEnd).toBeNull();
    expect(pkg.estimatedEnd).toBeNull();
    expect(pkg.status).toBe(1); // Status.PLANNED = 1
    expect(pkg.progress).toBe(0);
  });

  it('should return 404 for unknown line in packages endpoint', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const bRes = await app.inject({ method: 'POST', url: '/buildings',
      headers: authHeaders(token),
      payload: { name: 'T', firstDate: '2024-01-01' } });
    const buildingId: string = bRes.json().id;

    const res = await app.inject({ method: 'GET',
      url: `/buildings/${buildingId}/lines/unknown/packages`,
      headers: authHeaders(token) });
    expect(res.statusCode).toBe(404);
  });
});
