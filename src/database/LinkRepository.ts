import type { Database } from 'better-sqlite3';

export interface LinkRow {
  id: string;
  source_id: string;
  dest_id: string;
  latency: number;
  locked: number; // SQLite stores as 0/1
}

export class LinkRepository {
  constructor(private db: Database) {}

  insert(id: string, sourceId: string, destId: string, latency: number, locked: boolean): void {
    this.db.prepare(`
      INSERT INTO links (id, source_id, dest_id, latency, locked)
      VALUES (@id, @sourceId, @destId, @latency, @locked)
    `).run({ id, sourceId, destId, latency, locked: locked ? 1 : 0 });
  }

  findByBuilding(buildingId: string): LinkRow[] {
    return this.db.prepare(`
      SELECT lk.id, lk.source_id, lk.dest_id, lk.latency, lk.locked
      FROM links lk
      WHERE lk.source_id IN (
        SELECT pk.id FROM packages pk
        JOIN teams t ON t.id = pk.team_id
        JOIN lines l ON l.id = t.line_id
        WHERE l.building_id = @buildingId
      )
    `).all({ buildingId }) as LinkRow[];
  }

  update(id: string, fields: { latency?: number; locked?: boolean }): void {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };
    if (fields.latency !== undefined) {
      sets.push('latency = @latency');
      params['latency'] = fields.latency;
    }
    if (fields.locked !== undefined) {
      sets.push('locked = @locked');
      params['locked'] = fields.locked ? 1 : 0;
    }
    if (sets.length === 0) return;
    this.db.prepare(`UPDATE links SET ${sets.join(', ')} WHERE id = @id`).run(params);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM links WHERE id = @id').run({ id });
  }
}
