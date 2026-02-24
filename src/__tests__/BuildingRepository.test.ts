import { openDatabase } from '../database/DatabaseService';
import { BuildingRepository } from '../database/BuildingRepository';
import { randomUUID } from 'crypto';

describe('BuildingRepository', () => {
  function setup() {
    const db = openDatabase(':memory:');
    const repo = new BuildingRepository(db);
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string };
    return { db, repo, userId: userId.id };
  }

  function insertBuilding(db: ReturnType<typeof openDatabase>, userId: string) {
    const id = randomUUID();
    db.prepare(`INSERT INTO buildings (id, name, first_date, today, today_enabled)
      VALUES (?, 'Obra Teste', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', 0)`).run(id);
    db.prepare('INSERT INTO building_users (building_id, user_id) VALUES (?, ?)').run(id, userId);
    return id;
  }

  it('findAllForUser returns buildings with counts', () => {
    const { db, repo, userId } = setup();
    const id = insertBuilding(db, userId);
    const results = repo.findAllForUser(userId);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(id);
    expect(results[0]!.name).toBe('Obra Teste');
    expect(results[0]!.diagramCount).toBe(0);
    expect(results[0]!.placeCount).toBe(0);
  });

  it('findById returns building summary', () => {
    const { db, repo, userId } = setup();
    const id = insertBuilding(db, userId);
    const result = repo.findById(id, userId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(id);
    expect(result!.name).toBe('Obra Teste');
    expect(result!.diagramCount).toBe(0);
  });

  it('findById returns null for unknown id', () => {
    const { db, repo, userId } = setup();
    expect(repo.findById('nonexistent', userId)).toBeNull();
  });

  it('findById returns null when building belongs to another user', () => {
    const { db, repo, userId } = setup();
    const otherId = randomUUID();
    db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (?, 'other@test.com', 'x')`).run(otherId);
    const buildingId = insertBuilding(db, otherId);
    expect(repo.findById(buildingId, userId)).toBeNull();
  });
});
