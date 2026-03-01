import { MovementService } from 'agilean';
import type { Package } from 'agilean';
import type { BuildingStorage } from '../storage/BuildingStorage';
import { PackageRepository } from '../database/PackageRepository';
import type { Database } from 'better-sqlite3';
import { safeISOStringRequired } from './dateHelpers';

export interface MovePatch {
  id: string;
  startCol: number;
  endCol: number;
  startDate: string;
  endDate: string;
}

export class MovementEndpointService {
  private repo: PackageRepository;

  constructor(private storage: BuildingStorage, db: Database) {
    this.repo = new PackageRepository(db);
  }

  move(buildingId: string, packageId: string, columnOrDate: number | Date): {
    movedCount: number;
    packages: MovePatch[];
  } | null {
    const building = this.storage.get(buildingId);
    if (!building) return null;

    const pkg = building.getPackage(packageId);
    if (!pkg) return null;

    const column = columnOrDate instanceof Date
      ? building.column(columnOrDate)
      : columnOrDate;

    const ms = new MovementService(building);
    const movedPackages: Package[] = [];
    const result = ms.move(packageId, column, movedPackages);
    if (!result) return null;

    if (movedPackages.length > 0) {
      this.repo.bulkUpdate(movedPackages);
    }

    return {
      movedCount: movedPackages.length,
      packages: movedPackages.map(p => ({
        id: p.getId(),
        startCol: p.start(),
        endCol: p.end(),
        startDate: safeISOStringRequired(building.date(p.start()), `move pkg=${p.getId()} startCol=${p.start()}`),
        endDate: safeISOStringRequired(building.date(p.end()), `move pkg=${p.getId()} endCol=${p.end()}`),
      })),
    };
  }
}
