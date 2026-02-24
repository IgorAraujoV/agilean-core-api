import { Building } from 'agilean';

export class BuildingStorage {
  private buildings = new Map<string, Building>();
  // userId → Set de buildingIds (suporte a múltiplos users por building)
  private userBuildings = new Map<string, Set<string>>();

  save(building: Building, userId: string): void {
    this.buildings.set(building.id, building);
    const set = this.userBuildings.get(userId) ?? new Set<string>();
    set.add(building.id);
    this.userBuildings.set(userId, set);
  }

  get(id: string): Building | undefined {
    return this.buildings.get(id);
  }

  allForUser(userId: string): Building[] {
    const ids = this.userBuildings.get(userId) ?? new Set<string>();
    return [...ids]
      .map(id => this.buildings.get(id))
      .filter((b): b is Building => b !== undefined);
  }

  all(): Building[] {
    return Array.from(this.buildings.values());
  }

  delete(id: string): boolean {
    for (const set of this.userBuildings.values()) set.delete(id);
    return this.buildings.delete(id);
  }
}
