/**
 * Benchmark: Hydration + Cache com cold/warm cache.
 * SLAs esperados:
 *   Cold hydrate:  < 500ms
 *   Move cold:     < 600ms (hydrate + cache set)
 *   Move warm:     < 100ms (cache lookup only)
 */
import { openDatabase } from '../database/DatabaseService';
import { BuildingStorage } from '../storage/BuildingStorage';
import { BuildingService } from '../services/BuildingService';
import { DiagramService } from '../services/DiagramService';
import { TypologyService } from '../services/TypologyService';
import { LineService } from '../services/LineService';
import { BuildingLoader } from '../loader/BuildingLoader';
import { BuildingCache } from '../cache/BuildingCache';

jest.setTimeout(30_000);

describe('Benchmark: Hydration + Cache', () => {
  const STAGES = 100;
  const PLACES = 270;

  let buildingId: string;
  let loader: BuildingLoader;
  let cache: BuildingCache;
  let masterUserId: string;

  beforeAll(() => {
    const db = openDatabase(':memory:');
    const storage = new BuildingStorage();
    const bService = new BuildingService(storage, db);
    const dService = new DiagramService(db);
    const tService = new TypologyService(db);
    const lService = new LineService(storage, db);

    const masterUser = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string };
    masterUserId = masterUser.id;

    const building = bService.create({ name: 'Benchmark', firstDate: new Date('2024-01-01') }, masterUserId);
    const b = storage.get(building.id)!;
    buildingId = building.id;

    const diagram = dService.create(b, 'D');
    const network = dService.addNetwork(b, diagram.id, 'N')!;

    const stageIds: string[] = [];
    for (let i = 0; i < STAGES; i++) {
      const s = dService.addStageToNetwork(b, diagram.id, network.id, `S${i}`, 1, 0)!;
      stageIds.push(s.id);
      if (i > 0) dService.addPrecedence(b, diagram.id, stageIds[i - 1]!, s.id, 1, 0);
    }

    const unit = tService.createUnit(b, 'Bloco A');
    for (let i = 0; i < PLACES; i++) {
      tService.addChild(b, unit.id, `Piso ${i + 1}`);
    }

    lService.create(building.id, network.id, unit.id);

    const totalPackages = db.prepare('SELECT COUNT(*) as n FROM packages').get() as { n: number };
    console.log(`\nTotal packages in DB: ${totalPackages.n}`);
    expect(totalPackages.n).toBeGreaterThan(0);

    loader = new BuildingLoader(db);
    cache = new BuildingCache();
  });

  it('cold hydrate < 500ms', () => {
    const t = performance.now();
    const hydrated = loader.loadWithPackages(buildingId);
    const ms = performance.now() - t;
    console.log(`Cold hydrate: ${ms.toFixed(1)}ms`);
    expect(hydrated).not.toBeNull();
    expect(ms).toBeLessThan(500);
  });

  it('move cold (hydrate + cache set) < 600ms', () => {
    const t = performance.now();
    let bForMove = cache.get(masterUserId, buildingId);
    if (!bForMove) {
      bForMove = loader.loadWithPackages(buildingId)!;
      cache.set(masterUserId, buildingId, bForMove);
    }
    const ms = performance.now() - t;
    console.log(`Move cold (hydrate + cache set): ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(600);
  });

  it('move warm (cache lookup only) < 100ms', () => {
    const t = performance.now();
    const bWarm = cache.get(masterUserId, buildingId);
    const ms = performance.now() - t;
    console.log(`Move warm (cache lookup): ${ms.toFixed(1)}ms`);
    expect(bWarm).not.toBeUndefined();
    expect(ms).toBeLessThan(100);
  });
});
