import { openDatabase } from '../database/DatabaseService';
import { DiagramRepository } from '../database/DiagramRepository';
import { randomUUID } from 'crypto';

describe('DiagramRepository', () => {
  function setup() {
    const db = openDatabase(':memory:');
    const repo = new DiagramRepository(db);
    const buildingId = randomUUID();
    db.prepare(`INSERT INTO buildings (id, name, first_date, today, today_enabled)
      VALUES (?, 'B', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', 0)`).run(buildingId);
    return { db, repo, buildingId };
  }

  it('findAllByBuilding returns empty for no diagrams', () => {
    const { repo, buildingId } = setup();
    expect(repo.findAllByBuilding(buildingId)).toEqual([]);
  });

  it('findById returns diagram with networks, stages and precedences', () => {
    const { db, repo, buildingId } = setup();
    const diagramId = randomUUID();
    const networkId = randomUUID();
    const stageAId = randomUUID();
    const stageBId = randomUUID();
    const precId = randomUUID();

    db.prepare(`INSERT INTO diagrams (id, building_id, name) VALUES (?, ?, 'D1')`).run(diagramId, buildingId);
    db.prepare(`INSERT INTO networks (id, diagram_id, name) VALUES (?, ?, 'N1')`).run(networkId, diagramId);
    db.prepare(`INSERT INTO stages (id, network_id, name, duration, latency, direction) VALUES (?, ?, 'A', 10, 0, 0)`).run(stageAId, networkId);
    db.prepare(`INSERT INTO stages (id, network_id, name, duration, latency, direction) VALUES (?, ?, 'B', 8, 0, 0)`).run(stageBId, networkId);
    db.prepare(`INSERT INTO precedences (id, diagram_id, source_stage_id, dest_stage_id, opening, latency) VALUES (?, ?, ?, ?, 0, 0)`)
      .run(precId, diagramId, stageAId, stageBId);

    const result = repo.findById(diagramId, buildingId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(diagramId);
    expect(result!.name).toBe('D1');
    expect(result!.networks).toHaveLength(1);
    expect(result!.networks[0]!.stages).toHaveLength(2);
    expect(result!.precedences).toHaveLength(1);
    expect(result!.precedences[0]!.sourceStageId).toBe(stageAId);
    expect(result!.precedences[0]!.destinationStageId).toBe(stageBId);
  });

  it('findById returns null for unknown diagram', () => {
    const { repo, buildingId } = setup();
    expect(repo.findById('nonexistent', buildingId)).toBeNull();
  });

  it('findById returns network with empty stages array when network has no stages', () => {
    const { db, repo, buildingId } = setup();
    const diagramId = randomUUID();
    const networkId = randomUUID();

    db.prepare(`INSERT INTO diagrams (id, building_id, name) VALUES (?, ?, 'D1')`).run(diagramId, buildingId);
    db.prepare(`INSERT INTO networks (id, diagram_id, name) VALUES (?, ?, 'N1')`).run(networkId, diagramId);
    // No stages inserted

    const result = repo.findById(diagramId, buildingId);
    expect(result).not.toBeNull();
    expect(result!.networks).toHaveLength(1);
    expect(result!.networks[0]!.stages).toEqual([]);
  });

  it('findById returns null when diagram belongs to another building', () => {
    const { db, repo, buildingId } = setup();
    const otherBuildingId = randomUUID();
    db.prepare(`INSERT INTO buildings (id, name, first_date, today, today_enabled)
      VALUES (?, 'Other', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', 0)`).run(otherBuildingId);
    const diagramId = randomUUID();
    db.prepare(`INSERT INTO diagrams (id, building_id, name) VALUES (?, ?, 'D1')`).run(diagramId, otherBuildingId);

    // findById with the WRONG buildingId should return null
    expect(repo.findById(diagramId, buildingId)).toBeNull();
  });
});
