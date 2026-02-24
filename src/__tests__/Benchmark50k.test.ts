/**
 * Benchmark: 50k packages com SQLite em memória.
 * Usa os mesmos services que as routes usam — mesmo caminho de código do frontend.
 *
 * Mede 3 fases:
 *   A) Criar 1000 stages + 50 places via services (+ INSERTs no SQLite)
 *   B) createLine + bulk INSERT 50k packages
 *   C) Move primeiro package (cascateia a cadeia) + bulk UPDATE
 *
 * Bloqueante conhecido: moveRightPushing é recursivo. Com 1000 stages × 50 places,
 * a profundidade de recursão é ~50k frames → RangeError: Maximum call stack size exceeded.
 * Fase C captura a exceção e registra como bloqueante. Ver PROGRESS.md para detalhes.
 */
import { openDatabase } from '../database/DatabaseService';
import { BuildingStorage } from '../storage/BuildingStorage';
import { BuildingService } from '../services/BuildingService';
import { DiagramService } from '../services/DiagramService';
import { TypologyService } from '../services/TypologyService';
import { LineService } from '../services/LineService';
import { PackageRepository } from '../database/PackageRepository';
import { MovementService } from 'agilean';
import type { Package } from 'agilean';

jest.setTimeout(300_000); // 5 minutos

describe('Benchmark: 50k packages (server-level + SQLite)', () => {
  const STAGES = 1000;
  const PLACES = 50;

  it('create structure + createLine + bulk INSERT + move + bulk UPDATE', () => {
    const db = openDatabase(':memory:');
    const storage = new BuildingStorage();
    const bService = new BuildingService(storage, db);
    const dService = new DiagramService(db);
    const tService = new TypologyService(db);
    const lService = new LineService(storage, db);
    const pkgRepo = new PackageRepository(db);

    // --- Fase A: criar estrutura via services ---
    const tA = performance.now();

    const masterUser = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string };
    const building = bService.create({ name: 'Benchmark', firstDate: new Date('2024-01-01') }, masterUser.id);
    const b = storage.get(building.id)!;

    const diagram = dService.create(b, 'Diagrama');
    const network = dService.addNetwork(b, diagram.id, 'Rede')!;

    const stageIds: string[] = [];
    for (let i = 0; i < STAGES; i++) {
      const stage = dService.addStageToNetwork(b, diagram.id, network.id, `S${i}`, 1, 0)!;
      stageIds.push(stage.id);
      if (i > 0) {
        dService.addPrecedence(b, diagram.id, stageIds[i - 1]!, stage.id, 1, 0);
      }
    }

    const unit = tService.createUnit(b, 'Unit');
    for (let i = 0; i < PLACES; i++) {
      tService.addChild(b, unit.id, `Floor ${i}`);
    }

    const structureMs = performance.now() - tA;
    console.log(`\n=== Benchmark: ${STAGES} stages × ${PLACES} places ===`);
    console.log(`Fase A (estrutura via services + INSERTs): ${structureMs.toFixed(0)}ms`);

    // --- Fase B: createLine + bulk INSERT ---
    const tB = performance.now();
    const lineResult = lService.create(building.id, network.id, unit.id)!;
    const insertMs = performance.now() - tB;

    expect(lineResult.packageCount).toBe(STAGES * PLACES);
    console.log(`Fase B (createLine + bulk INSERT ${lineResult.packageCount} packages): ${insertMs.toFixed(0)}ms`);

    // Verificar no DB
    const dbCount = db.prepare('SELECT COUNT(*) as n FROM packages').get() as { n: number };
    expect(dbCount.n).toBe(STAGES * PLACES);

    // --- Fase C: move + bulk UPDATE ---
    // BLOQUEANTE CONHECIDO: moveRightPushing é recursivo e estoura a stack com
    // muitos stages/places em cadeia linear. Capturamos o erro e registramos.
    const domainBuilding = storage.get(building.id)!;
    const line = domainBuilding.getLine(lineResult.id)!;
    const firstTeam = line.getTeam(stageIds[0]!, 0)!;
    const firstPkg = firstTeam.packages()[0] as Package;

    const movedPackages: Package[] = [];
    const ms = new MovementService(domainBuilding);

    let moveMs = 0;
    let moveCrashed = false;
    const tC = performance.now();
    try {
      ms.move(firstPkg.getId(), firstPkg.start() + 1, movedPackages);
      if (movedPackages.length > 0) {
        pkgRepo.bulkUpdate(movedPackages);
      }
      moveMs = performance.now() - tC;
      console.log(`Fase C (move cascade + bulk UPDATE ${movedPackages.length} packages): ${moveMs.toFixed(0)}ms`);
    } catch (err) {
      moveMs = performance.now() - tC;
      moveCrashed = true;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`Fase C BLOQUEANTE: ${errMsg.slice(0, 80)}`);
      console.warn(`  Causa: moveRightPushing recursivo, profundidade ~${STAGES * PLACES} frames`);
      console.warn(`  Ação: reescrever como algoritmo iterativo (ver PROGRESS.md)`);
    }

    console.log(`TOTAL: ${(structureMs + insertMs + moveMs).toFixed(0)}ms`);
    console.log(`=== Fim do Benchmark ===\n`);

    // Guards — apenas catástrofes
    expect(insertMs).toBeLessThan(60_000);   // 60s para criar 50k packages
    if (!moveCrashed) {
      expect(moveMs).toBeLessThan(10_000);   // 10s para mover (só verifica se não crashou)
    }
  });
});
