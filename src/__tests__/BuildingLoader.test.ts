import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';
import { BuildingLoader } from '../loader/BuildingLoader';

describe('BuildingLoader', () => {
  it('loadStructure returns null for unknown buildingId', () => {
    const app = buildApp({ dbPath: ':memory:' });
    const loader = new BuildingLoader(app.ctx.db);
    expect(loader.loadStructure('nonexistent')).toBeNull();
  });

  it('loadStructure hydrates a building created via API', async () => {
    const app = buildApp({ dbPath: ':memory:' });
    const token = await getAuthToken(app);

    // Create building
    const bRes = await app.inject({
      method: 'POST', url: '/buildings', headers: authHeaders(token),
      payload: { name: 'Obra Persistida', firstDate: '2024-01-01' },
    });
    const buildingId: string = bRes.json().id;

    // Create diagram + network + stage
    const dRes = await app.inject({
      method: 'POST', url: `/buildings/${buildingId}/diagrams`, headers: authHeaders(token),
      payload: { name: 'Diagrama' },
    });
    const diagramId: string = dRes.json().id;

    const nRes = await app.inject({
      method: 'POST', url: `/buildings/${buildingId}/diagrams/${diagramId}/networks`,
      headers: authHeaders(token), payload: { name: 'Rede' },
    });
    const networkId: string = nRes.json().id;

    await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/diagrams/${diagramId}/networks/${networkId}/stages`,
      headers: authHeaders(token),
      payload: { name: 'Fase 1', duration: 5, latency: 0 },
    });

    // Create typology
    await app.inject({
      method: 'POST', url: `/buildings/${buildingId}/typologies`, headers: authHeaders(token),
      payload: { name: 'Bloco A' },
    });

    // Hydrate from DB
    const loader = new BuildingLoader(app.ctx.db);
    const building = loader.loadStructure(buildingId);

    expect(building).not.toBeNull();
    expect(building!.id).toBe(buildingId);
    expect(building!.allDiagrams()).toHaveLength(1);
    expect(building!.allPlaces().length).toBeGreaterThan(0);

    // Verify stage was loaded
    const loadedDiagram = building!.allDiagrams()[0]!;
    expect(loadedDiagram.stageCount).toBe(1);
  });
});
