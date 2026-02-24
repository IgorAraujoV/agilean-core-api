import type { Database } from 'better-sqlite3';
import type { Line } from 'agilean';

export class LineRepository {
  constructor(private db: Database) {}

  // Persiste Line + todos os Teams + todos os Packages em 1 transação
  insertAll(line: Line, buildingId: string): void {
    const insertLine = this.db.prepare(`
      INSERT INTO lines (id, building_id, network_id, diagram_id, place_id, name, code, type, position)
      VALUES (@id, @buildingId, @networkId, @diagramId, @placeId, @name, @code, @type, @position)
    `);
    const insertTeam = this.db.prepare(`
      INSERT INTO teams (id, line_id, stage_id, network_id, direction, position)
      VALUES (@id, @lineId, @stageId, @networkId, @direction, @position)
    `);
    const insertPkg = this.db.prepare(`
      INSERT INTO packages (
        id, team_id, place_id, stage_id,
        start_col, end_col,
        execution_start, execution_end, estimated_end, baseline_start, baseline_end,
        status, progress, cost, labor_cost, type, code, name
      ) VALUES (
        @id, @teamId, @placeId, @stageId,
        @startCol, @endCol,
        @executionStart, @executionEnd, @estimatedEnd, @baselineStart, @baselineEnd,
        @status, @progress, @cost, @laborCost, @type, @code, @name
      )
    `);

    const networkId = line.getNetworkId();

    const insertAll = this.db.transaction(() => {
      insertLine.run({
        id: line.getId(),
        buildingId,
        networkId,
        diagramId: line.getDiagramId(),
        placeId: line.getPlace().id,
        name: '',
        code: '',
        type: 0,
        position: line.getIndex(),
      });

      let teamPosition = 0;
      for (const team of line.teams()) {
        insertTeam.run({
          id: team.getId(),
          lineId: line.getId(),
          stageId: team.getStageId(),
          networkId,
          direction: team.getDirection() as number,
          position: teamPosition++,
        });

        for (const pkg of team.packages()) {
          insertPkg.run({
            id: pkg.getId(),
            teamId: team.getId(),
            placeId: pkg.getPlaceId(),
            stageId: pkg.getStageId(),
            // For new packages, start() and end() return _start and _end directly
            startCol: pkg.start(),
            endCol: pkg.end(),
            executionStart: pkg.getExecutionStart()?.toISOString() ?? null,
            executionEnd: pkg.getExecutionEnd()?.toISOString() ?? null,
            estimatedEnd: pkg.getEstimatedEnd()?.toISOString() ?? null,
            baselineStart: pkg.getBaselineStartDate()?.toISOString() ?? null,
            baselineEnd: pkg.getBaselineEndDate()?.toISOString() ?? null,
            status: pkg.getStatus() as number,
            progress: pkg.getProgress(),
            cost: pkg.getCost(),
            laborCost: pkg.getLaborCost(),
            type: pkg.getType() as number,
            code: pkg.getCode(),
            name: pkg.getName(),
          });
        }
      }
    });

    insertAll();
  }
}
