import type { Database } from 'better-sqlite3';
import type { Network } from 'agilean';
import { BuildingStorage } from '../storage/BuildingStorage';
import { LineRepository } from '../database/LineRepository';

interface PackageResponse {
  id: string;
  placeId: string;
  stageId: string;
  startCol: number;
  endCol: number;
  startDate: string;
  endDate: string;
  plannedStartDate: string;
  plannedEndDate: string;
  executionStart: string | null;
  executionEnd: string | null;
  estimatedEnd: string | null;
  status: number;
  progress: number;
  cost: number;
}

export class LineService {
  private repo: LineRepository;

  constructor(private storage: BuildingStorage, db: Database) {
    this.repo = new LineRepository(db);
  }

  create(buildingId: string, networkId: string, placeId: string, localIds?: string[]): {
    id: string; packageCount: number;
  } | null {
    const building = this.storage.get(buildingId);
    if (!building) return null;

    const network = this.findNetwork(building, networkId);
    const place = building.getPlace(placeId);
    if (!network || !place) return null;

    const children = place.children;
    let floors: number[];
    if (localIds && localIds.length > 0) {
      // Mapeia localIds → índices dos filhos
      const idSet = new Set(localIds);
      floors = children
        .map((child, i) => idSet.has(child.id) ? i : -1)
        .filter((i) => i >= 0);
      if (floors.length === 0) return null;
    } else {
      floors = children.map((_, i) => i);
    }

    const line = building.createLine(place, network, floors);

    this.repo.insertAll(line, buildingId);

    const packageCount = line.teams().reduce((s, t) => s + t.packages().length, 0);
    return { id: line.getId(), packageCount };
  }

  list(buildingId: string): Array<{ id: string; networkId: string; placeId: string }> {
    const building = this.storage.get(buildingId);
    if (!building) return [];
    return building.lineStore.all().map(d => ({
      id: d.id,
      networkId: d.networkId,
      placeId: d.placeId,
    }));
  }

  getLine(buildingId: string, lineId: string) {
    return this.storage.get(buildingId)?.getLine(lineId) ?? null;
  }

  listPackages(buildingId: string, lineId: string): PackageResponse[] | null {
    const building = this.storage.get(buildingId);
    if (!building) return null;
    const line = building.getLine(lineId);
    if (!line) return null;

    const result: PackageResponse[] = [];
    for (const team of line.teams()) {
      for (const pkg of team.packages()) {
        result.push({
          id: pkg.getId(),
          placeId: pkg.getPlaceId(),
          stageId: pkg.getStageId(),
          startCol: pkg.start(),
          endCol: pkg.end(),
          startDate: building.date(pkg.start()).toISOString(),
          endDate: building.date(pkg.end()).toISOString(),
          plannedStartDate: pkg.plannedStartDate().toISOString(),
          plannedEndDate: pkg.plannedEndDate().toISOString(),
          executionStart: pkg.getExecutionStart()?.toISOString() ?? null,
          executionEnd: pkg.getExecutionEnd()?.toISOString() ?? null,
          estimatedEnd: pkg.getEstimatedEnd()?.toISOString() ?? null,
          status: pkg.getStatus() as number,
          progress: pkg.getProgress(),
          cost: pkg.getCost(),
        });
      }
    }
    return result;
  }

  delete(buildingId: string, lineId: string): boolean {
    const building = this.storage.get(buildingId);
    if (!building) return false;
    const line = building.getLine(lineId);
    if (!line) return false;

    building.removeLine(lineId);
    this.repo.delete(lineId);
    return true;
  }

  private findNetwork(building: ReturnType<BuildingStorage['get']>, networkId: string): Network | null {
    if (!building) return null;
    for (const diagram of building.allDiagrams()) {
      const network = diagram.getNetwork(networkId);
      if (network) return network as Network;
    }
    return null;
  }
}
