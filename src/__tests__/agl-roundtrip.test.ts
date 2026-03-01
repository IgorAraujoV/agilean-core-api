import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

/**
 * Fixture AGL mínima reutilizada do import test.
 * Usa formato C++ (plannedStartDate, etc.)
 */
function makeAglFixture() {
  return {
    company: {
      id: 'company-001',
      name: 'Test Company',
      code: '',
      buildingCompanies: [{
        id: 'bc-001',
        name: '',
        code: '',
        companyId: 'company-001',
        stages: [],
        branchOffices: [{
          id: 'bo-001',
          name: '',
          buildingCompanyId: 'bc-001',
          buildings: [{
            id: 'building-rt-001',
            name: 'Obra Round-Trip',
            code: '',
            todayEnabled: true,
            places: [
              { id: 'unit-rt', name: 'Torre RT', level: 0, index: 0, buffer: 0, sequence: 0, path: '' },
              { id: 'local-rt-1', name: '1 Pav', level: 1, index: 0, parentId: 'unit-rt', buffer: 0, sequence: 0, path: '' },
              { id: 'local-rt-2', name: '2 Pav', level: 1, index: 1, parentId: 'unit-rt', buffer: 0, sequence: 0, path: '' },
            ],
            days: [],
            expedients: [],
          }],
        }],
      }],
    },
    diagrams: [{
      id: 'diag-rt',
      name: 'Rede RT',
      index: 0,
      sequence: 0,
      buildingId: 'building-rt-001',
      networks: [{
        id: 'net-rt',
        name: 'Rede 1',
        color: '#FF0000',
        textColor: '#FFFFFF',
        stageNetworks: [
          {
            id: 'stage-rt-1',
            name: 'Fundação',
            shortName: 'FND',
            duration: 5,
            latency: 0,
            direction: 0,
            color: '#FF0000',
            index: 0,
            sequence: 0,
            stageId: '',
            cycles: [],
            precedences: [],
          },
          {
            id: 'stage-rt-2',
            name: 'Estrutura',
            shortName: 'EST',
            duration: 10,
            latency: 0,
            direction: 0,
            color: '#00FF00',
            index: 1,
            sequence: 1,
            stageId: '',
            cycles: [],
            precedences: [
              { id: 'prec-rt', sourceId: 'stage-rt-1', destinationId: 'stage-rt-2', openning: 0, latency: 0 },
            ],
          },
        ],
      }],
    }],
    lines: [{
      id: 'line-rt',
      name: '',
      code: '',
      type: 0,
      index: 0,
      networkId: 'net-rt',
      placeId: 'unit-rt',
      dateCreated: '2024-01-01T00:00:00.000Z',
      teams: [
        {
          id: 'team-rt-1',
          stageNetworkId: 'stage-rt-1',
          lineId: 'line-rt',
          index: 0,
          resources: 1,
          isStandaloneTeam: false,
          packages: [
            {
              id: 'pkg-rt-1', placeId: 'local-rt-1', code: 'FND-1', duration: 5,
              status: 1, progress: 0, cost: 100, costLabor: 50,
              plannedStartDate: '2024-01-02T08:00:00.000Z',
              plannedEndDate: '2024-01-08T15:00:00.000Z',
              parentId: null, packageId: 'pkg-rt-1', stageId: 'stage-rt-1',
              children: [], links: [],
            },
            {
              id: 'pkg-rt-2', placeId: 'local-rt-2', code: 'FND-2', duration: 5,
              status: 1, progress: 0, cost: 100, costLabor: 50,
              plannedStartDate: '2024-01-09T08:00:00.000Z',
              plannedEndDate: '2024-01-15T15:00:00.000Z',
              parentId: null, packageId: 'pkg-rt-2', stageId: 'stage-rt-1',
              children: [], links: [],
            },
          ],
        },
        {
          id: 'team-rt-2',
          stageNetworkId: 'stage-rt-2',
          lineId: 'line-rt',
          index: 0,
          resources: 1,
          isStandaloneTeam: false,
          packages: [
            {
              id: 'pkg-rt-3', placeId: 'local-rt-1', code: 'EST-1', duration: 10,
              status: 1, progress: 0, cost: 200, costLabor: 100,
              plannedStartDate: '2024-01-09T08:00:00.000Z',
              plannedEndDate: '2024-01-22T15:00:00.000Z',
              parentId: null, packageId: 'pkg-rt-3', stageId: 'stage-rt-2',
              children: [], links: [],
            },
            {
              id: 'pkg-rt-4', placeId: 'local-rt-2', code: 'EST-2', duration: 10,
              status: 1, progress: 0, cost: 200, costLabor: 100,
              plannedStartDate: '2024-01-16T08:00:00.000Z',
              plannedEndDate: '2024-01-29T15:00:00.000Z',
              parentId: null, packageId: 'pkg-rt-4', stageId: 'stage-rt-2',
              children: [], links: [],
            },
          ],
        },
      ],
    }],
    createdDate: '2024-01-01T00:00:00.000Z',
    updatedDate: '2024-01-01T00:00:00.000Z',
    fileScheduleId: 'building-rt-001',
  };
}

describe('AGL Round-trip (import → export → re-import)', () => {
  it('should produce equivalent buildings after round-trip', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    // 1. Import original AGL
    const import1Res = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: makeAglFixture(),
    });
    expect(import1Res.statusCode).toBe(201);
    const building1 = import1Res.json();

    // 2. Evict from memory to force SQLite reload
    app.ctx.storage.delete(building1.id);

    // 3. Export as AGL
    const exportRes = await app.inject({
      method: 'GET',
      url: `/buildings/${building1.id}/export`,
      headers: authHeaders(token),
    });
    expect(exportRes.statusCode).toBe(200);
    const exportedAgl = exportRes.json();

    // 4. Re-import the exported AGL into a fresh DB (avoids ID conflicts)
    const app2 = buildApp();
    const token2 = await getAuthToken(app2);

    const import2Res = await app2.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token2),
      payload: exportedAgl,
    });
    if (import2Res.statusCode !== 201) {
      console.error('Re-import failed:', import2Res.json());
    }
    expect(import2Res.statusCode).toBe(201);
    const building2 = import2Res.json();

    // 5. Compare structures
    expect(building2.name).toBe('Obra Round-Trip');
    expect(building2.diagramCount).toBe(1);
    expect(building2.placeCount).toBe(building1.placeCount);

    // 6. Compare diagrams
    const diag1Res = await app.inject({
      method: 'GET',
      url: `/buildings/${building1.id}/diagrams`,
      headers: authHeaders(token),
    });
    const diag2Res = await app2.inject({
      method: 'GET',
      url: `/buildings/${building2.id}/diagrams`,
      headers: authHeaders(token2),
    });
    const diag1 = diag1Res.json();
    const diag2 = diag2Res.json();
    expect(diag1).toHaveLength(1);
    expect(diag2).toHaveLength(1);
    expect(diag1[0].name).toBe(diag2[0].name);

    // 7. Compare lines
    const lines1Res = await app.inject({
      method: 'GET',
      url: `/buildings/${building1.id}/lines`,
      headers: authHeaders(token),
    });
    const lines2Res = await app2.inject({
      method: 'GET',
      url: `/buildings/${building2.id}/lines`,
      headers: authHeaders(token2),
    });
    const lines1 = lines1Res.json();
    const lines2 = lines2Res.json();
    expect(lines1).toHaveLength(1);
    expect(lines2).toHaveLength(1);

    // 8. Compare packages
    const pkg1Res = await app.inject({
      method: 'GET',
      url: `/buildings/${building1.id}/lines/${lines1[0].id}/packages`,
      headers: authHeaders(token),
    });
    const pkg2Res = await app2.inject({
      method: 'GET',
      url: `/buildings/${building2.id}/lines/${lines2[0].id}/packages`,
      headers: authHeaders(token2),
    });
    const pkgs1 = pkg1Res.json();
    const pkgs2 = pkg2Res.json();
    expect(pkgs1.length).toBe(pkgs2.length);
    expect(pkgs1.length).toBe(4);
  });

  it('exported AGL should be valid C++ format (re-importable)', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    // Import
    const importRes = await app.inject({
      method: 'POST',
      url: '/buildings/import',
      headers: authHeaders(token),
      payload: makeAglFixture(),
    });
    const { id: buildingId } = importRes.json();

    // Evict + export
    app.ctx.storage.delete(buildingId);
    const exportRes = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/export`,
      headers: authHeaders(token),
    });
    const agl = exportRes.json();

    // Verify the exported AGL has the correct top-level structure for C++
    expect(agl.company).toBeDefined();
    expect(agl.diagrams).toBeDefined();
    expect(agl.lines).toBeDefined();
    expect(Array.isArray(agl.diagrams)).toBe(true);
    expect(Array.isArray(agl.lines)).toBe(true);

    // C++ requires these three top-level keys to not be null (datastore.cpp line 517)
    expect(agl.company).not.toBeNull();
    expect(agl.diagrams).not.toBeNull();
    expect(agl.lines).not.toBeNull();

    // Packages must use C++ date keys
    const firstTeam = agl.lines[0]?.teams?.[0];
    if (firstTeam?.packages?.length > 0) {
      const pkg = firstTeam.packages[0];
      // C++ keys must be present
      expect('plannedStartDate' in pkg || 'plannedEndDate' in pkg).toBe(true);
      // TS keys must NOT be present
      expect(pkg.plannedStart).toBeUndefined();
      expect(pkg.executionStart).toBeUndefined();
    }
  });
});
