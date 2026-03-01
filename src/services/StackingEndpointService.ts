import type { Package, Team } from 'agilean';
import type { BuildingStorage } from '../storage/BuildingStorage';
import type { Database } from 'better-sqlite3';
import { safeISOStringRequired } from './dateHelpers';

export interface StackPatch {
  id: string;
  startCol: number;
  endCol: number;
  startDate: string;
  endDate: string;
  teamId: string;
}

export interface TeamPatch {
  id: string;
  stageId: string;
  lineId: string;
  index: number;
}

export interface StackResult {
  movedCount: number;
  packages: StackPatch[];
  createdTeams: TeamPatch[];
  deletedTeamIds: string[];
}

export class StackingEndpointService {
  constructor(private storage: BuildingStorage, private db: Database) {}

  stack(buildingId: string, packageId: string, size: number): StackResult | null {
    const building = this.storage.get(buildingId);
    if (!building) return null;

    const pkg = building.getPackage(packageId);
    if (!pkg) return null;

    const stageId = pkg.getStageId();
    const line = pkg.line();
    if (!line) return null;

    // 1. Snapshot ALL teams in the line (not just target stage)
    //    Domain stacking can push packages in dependent stages via precedence
    const teamsBefore = new Map<string, Team>();
    for (const t of line.teams()) {
      teamsBefore.set(t.getId(), t);
    }

    // 2. Snapshot ALL package state before (start, end, teamId)
    const pkgsBefore = new Map<string, { start: number; end: number; teamId: string }>();
    for (const t of teamsBefore.values()) {
      for (const p of t.packages()) {
        pkgsBefore.set(p.getId(), { start: p.start(), end: p.end(), teamId: p.getTeamId() });
      }
    }

    // 3. Execute domain operation
    if (size > 0) {
      building.stack_new(packageId);
    } else if (size < 0) {
      building.unstack_new(packageId);
    } else {
      return null;
    }

    // 4. Diff ALL teams in the line (captures dependent-stage changes)
    const teamsAfter = new Map<string, Team>();
    for (const t of line.teams()) {
      teamsAfter.set(t.getId(), t);
    }

    const createdTeams: TeamPatch[] = [];
    for (const [id, t] of teamsAfter) {
      if (!teamsBefore.has(id)) {
        createdTeams.push({
          id,
          stageId: t.getStageId(),
          lineId: t.getLineId(),
          index: t.getIndex(),
        });
      }
    }

    const deletedTeamIds: string[] = [];
    for (const id of teamsBefore.keys()) {
      if (!teamsAfter.has(id)) {
        deletedTeamIds.push(id);
      }
    }

    // 5. Collect moved packages (any package whose start, end, or teamId changed)
    const movedPackages: Package[] = [];
    for (const t of teamsAfter.values()) {
      for (const p of t.packages()) {
        const before = pkgsBefore.get(p.getId());
        if (!before || before.start !== p.start() || before.end !== p.end() || before.teamId !== p.getTeamId()) {
          movedPackages.push(p);
        }
      }
    }

    // 6. Persist in transaction
    const insertTeamStmt = this.db.prepare(`
      INSERT INTO teams (id, line_id, stage_id, network_id, direction, position)
      VALUES (@id, @lineId, @stageId, @networkId, @direction, @position)
    `);
    const deleteTeamStmt = this.db.prepare('DELETE FROM teams WHERE id = ?');
    const updatePkgStmt = this.db.prepare(`
      UPDATE packages SET start_col = @startCol, end_col = @endCol, team_id = @teamId WHERE id = @id
    `);

    const persistAll = this.db.transaction(() => {
      // Insert new teams first (so FK targets exist for package updates)
      for (const ct of createdTeams) {
        const team = teamsAfter.get(ct.id)!;
        insertTeamStmt.run({
          id: ct.id,
          lineId: ct.lineId,
          stageId: ct.stageId,
          networkId: line.getNetworkId(),
          direction: team.getDirection() as number,
          position: team.getIndex(),
        });
      }
      // Update packages BEFORE deleting old teams (avoids ON DELETE CASCADE)
      for (const p of movedPackages) {
        updatePkgStmt.run({
          id: p.getId(),
          startCol: p.start(),
          endCol: p.end(),
          teamId: p.getTeamId(),
        });
      }
      // Now safe to delete old teams (no packages reference them)
      for (const dtId of deletedTeamIds) {
        deleteTeamStmt.run(dtId);
      }
    });
    persistAll();

    // 7. Build response
    return {
      movedCount: movedPackages.length,
      packages: movedPackages.map(p => ({
        id: p.getId(),
        startCol: p.start(),
        endCol: p.end(),
        startDate: safeISOStringRequired(building.date(p.start()), `stack pkg=${p.getId()} startCol=${p.start()}`),
        endDate: safeISOStringRequired(building.date(p.end()), `stack pkg=${p.getId()} endCol=${p.end()}`),
        teamId: p.getTeamId(),
      })),
      createdTeams,
      deletedTeamIds,
    };
  }
}
