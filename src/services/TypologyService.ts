import { Building, Place } from 'agilean';
import type { Package } from 'agilean';
import type { Database } from 'better-sqlite3';
import { StructuralRepository } from '../database/StructuralRepository';
import { PackageRepository } from '../database/PackageRepository';

interface PlaceResponse {
  id: string;
  name: string;
  level: number;
  startDate: string | null;
  endDate: string | null;
  children: PlaceResponse[];
}

export class TypologyService {
  private repo: StructuralRepository;
  private pkgRepo: PackageRepository;

  constructor(db: Database) {
    this.repo = new StructuralRepository(db);
    this.pkgRepo = new PackageRepository(db);
  }

  createUnit(building: Building, name: string): Place {
    const unit = building.addUnit(name);
    this.repo.insertPlace(unit, building.id, null);
    return unit;
  }

  addChild(building: Building, parentId: string, name: string): Place | null {
    const parent = building.getPlace(parentId);
    if (!parent) return null;

    const child = new Place(name, building);
    child.level = parent.level + 1;
    parent.insertPlace(parent.children.length, child);
    building.addPlace(child);
    this.repo.insertPlace(child, building.id, parent.id);
    return child;
  }

  getUnits(building: Building): PlaceResponse[] {
    return building.allPlaces()
      .filter(p => p.level === 0)
      .map(p => this.toResponse(p));
  }

  renamePlace(building: Building, placeId: string, name: string): Place | null {
    const place = building.getPlace(placeId);
    if (!place) return null;
    place.name = name.trim();
    this.repo.updatePlaceName(placeId, place.name);
    return place;
  }

  deletePlace(
    building: Building,
    placeId: string,
  ): { deleted: true } | { blocked: true } | { notFound: true } {
    const place = building.getPlace(placeId);
    if (!place) return { notFound: true };

    // Collect the full subtree (DFS)
    const subtree = this.collectSubtree(place);
    const subtreeIds = subtree.map(p => p.id);

    // Block if any package in the subtree has execution started (status >= 3)
    if (this.repo.hasActivePackagesForPlaces(subtreeIds)) return { blocked: true };

    // Delete planned packages (status 1 or 2) for places in the subtree
    this.repo.deletePackagesForPlaces(subtreeIds);

    // Remove places from the domain bottom-up to avoid broken refs
    for (const p of [...subtree].reverse()) {
      building.removePlace(p.id);
    }

    // Remove places from SQL (children first to satisfy parent_id FK constraint)
    this.repo.deletePlacesBatch([...subtreeIds].reverse());
    return { deleted: true };
  }

  private collectSubtree(place: Place): Place[] {
    const result: Place[] = [place];
    for (const child of place.children) {
      result.push(...this.collectSubtree(child));
    }
    return result;
  }

  private toResponse(place: Place): PlaceResponse {
    return {
      id: place.id,
      name: place.name,
      level: place.level,
      startDate: place.startDate?.toISOString() ?? null,
      endDate: place.endDate?.toISOString() ?? null,
      children: place.children.map(c => this.toResponse(c)),
    };
  }

  getPlaceResponse(place: Place): PlaceResponse {
    return this.toResponse(place);
  }

  updatePlaceDates(
    building: Building,
    placeId: string,
    startDate?: string | null,
    endDate?: string | null,
  ): { success: true; place: Place; movedPackages?: string[] } | { success: false; error: string } {
    const place = building.getPlace(placeId);
    if (!place) return { success: false, error: 'PLACE_NOT_FOUND' };

    let movedPackages: string[] = [];

    if (startDate !== undefined) {
      const date = startDate !== null ? new Date(startDate) : null;
      const result = building.setUnitStartDate(placeId, date);
      if (!result.success) return { success: false, error: result.error! };
      movedPackages = result.movedPackages ?? [];

      // Persist moved package positions to SQLite
      if (movedPackages.length > 0) {
        const pkgObjects: Package[] = [];
        for (const pkgId of movedPackages) {
          const pkg = building.getPackage(pkgId);
          if (pkg) pkgObjects.push(pkg);
        }
        if (pkgObjects.length > 0) {
          this.pkgRepo.bulkUpdate(pkgObjects);
        }
      }
    }

    if (endDate !== undefined) {
      const date = endDate !== null ? new Date(endDate) : null;
      const result = building.setUnitEndDate(placeId, date);
      if (!result.success) return { success: false, error: result.error! };
    }

    // Persist place dates to DB
    this.repo.updatePlaceDates(
      placeId,
      place.startDate?.toISOString() ?? null,
      place.endDate?.toISOString() ?? null,
    );

    return { success: true, place, movedPackages };
  }
}
