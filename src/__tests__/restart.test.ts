import fs from 'fs';
import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

/**
 * Simula reinício do servidor: app2 compartilha o mesmo SQLite mas tem
 * storage em memória vazio. Todos os endpoints que precisam do Building
 * em memória devem hidratar automaticamente via BuildingLoader.
 */
describe('Server restart: routes hydrate building from DB', () => {
  function tmpDb() {
    return `/tmp/agilean-restart-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  }

  it('GET /diagrams returns 200 after restart (storage empty)', async () => {
    const dbPath = tmpDb();
    try {
      const app1 = buildApp({ dbPath });
      const token = await getAuthToken(app1);

      const bRes = await app1.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'Restart Test', firstDate: '2024-01-01' },
      });
      const { id: buildingId } = bRes.json() as { id: string };

      // Restart: novo app, mesmo DB, storage vazio
      const app2 = buildApp({ dbPath });
      const res = await app2.inject({
        method: 'GET',
        url: `/buildings/${buildingId}/diagrams`,
        headers: authHeaders(token),
      });

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('POST /diagrams returns 201 after restart (storage empty)', async () => {
    const dbPath = tmpDb();
    try {
      const app1 = buildApp({ dbPath });
      const token = await getAuthToken(app1);

      const bRes = await app1.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'Restart Test', firstDate: '2024-01-01' },
      });
      const { id: buildingId } = bRes.json() as { id: string };

      // Restart
      const app2 = buildApp({ dbPath });
      const res = await app2.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/diagrams`,
        headers: authHeaders(token),
        payload: { name: 'Novo Diagrama' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Novo Diagrama');
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('GET /typologies returns 200 after restart (storage empty)', async () => {
    const dbPath = tmpDb();
    try {
      const app1 = buildApp({ dbPath });
      const token = await getAuthToken(app1);

      const bRes = await app1.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'Restart Test', firstDate: '2024-01-01' },
      });
      const { id: buildingId } = bRes.json() as { id: string };

      // Restart
      const app2 = buildApp({ dbPath });
      const res = await app2.inject({
        method: 'GET',
        url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token),
      });

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('GET /lines/:lineId/packages returns packages after restart', async () => {
    const dbPath = tmpDb();
    try {
      const app1 = buildApp({ dbPath });
      const token = await getAuthToken(app1);

      // 1. Criar building + diagrama + network + stage + places
      const bRes = await app1.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'Restart Pkg Test', firstDate: '2024-01-01' },
      });
      const buildingId: string = bRes.json().id;

      const dRes = await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/diagrams`,
        headers: authHeaders(token), payload: { name: 'Diagrama' },
      });
      const diagramId: string = dRes.json().id;

      const nRes = await app1.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
        headers: authHeaders(token), payload: { name: 'Rede' },
      });
      const networkId: string = nRes.json().id;

      await app1.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
        headers: authHeaders(token),
        payload: { name: 'Fase 1', duration: 5, latency: 0 },
      });

      const uRes = await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Bloco A' },
      });
      const unitId: string = uRes.json().id;

      await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Piso 1', parentId: unitId },
      });
      await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Piso 2', parentId: unitId },
      });

      // 2. Criar line (gera teams e packages)
      const lineRes = await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/lines`,
        headers: authHeaders(token),
        payload: { networkId, placeId: unitId },
      });
      expect(lineRes.statusCode).toBe(201);
      const lineId: string = lineRes.json().id;
      const packageCountBefore: number = lineRes.json().packageCount;
      expect(packageCountBefore).toBeGreaterThan(0);

      // 3. Verificar packages antes do restart
      const pkgsBefore = await app1.inject({
        method: 'GET',
        url: `/buildings/${buildingId}/lines/${lineId}/packages`,
        headers: authHeaders(token),
      });
      expect(pkgsBefore.json().length).toBe(packageCountBefore);

      // 4. Restart: novo app, mesmo DB, storage vazio
      const app2 = buildApp({ dbPath });

      // 5. Verificar packages APÓS o restart
      const pkgsAfter = await app2.inject({
        method: 'GET',
        url: `/buildings/${buildingId}/lines/${lineId}/packages`,
        headers: authHeaders(token),
      });
      expect(pkgsAfter.statusCode).toBe(200);
      const pkgsAfterJson = pkgsAfter.json();
      expect(pkgsAfterJson.length).toBe(packageCountBefore);

      // 6. Verificar que os IDs e dados dos packages batem
      const idsBefore = new Set(pkgsBefore.json().map((p: any) => p.id));
      const idsAfter = new Set(pkgsAfterJson.map((p: any) => p.id));
      expect(idsAfter).toEqual(idsBefore);

      // 7. Verificar que stageId não se perdeu na hidratação
      for (const pkg of pkgsAfterJson) {
        expect(pkg.stageId).toBeTruthy();
      }
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('unknown buildingId still returns 404 after restart logic', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const res = await app.inject({
      method: 'GET',
      url: '/buildings/nonexistent-id/diagrams',
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
  });

  it('GET /typologies returns place dates after restart', async () => {
    const dbPath = tmpDb();
    try {
      const app1 = buildApp({ dbPath });
      const token = await getAuthToken(app1);

      const bRes = await app1.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'Restart Dates', firstDate: '2024-01-01' },
      });
      const buildingId = bRes.json().id;

      const pRes = await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Bloco A' },
      });
      const placeId = pRes.json().id;

      await app1.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${placeId}`,
        headers: authHeaders(token),
        payload: { startDate: '2024-02-01T08:00:00.000Z', endDate: '2024-06-01T08:00:00.000Z' },
      });

      // Restart: new app, same DB, empty storage
      const app2 = buildApp({ dbPath });
      const res = await app2.inject({
        method: 'GET', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token),
      });

      expect(res.statusCode).toBe(200);
      const units = res.json() as Array<{ id: string; startDate: string | null; endDate: string | null }>;
      const unit = units.find(u => u.id === placeId);
      expect(unit).toBeDefined();
      expect(unit!.startDate).toBeTruthy();
      expect(unit!.endDate).toBeTruthy();
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });
});
