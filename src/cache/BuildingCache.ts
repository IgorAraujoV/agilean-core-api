import { Building } from 'agilean';

interface Entry {
  buildingId: string;
  building: Building;
  lastAccess: number;
}

export class BuildingCache {
  private readonly ttlMs: number;
  private entries = new Map<string, Entry>();

  constructor(ttlMs = 10 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  get(userId: string, buildingId: string): Building | undefined {
    const entry = this.entries.get(userId);
    if (!entry || entry.buildingId !== buildingId) return undefined;
    entry.lastAccess = Date.now();
    return entry.building;
  }

  set(userId: string, buildingId: string, building: Building): void {
    this.entries.set(userId, { buildingId, building, lastAccess: Date.now() });
  }

  invalidate(userId: string): void {
    this.entries.delete(userId);
  }

  evictStale(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    for (const [userId, entry] of this.entries) {
      if (now - entry.lastAccess > this.ttlMs) toDelete.push(userId);
    }
    for (const userId of toDelete) {
      this.entries.delete(userId);
    }
  }
}
