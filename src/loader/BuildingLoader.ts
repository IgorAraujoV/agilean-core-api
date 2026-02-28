import type { Database } from 'better-sqlite3';
import { Building, Diagram, Network, Stage, Place, Line, Team, Package, Link } from 'agilean';

interface BuildingRow {
  id: string;
  name: string;
  firstDate: string;
  today: string;
  todayEnabled: number;
}

interface DiagramRow {
  id: string;
  name: string;
}

interface NetworkRow {
  id: string;
  name: string;
}

interface StageRow {
  id: string;
  name: string;
  duration: number;
  latency: number;
  direction: number;
}

interface PrecedenceRow {
  id: string;
  source: string;
  dest: string;
  opening: number;
  latency: number;
  diagramId: string;
}

interface PlaceRow {
  id: string;
  name: string;
  level: number;
  parentId: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface LineRow {
  id: string;
  networkId: string;
  diagramId: string;
  placeId: string;
}

export class BuildingLoader {
  constructor(private db: Database) {}

  loadStructure(buildingId: string): Building | null {
    // 1. Load building row
    const bRow = this.db.prepare(
      `SELECT id, name, first_date AS firstDate, today, today_enabled AS todayEnabled FROM buildings WHERE id = ?`
    ).get(buildingId) as BuildingRow | undefined;
    if (!bRow) return null;

    const building = new Building({
      id: bRow.id,
      name: bRow.name,
      firstDate: new Date(bRow.firstDate),
      today: new Date(bRow.today),
      todayEnabled: bRow.todayEnabled !== 0,
    });

    // 2. Load Diagrams → Networks → Stages
    const diagrams = this.db.prepare(
      `SELECT id, name FROM diagrams WHERE building_id = ? ORDER BY rowid`
    ).all(buildingId) as DiagramRow[];

    for (const dRow of diagrams) {
      const diagram = new Diagram(undefined, dRow.id, dRow.name);
      building.addDiagram(diagram);

      const networks = this.db.prepare(
        `SELECT id, name FROM networks WHERE diagram_id = ? ORDER BY rowid`
      ).all(dRow.id) as NetworkRow[];

      for (const nRow of networks) {
        const network = new Network(nRow.id);
        network.name = nRow.name;
        diagram.appendNetwork(network);

        const stages = this.db.prepare(
          `SELECT id, name, duration, latency, direction FROM stages WHERE network_id = ? ORDER BY rowid`
        ).all(nRow.id) as StageRow[];

        for (const sRow of stages) {
          const stage = new Stage(sRow.name, sRow.duration, sRow.latency, sRow.id);
          // Apply direction from DB (0 = Up, 1 = Down)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          stage.direction = sRow.direction as any;
          network.appendStage(stage);
        }
      }
    }

    // 3. Load Precedences (after all stages are in memory)
    const precs = this.db.prepare(`
      SELECT p.id, p.source_stage_id AS source, p.dest_stage_id AS dest,
             p.opening, p.latency, p.diagram_id AS diagramId
      FROM precedences p
      WHERE p.diagram_id IN (SELECT id FROM diagrams WHERE building_id = ?)
    `).all(buildingId) as PrecedenceRow[];

    for (const pRow of precs) {
      const diagram = building.getDiagram(pRow.diagramId);
      if (diagram) {
        diagram.addPrecedenceDirect(pRow.id, pRow.source, pRow.dest, pRow.opening, pRow.latency);
      }
    }

    // 4. Drain ChangeSet (appendStage/appendNetwork insert entries; no lines yet so applyDiagramChanges is safe)
    building.applyDiagramChanges();

    // 5. Load Places ordered by level so parents are created before children
    const places = this.db.prepare(`
      SELECT id, name, level, parent_id AS parentId,
             start_date AS startDate, end_date AS endDate
      FROM places WHERE building_id = ? ORDER BY level, rowid
    `).all(buildingId) as PlaceRow[];

    for (const pRow of places) {
      const place = new Place(pRow.name, building, pRow.id);
      if (pRow.level === Place.UNIT_LEVEL) {
        // addUnit sets level to UNIT_LEVEL and calls addPlace internally
        building.addUnit(place);
      } else {
        // For sub-levels, attach via insertPlace which sets level + parentPlace + calls addPlace
        if (pRow.parentId) {
          const parent = building.getPlace(pRow.parentId);
          if (parent) {
            parent.insertPlace(parent.children.length, place);
            // insertPlace already calls building.addPlace internally
          } else {
            building.addPlace(place);
          }
        } else {
          building.addPlace(place);
        }
      }
      if (pRow.startDate) place.startDate = new Date(pRow.startDate);
      if (pRow.endDate) place.endDate = new Date(pRow.endDate);
    }

    // 6. Load Lines
    const lines = this.db.prepare(`
      SELECT id, network_id AS networkId, diagram_id AS diagramId, place_id AS placeId
      FROM lines WHERE building_id = ? ORDER BY rowid
    `).all(buildingId) as LineRow[];

    for (const lRow of lines) {
      const place = building.getPlace(lRow.placeId);
      if (!place) continue;
      const line = Line.create(place, lRow.networkId, lRow.diagramId, [], building, lRow.id);
      building.addLine(line);
    }

    return building;
  }

  loadWithPackages(buildingId: string): Building | null {
    const building = this.loadStructure(buildingId);
    if (!building) return null;

    // Load Teams
    const teams = this.db.prepare(`
      SELECT id, stage_id AS stageId, line_id AS lineId, network_id AS networkId, position
      FROM teams WHERE line_id IN (SELECT id FROM lines WHERE building_id = ?)
      ORDER BY line_id, position
    `).all(buildingId) as { id: string; stageId: string; lineId: string; networkId: string; position: number }[];

    for (const tRow of teams) {
      const line = building.getLine(tRow.lineId);
      if (!line) continue;
      const team = new Team(tRow.stageId, tRow.id, tRow.position, line, []);
      line.addTeam(team);
    }

    // Load Packages
    const packages = this.db.prepare(`
      SELECT pk.id, pk.team_id AS teamId, pk.place_id AS placeId,
             pk.stage_id AS stageId,
             pk.start_col AS startCol, pk.end_col AS endCol, pk.code
      FROM packages pk
      JOIN teams t ON t.id = pk.team_id
      JOIN lines l ON l.id = t.line_id
      WHERE l.building_id = ?
      ORDER BY pk.team_id, pk.start_col
    `).all(buildingId) as { id: string; teamId: string; placeId: string; stageId: string; startCol: number; endCol: number; code: string }[];

    for (const pRow of packages) {
      const team = building.getTeam(pRow.teamId);
      if (!team) continue;
      const duration = pRow.endCol - pRow.startCol + 1;
      const pkg = Package.createPackage(pRow.placeId, team, pRow.code ?? '', duration, pRow.id);
      pkg.setStageId(pRow.stageId);
      // Set exact column positions from DB
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pkg as any)._start = pRow.startCol;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pkg as any)._end = pRow.endCol;
      team.addPackage(pkg);
    }

    // Load Links (after all packages are in memory)
    const linkRows = this.db.prepare(`
      SELECT lk.id, lk.source_id AS sourceId, lk.dest_id AS destId,
             lk.latency, lk.locked
      FROM links lk
      WHERE lk.source_id IN (
        SELECT pk.id FROM packages pk
        JOIN teams t ON t.id = pk.team_id
        JOIN lines l ON l.id = t.line_id
        WHERE l.building_id = ?
      )
    `).all(buildingId) as { id: string; sourceId: string; destId: string; latency: number; locked: number }[];

    for (const lkRow of linkRows) {
      const result = building.addLink(lkRow.sourceId, lkRow.destId, lkRow.latency);
      if (result instanceof Link) {
        if (!lkRow.locked) {
          result.setLocked(false);
        }
      }
    }

    return building;
  }
}
