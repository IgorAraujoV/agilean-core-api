import { openDatabase } from '../database/DatabaseService';
import { StructuralRepository } from '../database/StructuralRepository';
import { Building } from 'agilean';
import { DiagramService } from '../services/DiagramService';

describe('StructuralRepository', () => {
  it('should persist a building', () => {
    const db = openDatabase(':memory:');
    const repo = new StructuralRepository(db);
    const building = new Building({ firstDate: new Date('2024-01-01'), today: new Date('2024-01-01') });

    repo.insertBuilding(building);

    const row = db.prepare('SELECT * FROM buildings WHERE id = ?').get(building.id) as Record<string, unknown> | undefined;
    expect(row?.['name']).toBe(building.name);
    expect(row?.['first_date']).toBeDefined();
  });

  it('should persist a stage inside a network', () => {
    const db = openDatabase(':memory:');
    const repo = new StructuralRepository(db);
    const building = new Building({ firstDate: new Date('2024-01-01'), today: new Date('2024-01-01') });
    repo.insertBuilding(building);

    const dService = new DiagramService(db);
    const diagram = dService.create(building, 'Diagrama');
    const network = dService.addNetwork(building, diagram.id, 'Rede')!;
    const stage = dService.addStageToNetwork(building, diagram.id, network.id, 'Fase 1', 5, 0)!;

    const row = db.prepare('SELECT * FROM stages WHERE id = ?').get(stage.id) as Record<string, unknown> | undefined;
    expect(row?.['duration']).toBe(5);
    expect(row?.['network_id']).toBe(network.id);
  });

  it('should persist a precedence', () => {
    const db = openDatabase(':memory:');
    const repo = new StructuralRepository(db);
    const building = new Building({ firstDate: new Date('2024-01-01'), today: new Date('2024-01-01') });
    repo.insertBuilding(building);

    const dService = new DiagramService(db);
    const diagram = dService.create(building, 'Diagrama');
    const network = dService.addNetwork(building, diagram.id, 'Rede')!;
    const s1 = dService.addStageToNetwork(building, diagram.id, network.id, 'S1', 5, 0)!;
    const s2 = dService.addStageToNetwork(building, diagram.id, network.id, 'S2', 3, 0)!;
    dService.addPrecedence(building, diagram.id, s1.id, s2.id, 1, 0);

    const row = db.prepare('SELECT * FROM precedences WHERE diagram_id = ?').get(diagram.id) as Record<string, unknown> | undefined;
    expect(row?.['source_stage_id']).toBe(s1.id);
    expect(row?.['dest_stage_id']).toBe(s2.id);
    expect(row?.['opening']).toBe(1);
  });

  it('should persist a place', () => {
    const db = openDatabase(':memory:');
    const repo = new StructuralRepository(db);
    const building = new Building({ firstDate: new Date('2024-01-01'), today: new Date('2024-01-01') });
    repo.insertBuilding(building);

    const unit = building.addUnit('Bloco A');
    repo.insertPlace(unit, building.id, null);

    const row = db.prepare('SELECT * FROM places WHERE id = ?').get(unit.id) as Record<string, unknown> | undefined;
    expect(row?.['name']).toBe('Bloco A');
    expect(row?.['level']).toBe(0);
    expect(row?.['parent_id']).toBeNull();
  });
});
