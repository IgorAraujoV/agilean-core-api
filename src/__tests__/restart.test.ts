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

  it('stack +1 survives restart with correct team indexes', async () => {
    const dbPath = tmpDb();
    try {
      const app1 = buildApp({ dbPath });
      const token = await getAuthToken(app1);

      // Create project with 5 floors
      const bRes = await app1.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'Restart Stack', firstDate: '2024-01-01' },
      });
      const buildingId: string = bRes.json().id;

      const dRes = await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/diagrams`,
        headers: authHeaders(token), payload: { name: 'D' },
      });
      const diagramId: string = dRes.json().id;

      const nRes = await app1.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
        headers: authHeaders(token), payload: { name: 'N' },
      });
      const networkId: string = nRes.json().id;

      const sRes = await app1.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
        headers: authHeaders(token),
        payload: { name: 'A', duration: 5, latency: 0 },
      });
      const stageId: string = sRes.json().id;

      const uRes = await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Bloco' },
      });
      const unitId: string = uRes.json().id;

      for (let i = 0; i < 5; i++) {
        await app1.inject({
          method: 'POST', url: `/buildings/${buildingId}/typologies`,
          headers: authHeaders(token), payload: { name: `P${i}`, parentId: unitId },
        });
      }

      const lRes = await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/lines`,
        headers: authHeaders(token),
        payload: { networkId, placeId: unitId },
      });
      const lineId: string = lRes.json().id;

      // Get a package to stack
      const pkgsRes = await app1.inject({
        method: 'GET',
        url: `/buildings/${buildingId}/lines/${lineId}/packages`,
        headers: authHeaders(token),
      });
      const packages = pkgsRes.json() as Array<{ id: string; stageId: string }>;
      const firstPkg = packages.find(p => p.stageId === stageId)!;

      // Stack +1
      const stackRes = await app1.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/packages/${firstPkg.id}/stack`,
        headers: authHeaders(token),
      });
      expect(stackRes.statusCode).toBe(200);
      const stackBody = stackRes.json();
      const newTeamId = stackBody.createdTeams[0].id;

      // Verify 2 teams before restart
      const teamsBefore = app1.ctx.db
        .prepare('SELECT id, position FROM teams WHERE line_id = ? ORDER BY position')
        .all(lineId) as Array<{ id: string; position: number }>;
      expect(teamsBefore.length).toBe(2);
      expect(teamsBefore[0]!.position).toBe(0);
      expect(teamsBefore[1]!.position).toBe(1);

      // --- Restart: new app, same DB, empty storage ---
      const app2 = buildApp({ dbPath });

      // Verify packages hydrate correctly after restart
      const pkgsAfter = await app2.inject({
        method: 'GET',
        url: `/buildings/${buildingId}/lines/${lineId}/packages`,
        headers: authHeaders(token),
      });
      expect(pkgsAfter.statusCode).toBe(200);
      const pkgsAfterJson = pkgsAfter.json() as Array<{ id: string; startCol: number; endCol: number }>;
      expect(pkgsAfterJson.length).toBe(5);

      // Verify exact stacked positions survived restart (parallel pairs)
      // Same setup as stacking.test.ts: 5 floors, duration 5, firstDate 2024-01-01
      const sorted = [...pkgsAfterJson].sort((a, b) => a.startCol - b.startCol);
      expect(sorted[0]!.startCol).toBe(84);
      expect(sorted[1]!.startCol).toBe(84);  // parallel
      expect(sorted[2]!.startCol).toBe(89);
      expect(sorted[3]!.startCol).toBe(89);  // parallel
      expect(sorted[4]!.startCol).toBe(94);

      // Verify team indexes are correct in DB after restart
      const teamsAfter = app2.ctx.db
        .prepare('SELECT id, position FROM teams WHERE line_id = ? ORDER BY position')
        .all(lineId) as Array<{ id: string; position: number }>;
      expect(teamsAfter.length).toBe(2);
      expect(teamsAfter[0]!.position).toBe(0);
      expect(teamsAfter[1]!.position).toBe(1);

      // Verify package-team associations survived restart
      const dbPkgsAfter = app2.ctx.db
        .prepare('SELECT id, team_id FROM packages WHERE stage_id = ? ORDER BY start_col')
        .all(stageId) as Array<{ id: string; team_id: string }>;
      const teamIdsAfter = [...new Set(dbPkgsAfter.map(p => p.team_id))];
      expect(teamIdsAfter.length).toBe(2);
      const onNewTeamAfter = dbPkgsAfter.filter(p => p.team_id === newTeamId);
      expect(onNewTeamAfter.length).toBe(2);
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('links persist after server restart', async () => {
    const dbPath = tmpDb();
    try {
      const app1 = buildApp({ dbPath });
      const token = await getAuthToken(app1);

      // 1. Create building with 2 stages + precedence, 2 floors, 1 line
      const bRes = await app1.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'Restart Links', firstDate: '2024-01-01' },
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

      const sARes = await app1.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
        headers: authHeaders(token),
        payload: { name: 'A', duration: 5, latency: 0 },
      });
      const stageAId: string = sARes.json().id;

      const sBRes = await app1.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
        headers: authHeaders(token),
        payload: { name: 'B', duration: 5, latency: 0 },
      });
      const stageBId: string = sBRes.json().id;

      await app1.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/diagrams/${diagramId}/precedences`,
        headers: authHeaders(token),
        payload: { sourceStageId: stageAId, destinationStageId: stageBId, opening: 1, latency: 0 },
      });

      const uRes = await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Bloco' },
      });
      const unitId: string = uRes.json().id;

      await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'P1', parentId: unitId },
      });
      await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'P2', parentId: unitId },
      });

      const lRes = await app1.inject({
        method: 'POST', url: `/buildings/${buildingId}/lines`,
        headers: authHeaders(token),
        payload: { networkId, placeId: unitId },
      });
      const lineId: string = lRes.json().id;

      // 2. Get packages, create a link with latency=3
      const pkgsRes = await app1.inject({
        method: 'GET',
        url: `/buildings/${buildingId}/lines/${lineId}/packages`,
        headers: authHeaders(token),
      });
      const allPkgs = pkgsRes.json() as Array<{ id: string; stageId: string }>;
      const stageAPkgs = allPkgs.filter(p => p.stageId === stageAId);
      const stageBPkgs = allPkgs.filter(p => p.stageId === stageBId);

      const linkRes = await app1.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/links`,
        headers: authHeaders(token),
        payload: {
          sourceId: stageAPkgs[0]!.id,
          destinationId: stageBPkgs[0]!.id,
          latency: 3,
        },
      });
      expect(linkRes.statusCode).toBe(201);
      const linkId: string = linkRes.json().id;

      // 3. Restart: create new app with same dbPath
      const app2 = buildApp({ dbPath });
      const token2 = await getAuthToken(app2);

      // 4. GET /links and verify the link survived
      const linksRes = await app2.inject({
        method: 'GET',
        url: `/buildings/${buildingId}/links`,
        headers: authHeaders(token2),
      });
      expect(linksRes.statusCode).toBe(200);
      const links = linksRes.json() as Array<{
        id: string; sourceId: string; destinationId: string;
        latency: number; locked: boolean;
      }>;
      expect(links.length).toBe(1);
      // Link ID is preserved after hydration (addLink accepts optional id)
      expect(links[0]!.id).toBe(linkId);
      expect(links[0]!.sourceId).toBe(stageAPkgs[0]!.id);
      expect(links[0]!.destinationId).toBe(stageBPkgs[0]!.id);
      expect(links[0]!.latency).toBe(3);
      expect(links[0]!.locked).toBe(true);
      // Verify the original link is still in DB with original ID
      const dbRow = app2.ctx.db
        .prepare('SELECT id, latency, locked FROM links WHERE id = ?')
        .get(linkId) as { id: string; latency: number; locked: number } | undefined;
      expect(dbRow).toBeDefined();
      expect(dbRow!.latency).toBe(3);
      expect(dbRow!.locked).toBe(1);
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
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
