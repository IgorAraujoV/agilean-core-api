import fs from 'fs';
import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

describe('PATCH /typologies/:placeId dates', () => {
  function tmpDb() {
    return `/tmp/agilean-typology-dates-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  }

  it('sets startDate and endDate on a unit', async () => {
    const dbPath = tmpDb();
    try {
      const app = buildApp({ dbPath });
      const token = await getAuthToken(app);

      const bRes = await app.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'DateTest', firstDate: '2024-01-01' },
      });
      const buildingId = bRes.json().id;

      const pRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Bloco A' },
      });
      const placeId = pRes.json().id;

      const res = await app.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${placeId}`,
        headers: authHeaders(token),
        payload: { startDate: '2024-02-01T08:00:00.000Z', endDate: '2024-06-01T08:00:00.000Z' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().startDate).toBeTruthy();
      expect(res.json().endDate).toBeTruthy();
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('clears dates with null', async () => {
    const dbPath = tmpDb();
    try {
      const app = buildApp({ dbPath });
      const token = await getAuthToken(app);

      const bRes = await app.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'DateTest', firstDate: '2024-01-01' },
      });
      const buildingId = bRes.json().id;

      const pRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Bloco A' },
      });
      const placeId = pRes.json().id;

      // Set dates first
      await app.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${placeId}`,
        headers: authHeaders(token),
        payload: { startDate: '2024-02-01T08:00:00.000Z' },
      });

      // Clear with null
      const res = await app.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${placeId}`,
        headers: authHeaders(token),
        payload: { startDate: null },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().startDate).toBeNull();
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('returns 400 for non-unit place', async () => {
    const dbPath = tmpDb();
    try {
      const app = buildApp({ dbPath });
      const token = await getAuthToken(app);

      const bRes = await app.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'DateTest', firstDate: '2024-01-01' },
      });
      const buildingId = bRes.json().id;

      const pRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Bloco A' },
      });
      const unitId = pRes.json().id;

      // Create child (level 1)
      const cRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Apto 101', parentId: unitId },
      });
      const childId = cRes.json().id;

      const res = await app.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${childId}`,
        headers: authHeaders(token),
        payload: { startDate: '2024-02-01T08:00:00.000Z' },
      });

      expect(res.statusCode).toBe(400);
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('setting startDate forward moves packages and persists to SQL', async () => {
    const dbPath = tmpDb();
    try {
      const app = buildApp({ dbPath });
      const token = await getAuthToken(app);
      const H = authHeaders(token);

      // 1. Create building (firstDate = Mon 2024-01-08)
      const bRes = await app.inject({
        method: 'POST', url: '/buildings', headers: H,
        payload: { name: 'MoveTest', firstDate: '2024-01-08' },
      });
      const buildingId = bRes.json().id;

      // 2. Create diagram + network + stage
      const dRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/diagrams`,
        headers: H, payload: { name: 'Diag' },
      });
      const diagramId = dRes.json().id;

      const nRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
        headers: H, payload: { name: 'Rede' },
      });
      const networkId = nRes.json().id;

      await app.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
        headers: H, payload: { name: 'Fundação', duration: 5, latency: 0 },
      });

      // 3. Create unit + 2 floors
      const uRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: H, payload: { name: 'Bloco A' },
      });
      const unitId = uRes.json().id;

      await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: H, payload: { name: 'Piso 1', parentId: unitId },
      });
      await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: H, payload: { name: 'Piso 2', parentId: unitId },
      });

      // 4. Create line → generates packages
      const lRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/lines`,
        headers: H, payload: { networkId, placeId: unitId },
      });
      const lineId = lRes.json().id;

      // 5. Get packages BEFORE setting startDate
      const beforeRes = await app.inject({
        method: 'GET', url: `/buildings/${buildingId}/lines/${lineId}/packages`,
        headers: H,
      });
      expect(beforeRes.statusCode).toBe(200);
      const pkgsBefore = beforeRes.json() as Array<{ id: string; startCol: number; endCol: number; endDate: string }>;
      expect(pkgsBefore.length).toBeGreaterThan(0);

      // 6. Set startDate well AFTER the current package positions
      //    Read the latest package endDate and add 30 days
      const latestEnd = pkgsBefore.reduce((max, p) => Math.max(max, p.endCol), 0);
      const latestPkgDate = new Date(pkgsBefore.find(p => p.endCol === latestEnd)!.endDate);
      latestPkgDate.setDate(latestPkgDate.getDate() + 30);
      const startDate = latestPkgDate.toISOString();
      const patchRes = await app.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${unitId}`,
        headers: H, payload: { startDate },
      });
      expect(patchRes.statusCode).toBe(200);

      // 7. Get packages AFTER setting startDate
      const afterRes = await app.inject({
        method: 'GET', url: `/buildings/${buildingId}/lines/${lineId}/packages`,
        headers: H,
      });
      const pkgsAfter = afterRes.json() as Array<{ id: string; startCol: number; endCol: number }>;

      // All packages must have moved forward
      for (const pkg of pkgsAfter) {
        const before = pkgsBefore.find(p => p.id === pkg.id)!;
        expect(pkg.startCol).toBeGreaterThan(before.startCol);
      }

      // 8. Restart: new app, same DB, empty storage → positions must persist
      const app2 = buildApp({ dbPath });
      const restartRes = await app2.inject({
        method: 'GET', url: `/buildings/${buildingId}/lines/${lineId}/packages`,
        headers: H,
      });
      expect(restartRes.statusCode).toBe(200);
      const pkgsRestart = restartRes.json() as Array<{ id: string; startCol: number; endCol: number }>;

      // Positions after restart must match the moved positions
      for (const pkg of pkgsRestart) {
        const afterPkg = pkgsAfter.find(p => p.id === pkg.id)!;
        expect(pkg.startCol).toBe(afterPkg.startCol);
        expect(pkg.endCol).toBe(afterPkg.endCol);
      }

      // Positions after restart must be DIFFERENT from originals
      for (const pkg of pkgsRestart) {
        const before = pkgsBefore.find(p => p.id === pkg.id)!;
        expect(pkg.startCol).toBeGreaterThan(before.startCol);
      }
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('clearing startDate allows packages to move back to original positions', async () => {
    const dbPath = tmpDb();
    try {
      const app = buildApp({ dbPath });
      const token = await getAuthToken(app);
      const H = authHeaders(token);

      // Setup: building + diagram + network + stage + unit + floors + line
      const bRes = await app.inject({
        method: 'POST', url: '/buildings', headers: H,
        payload: { name: 'ClearTest', firstDate: '2024-01-08' },
      });
      const buildingId = bRes.json().id;

      const dRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/diagrams`,
        headers: H, payload: { name: 'Diag' },
      });
      const diagramId = dRes.json().id;

      const nRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
        headers: H, payload: { name: 'Rede' },
      });
      const networkId = nRes.json().id;

      await app.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
        headers: H, payload: { name: 'Estrutura', duration: 5, latency: 0 },
      });

      const uRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: H, payload: { name: 'Bloco B' },
      });
      const unitId = uRes.json().id;

      await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: H, payload: { name: 'Piso 1', parentId: unitId },
      });

      const lRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/lines`,
        headers: H, payload: { networkId, placeId: unitId },
      });
      const lineId = lRes.json().id;

      // Get original positions
      const origRes = await app.inject({
        method: 'GET', url: `/buildings/${buildingId}/lines/${lineId}/packages`, headers: H,
      });
      const pkgsOrig = origRes.json() as Array<{ id: string; startCol: number; endCol: number; endDate: string }>;

      // Set startDate well AFTER current package positions
      const latestEnd = pkgsOrig.reduce((max, p) => Math.max(max, p.endCol), 0);
      const latestPkgDate = new Date(pkgsOrig.find(p => p.endCol === latestEnd)!.endDate);
      latestPkgDate.setDate(latestPkgDate.getDate() + 30);
      await app.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${unitId}`,
        headers: H, payload: { startDate: latestPkgDate.toISOString() },
      });

      // Verify moved
      const movedRes = await app.inject({
        method: 'GET', url: `/buildings/${buildingId}/lines/${lineId}/packages`, headers: H,
      });
      const pkgsMoved = movedRes.json() as Array<{ id: string; startCol: number }>;
      for (const pkg of pkgsMoved) {
        const orig = pkgsOrig.find(p => p.id === pkg.id)!;
        expect(pkg.startCol).toBeGreaterThan(orig.startCol);
      }

      // Clear startDate → packages should be free to go back (via reposition)
      const clearRes = await app.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${unitId}`,
        headers: H, payload: { startDate: null },
      });
      expect(clearRes.statusCode).toBe(200);
      expect(clearRes.json().startDate).toBeNull();
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });
});
