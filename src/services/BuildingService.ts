import { Building } from 'agilean';
import type { Database } from 'better-sqlite3';
import { BuildingStorage } from '../storage/BuildingStorage';
import { CreateBuildingInput } from '../schemas';
import { StructuralRepository } from '../database/StructuralRepository';
import { BuildingRepository, BuildingSummaryRow } from '../database/BuildingRepository';

export class BuildingService {
  private repo: StructuralRepository;
  private buildingRepo: BuildingRepository;
  private db: Database;

  constructor(private storage: BuildingStorage, db: Database) {
    this.repo = new StructuralRepository(db);
    this.buildingRepo = new BuildingRepository(db);
    this.db = db;
  }

  create(input: CreateBuildingInput, userId: string): Building {
    const building = new Building({
      name: input.name,
      firstDate: input.firstDate,
      today: new Date(),
    });
    this.storage.save(building, userId);
    this.repo.insertBuilding(building);
    // Inserir na junction table many-to-many
    this.db
      .prepare('INSERT INTO building_users (building_id, user_id) VALUES (?, ?)')
      .run(building.id, userId);
    return building;
  }

  getById(id: string): Building | undefined {
    return this.storage.get(id);
  }

  getByIdSummary(id: string, userId: string): BuildingSummaryRow | null {
    return this.buildingRepo.findById(id, userId);
  }

  list(userId: string): BuildingSummaryRow[] {
    return this.buildingRepo.findAllForUser(userId);
  }
}
