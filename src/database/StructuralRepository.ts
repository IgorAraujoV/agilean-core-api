import type { Database } from 'better-sqlite3';
import type { Building, Diagram, Network, Stage, Place, Precedence } from 'agilean';

export class StructuralRepository {
  constructor(private db: Database) {}

  insertBuilding(building: Building): void {
    this.db.prepare(`
      INSERT INTO buildings (id, name, first_date, today, today_enabled)
      VALUES (@id, @name, @firstDate, @today, @todayEnabled)
    `).run({
      id: building.id,
      name: building.name,
      firstDate: building.firstDate.toISOString(),
      today: building.today.toISOString(),
      todayEnabled: building.todayEnabled ? 1 : 0,
    });
  }

  insertDiagram(diagram: Diagram, buildingId: string): void {
    this.db.prepare(`
      INSERT INTO diagrams (id, building_id, name) VALUES (@id, @buildingId, @name)
    `).run({ id: diagram.id, buildingId, name: diagram.name });
  }

  insertNetwork(network: Network, diagramId: string): void {
    this.db.prepare(`
      INSERT INTO networks (id, diagram_id, name) VALUES (@id, @diagramId, @name)
    `).run({ id: network.id, diagramId, name: network.name });
  }

  insertStage(stage: Stage, networkId: string): void {
    this.db.prepare(`
      INSERT INTO stages (id, network_id, name, duration, latency, direction)
      VALUES (@id, @networkId, @name, @duration, @latency, @direction)
    `).run({
      id: stage.id,
      networkId,
      name: stage.name,
      duration: stage.duration,
      latency: stage.latency,
      direction: stage.direction as number,
    });
  }

  insertPrecedence(precedence: Precedence, diagramId: string): void {
    this.db.prepare(`
      INSERT INTO precedences (id, diagram_id, source_stage_id, dest_stage_id, opening, latency)
      VALUES (@id, @diagramId, @sourceId, @destId, @opening, @latency)
    `).run({
      id: precedence.id,
      diagramId,
      sourceId: precedence.source,
      destId: precedence.destination,
      opening: precedence.opening,
      latency: precedence.latency,
    });
  }

  insertPlace(place: Place, buildingId: string, parentId: string | null): void {
    this.db.prepare(`
      INSERT INTO places (id, building_id, parent_id, name, level, row_num, position, start_date, end_date)
      VALUES (@id, @buildingId, @parentId, @name, @level, @rowNum, @position, @startDate, @endDate)
    `).run({
      id: place.id,
      buildingId,
      parentId: parentId ?? null,
      name: place.name,
      level: place.level,
      rowNum: place.row(),
      position: 0,
      startDate: place.startDate?.toISOString() ?? null,
      endDate: place.endDate?.toISOString() ?? null,
    });
  }

  deleteStage(stageId: string): void {
    // Delete referencing precedences first (no ON DELETE CASCADE on source/dest FK)
    this.db.prepare(`DELETE FROM precedences WHERE source_stage_id = @stageId OR dest_stage_id = @stageId`).run({ stageId });
    this.db.prepare(`DELETE FROM stages WHERE id = @stageId`).run({ stageId });
  }

  deletePrecedence(precedenceId: string): void {
    this.db.prepare(`DELETE FROM precedences WHERE id = @precedenceId`).run({ precedenceId });
  }

  deleteDiagram(diagramId: string): void {
    this.db.prepare(`DELETE FROM diagrams WHERE id = @diagramId`).run({ diagramId });
  }

  updateStage(stageId: string, fields: { name?: string; duration?: number; latency?: number }): void {
    const sets: string[] = [];
    const params: Record<string, unknown> = { stageId };
    if (fields.name !== undefined) { sets.push('name = @name'); params['name'] = fields.name; }
    if (fields.duration !== undefined) { sets.push('duration = @duration'); params['duration'] = fields.duration; }
    if (fields.latency !== undefined) { sets.push('latency = @latency'); params['latency'] = fields.latency; }
    if (sets.length === 0) return;
    this.db.prepare(`UPDATE stages SET ${sets.join(', ')} WHERE id = @stageId`).run(params);
  }

  updatePrecedence(precedenceId: string, fields: { opening?: number; latency?: number }): void {
    const sets: string[] = [];
    const params: Record<string, unknown> = { precedenceId };
    if (fields.opening !== undefined) { sets.push('opening = @opening'); params['opening'] = fields.opening; }
    if (fields.latency !== undefined) { sets.push('latency = @latency'); params['latency'] = fields.latency; }
    if (sets.length === 0) return;
    this.db.prepare(`UPDATE precedences SET ${sets.join(', ')} WHERE id = @precedenceId`).run(params);
  }

  insertTeam(team: { id: string; lineId: string; stageId: string; networkId: string; direction: number; position: number }): void {
    this.db.prepare(`
      INSERT INTO teams (id, line_id, stage_id, network_id, direction, position)
      VALUES (@id, @lineId, @stageId, @networkId, @direction, @position)
    `).run(team);
  }

  insertPackagesBulk(packages: Array<{
    id: string; teamId: string; placeId: string; stageId: string;
    startCol: number; endCol: number;
  }>): void {
    const stmt = this.db.prepare(`
      INSERT INTO packages (id, team_id, place_id, stage_id, start_col, end_col, status, progress, cost, labor_cost, type, code, name)
      VALUES (@id, @teamId, @placeId, @stageId, @startCol, @endCol, 1, 0, 0, 0, 1, '', '')
    `);
    const insertMany = this.db.transaction((pkgs: typeof packages) => {
      for (const pkg of pkgs) stmt.run(pkg);
    });
    insertMany(packages);
  }

  updatePlaceName(placeId: string, name: string): void {
    this.db
      .prepare('UPDATE places SET name = @name WHERE id = @placeId')
      .run({ placeId, name });
  }

  updatePlaceDates(placeId: string, startDate: string | null, endDate: string | null): void {
    this.db
      .prepare('UPDATE places SET start_date = @startDate, end_date = @endDate WHERE id = @placeId')
      .run({ placeId, startDate, endDate });
  }

  deletePackagesForPlaces(placeIds: string[]): void {
    if (placeIds.length === 0) return;
    const del = this.db.prepare('DELETE FROM packages WHERE place_id = @placeId AND status < 3');
    const deleteMany = this.db.transaction((ids: string[]) => {
      for (const placeId of ids) del.run({ placeId });
    });
    deleteMany(placeIds);
  }

  deletePlacesBatch(placeIds: string[]): void {
    if (placeIds.length === 0) return;
    const del = this.db.prepare('DELETE FROM places WHERE id = @id');
    const deleteMany = this.db.transaction((ids: string[]) => {
      for (const id of ids) del.run({ id });
    });
    deleteMany(placeIds);
  }

  hasActivePackagesForPlaces(ids: string[]): boolean {
    if (ids.length === 0) return false;
    const placeholders = ids.map(() => '?').join(', ');
    const row = this.db
      .prepare(`SELECT 1 FROM packages WHERE place_id IN (${placeholders}) AND status >= 3 LIMIT 1`)
      .get(...ids);
    return row !== undefined;
  }

  hasActivePackagesForStage(stageId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM packages WHERE stage_id = @stageId AND status >= 3 LIMIT 1')
      .get({ stageId });
    return row !== undefined;
  }
}
