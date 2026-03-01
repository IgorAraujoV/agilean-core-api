import type { Database } from 'better-sqlite3';

export interface BuildingSummaryRow {
  id: string;
  name: string;
  firstDate: string;
  today: string;
  /** SQLite INTEGER (0 or 1). Use `todayEnabled !== 0` to convert to boolean. */
  todayEnabled: number;
  diagramCount: number;
  placeCount: number;
}

export class BuildingRepository {
  constructor(private db: Database) {}

  findAllForUser(userId: string): BuildingSummaryRow[] {
    return this.db.prepare(`
      SELECT
        b.id, b.name, b.first_date AS firstDate, b.today, b.today_enabled AS todayEnabled,
        COUNT(DISTINCT d.id) AS diagramCount,
        COUNT(DISTINCT p.id) AS placeCount
      FROM buildings b
      JOIN building_users bu ON bu.building_id = b.id
      LEFT JOIN diagrams d ON d.building_id = b.id
      LEFT JOIN places p ON p.building_id = b.id
      WHERE bu.user_id = ?
      GROUP BY b.id
      ORDER BY b.name
    `).all(userId) as BuildingSummaryRow[];
  }

  /**
   * Deleta building e todas as entidades dependentes (cascade).
   * Precedences e links precisam de delete manual (FKs sem CASCADE).
   * Deve rodar dentro de uma transação.
   */
  deleteWithCascade(buildingId: string): void {
    // Links: dest_id FK sem CASCADE — deletar primeiro
    this.db.prepare(`
      DELETE FROM links WHERE source_id IN (
        SELECT p.id FROM packages p
        JOIN teams t ON t.id = p.team_id
        JOIN lines l ON l.id = t.line_id
        WHERE l.building_id = ?
      )
    `).run(buildingId);
    this.db.prepare(`
      DELETE FROM links WHERE dest_id IN (
        SELECT p.id FROM packages p
        JOIN teams t ON t.id = p.team_id
        JOIN lines l ON l.id = t.line_id
        WHERE l.building_id = ?
      )
    `).run(buildingId);

    // Precedences: source_stage_id/dest_stage_id FKs sem CASCADE
    this.db.prepare(`
      DELETE FROM precedences WHERE diagram_id IN (
        SELECT id FROM diagrams WHERE building_id = ?
      )
    `).run(buildingId);

    // O restante cascateia automaticamente a partir de DELETE buildings
    this.db.prepare('DELETE FROM buildings WHERE id = ?').run(buildingId);
  }

  findById(id: string, userId: string): BuildingSummaryRow | null {
    const row = this.db.prepare(`
      SELECT
        b.id, b.name, b.first_date AS firstDate, b.today, b.today_enabled AS todayEnabled,
        COUNT(DISTINCT d.id) AS diagramCount,
        COUNT(DISTINCT p.id) AS placeCount
      FROM buildings b
      JOIN building_users bu ON bu.building_id = b.id AND bu.user_id = ?
      LEFT JOIN diagrams d ON d.building_id = b.id
      LEFT JOIN places p ON p.building_id = b.id
      WHERE b.id = ?
      GROUP BY b.id
    `).get(userId, id) as BuildingSummaryRow | undefined;
    return row ?? null;
  }
}
