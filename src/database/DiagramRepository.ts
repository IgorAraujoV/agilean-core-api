import type { Database } from 'better-sqlite3';

export interface StageRow {
  id: string;
  name: string;
  duration: number;
  latency: number;
  direction: number;
}

export interface NetworkRow {
  id: string;
  name: string;
  stages: StageRow[];
}

export interface PrecedenceRow {
  id: string;
  sourceStageId: string;
  destinationStageId: string;
  opening: number;
  latency: number;
}

export interface DiagramRow {
  id: string;
  name: string;
  networks: NetworkRow[];
  precedences: PrecedenceRow[];
}

export interface DiagramSummaryRow {
  id: string;
  name: string;
}

export class DiagramRepository {
  constructor(private db: Database) {}

  findAllByBuilding(buildingId: string): DiagramSummaryRow[] {
    return this.db.prepare(
      `SELECT id, name FROM diagrams WHERE building_id = ? ORDER BY rowid`
    ).all(buildingId) as DiagramSummaryRow[];
  }

  findById(diagramId: string, buildingId: string): DiagramRow | null {
    const diagram = this.db.prepare(
      `SELECT id, name FROM diagrams WHERE id = ? AND building_id = ?`
    ).get(diagramId, buildingId) as { id: string; name: string } | undefined;
    if (!diagram) return null;

    const rawNetworks = this.db.prepare(`
      SELECT n.id AS networkId, n.name AS networkName,
             s.id AS stageId, s.name AS stageName, s.duration, s.latency, s.direction
      FROM networks n
      LEFT JOIN stages s ON s.network_id = n.id
      WHERE n.diagram_id = ?
      ORDER BY n.rowid, s.rowid
    `).all(diagramId) as Array<{
      networkId: string; networkName: string;
      stageId: string | null; stageName: string | null; duration: number | null; latency: number | null; direction: number | null;
    }>;

    const networkMap = new Map<string, NetworkRow>();
    for (const row of rawNetworks) {
      if (!networkMap.has(row.networkId)) {
        networkMap.set(row.networkId, { id: row.networkId, name: row.networkName, stages: [] });
      }
      if (row.stageId) {
        networkMap.get(row.networkId)!.stages.push({
          id: row.stageId, name: row.stageName!, duration: row.duration!, latency: row.latency!, direction: row.direction!,
        });
      }
    }

    const precedences = this.db.prepare(`
      SELECT id, source_stage_id AS sourceStageId, dest_stage_id AS destinationStageId, opening, latency
      FROM precedences WHERE diagram_id = ?
    `).all(diagramId) as PrecedenceRow[];

    return { id: diagram.id, name: diagram.name, networks: [...networkMap.values()], precedences };
  }
}
