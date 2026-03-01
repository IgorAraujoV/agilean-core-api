import { Link } from 'agilean';
import type { Building, BuildingError, Package } from 'agilean';
import type { BuildingStorage } from '../storage/BuildingStorage';
import { LinkRepository } from '../database/LinkRepository';
import type { Database } from 'better-sqlite3';
import type { MovePatch } from './MovementEndpointService';
import { safeISOStringRequired } from './dateHelpers';

export interface LinkResponse {
  id: string;
  sourceId: string;
  destinationId: string;
  latency: number;
  locked: boolean;
  currentGap: number;
}

export interface LinkCreateResponse {
  link: LinkResponse;
  movedCount: number;
  packages: MovePatch[];
}

export interface LinkUpdateResponse extends LinkResponse {
  movedCount: number;
  packages: MovePatch[];
}

export class LinkEndpointService {
  private linkRepo: LinkRepository;

  constructor(private storage: BuildingStorage, private db: Database) {
    this.linkRepo = new LinkRepository(db);
  }

  create(
    building: Building,
    sourceId: string,
    destinationId: string,
    latency: number,
  ): LinkCreateResponse | { error: BuildingError } {
    // Snapshot positions before link creation to detect moved packages
    const before = this._snapshotPositions(building);
    const result = building.addLink(sourceId, destinationId, latency);
    if (result instanceof Link) {
      // Persist link
      this.linkRepo.insert(result.getId(), sourceId, destinationId, latency, result.isLocked());
      // Persist any packages that moved due to the link constraint
      const movedPatches = this._diffAndPersist(building, before);
      return {
        link: this._toResponse(result),
        movedCount: movedPatches.length,
        packages: movedPatches,
      };
    }
    return { error: result.error! };
  }

  getAll(building: Building): LinkResponse[] {
    return building.allLinks().map((link) => this._toResponse(link));
  }

  update(
    building: Building,
    linkId: string,
    fields: { latency?: number; locked?: boolean },
  ): LinkUpdateResponse | null {
    const link = building.getLink(linkId);
    if (!link) return null;

    const before = this._snapshotPositions(building);

    if (fields.latency !== undefined) {
      link.setLatency(fields.latency);
    }
    if (fields.locked !== undefined) {
      link.setLocked(fields.locked);
    }

    this.linkRepo.update(linkId, fields);

    // If latency changed and link is locked, packages may need to move
    if (fields.latency !== undefined && link.isLocked()) {
      const source = building.getPackage(link.getSourceId());
      if (source) {
        const team = building.getTeam(source.getTeamId());
        if (team) {
          building.bfsRepositionTeams([team]);
        }
      }
    }

    const movedPatches = this._diffAndPersist(building, before);
    return {
      ...this._toResponse(link),
      movedCount: movedPatches.length,
      packages: movedPatches,
    };
  }

  delete(building: Building, linkId: string): boolean {
    const success = building.removeLink(linkId);
    if (success) {
      this.linkRepo.delete(linkId);
    }
    return success;
  }

  toggleLock(building: Building, linkId: string): LinkUpdateResponse | null {
    const link = building.getLink(linkId);
    if (!link) return null;

    const before = this._snapshotPositions(building);

    link.toggleLock();
    this.linkRepo.update(linkId, {
      latency: link.getLatency(),
      locked: link.isLocked(),
    });

    // If lock was turned on, packages may need to reposition
    if (link.isLocked()) {
      const source = building.getPackage(link.getSourceId());
      if (source) {
        const team = building.getTeam(source.getTeamId());
        if (team) {
          building.bfsRepositionTeams([team]);
        }
      }
    }

    const movedPatches = this._diffAndPersist(building, before);
    return {
      ...this._toResponse(link),
      movedCount: movedPatches.length,
      packages: movedPatches,
    };
  }

  private _toResponse(link: Link): LinkResponse {
    return {
      id: link.getId(),
      sourceId: link.getSourceId(),
      destinationId: link.getDestinationId(),
      latency: link.getLatency(),
      locked: link.isLocked(),
      currentGap: link.currentGap(),
    };
  }

  private _snapshotPositions(building: Building): Map<string, { start: number; end: number }> {
    const snapshot = new Map<string, { start: number; end: number }>();
    for (const pkgData of building.packageStore.all()) {
      const pkg = building.getPackage(pkgData.id);
      if (pkg) {
        snapshot.set(pkg.getId(), { start: pkg.start(), end: pkg.end() });
      }
    }
    return snapshot;
  }

  private _diffAndPersist(
    building: Building,
    before: Map<string, { start: number; end: number }>,
  ): MovePatch[] {
    const moved: MovePatch[] = [];
    const updateStmt = this.db.prepare(
      'UPDATE packages SET start_col = @startCol, end_col = @endCol WHERE id = @id',
    );
    const tx = this.db.transaction(() => {
      for (const pkgData of building.packageStore.all()) {
        const pkg = building.getPackage(pkgData.id);
        if (!pkg) continue;
        const prev = before.get(pkg.getId());
        if (!prev || prev.start !== pkg.start() || prev.end !== pkg.end()) {
          updateStmt.run({ id: pkg.getId(), startCol: pkg.start(), endCol: pkg.end() });
          moved.push({
            id: pkg.getId(),
            startCol: pkg.start(),
            endCol: pkg.end(),
            startDate: safeISOStringRequired(building.date(pkg.start()), `link pkg=${pkg.getId()} startCol=${pkg.start()}`),
            endDate: safeISOStringRequired(building.date(pkg.end()), `link pkg=${pkg.getId()} endCol=${pkg.end()}`),
          });
        }
      }
    });
    tx();
    return moved;
  }
}
