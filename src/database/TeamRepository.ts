import type { Database } from 'better-sqlite3';

export class TeamRepository {
  constructor(private db: Database) {}

  insertTeam(team: {
    id: string;
    lineId: string;
    stageId: string;
    networkId: string;
    direction: number;
    position: number;
  }): void {
    this.db.prepare(`
      INSERT INTO teams (id, line_id, stage_id, network_id, direction, position)
      VALUES (@id, @lineId, @stageId, @networkId, @direction, @position)
    `).run(team);
  }

  deleteTeams(teamIds: string[]): void {
    if (teamIds.length === 0) return;
    const placeholders = teamIds.map(() => '?').join(', ');
    this.db.prepare(`DELETE FROM teams WHERE id IN (${placeholders})`).run(...teamIds);
  }
}
