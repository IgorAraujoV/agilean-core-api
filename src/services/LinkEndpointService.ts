import { Link } from 'agilean';
import type { Building, BuildingError } from 'agilean';
import type { BuildingStorage } from '../storage/BuildingStorage';
import { LinkRepository } from '../database/LinkRepository';
import type { Database } from 'better-sqlite3';

export interface LinkResponse {
  id: string;
  sourceId: string;
  destinationId: string;
  latency: number;
  locked: boolean;
  currentGap: number;
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
  ): { link: LinkResponse } | { error: BuildingError } {
    const result = building.addLink(sourceId, destinationId, latency);
    if (result instanceof Link) {
      // Persist link
      this.linkRepo.insert(result.getId(), sourceId, destinationId, latency, result.isLocked());
      // Persist any packages that moved due to the link constraint
      this._persistMovedPackages(building);
      return { link: this._toResponse(result) };
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
  ): LinkResponse | null {
    const link = building.getLink(linkId);
    if (!link) return null;

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
          this._persistMovedPackages(building);
        }
      }
    }

    return this._toResponse(link);
  }

  delete(building: Building, linkId: string): boolean {
    const success = building.removeLink(linkId);
    if (success) {
      this.linkRepo.delete(linkId);
    }
    return success;
  }

  toggleLock(building: Building, linkId: string): LinkResponse | null {
    const link = building.getLink(linkId);
    if (!link) return null;

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
          this._persistMovedPackages(building);
        }
      }
    }

    return this._toResponse(link);
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

  private _persistMovedPackages(building: Building): void {
    // Bulk update all package positions to DB
    const allPkgs = building.packageStore.all();
    const updateStmt = this.db.prepare(
      'UPDATE packages SET start_col = @startCol, end_col = @endCol WHERE id = @id',
    );
    const tx = this.db.transaction(() => {
      for (const pkgData of allPkgs) {
        const pkg = building.getPackage(pkgData.id);
        if (pkg) {
          updateStmt.run({ id: pkg.getId(), startCol: pkg.start(), endCol: pkg.end() });
        }
      }
    });
    tx();
  }
}
