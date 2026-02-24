import { BuildingStorage } from '../storage/BuildingStorage';
import { Building } from 'agilean';

describe('BuildingStorage', () => {
  let storage: BuildingStorage;

  beforeEach(() => {
    storage = new BuildingStorage();
  });

  it('should store and retrieve a building', () => {
    const building = new Building({
      firstDate: new Date(2024, 0, 1),
      today: new Date(2024, 0, 1),
    });
    storage.save(building, 'user-1');
    expect(storage.get(building.id)).toBe(building);
  });

  it('should return undefined for unknown id', () => {
    expect(storage.get('nonexistent')).toBeUndefined();
  });

  it('should list buildings for a user', () => {
    const b1 = new Building({ firstDate: new Date(2024, 0, 1), today: new Date(2024, 0, 1) });
    const b2 = new Building({ firstDate: new Date(2024, 1, 1), today: new Date(2024, 1, 1) });
    storage.save(b1, 'user-1');
    storage.save(b2, 'user-1');
    expect(storage.allForUser('user-1')).toHaveLength(2);
  });

  it('should not list buildings of another user', () => {
    const b1 = new Building({ firstDate: new Date(2024, 0, 1), today: new Date(2024, 0, 1) });
    const b2 = new Building({ firstDate: new Date(2024, 1, 1), today: new Date(2024, 1, 1) });
    storage.save(b1, 'user-1');
    storage.save(b2, 'user-2');
    expect(storage.allForUser('user-1')).toHaveLength(1);
    expect(storage.allForUser('user-2')).toHaveLength(1);
  });

  it('should delete a building', () => {
    const building = new Building({
      firstDate: new Date(2024, 0, 1),
      today: new Date(2024, 0, 1),
    });
    storage.save(building, 'user-1');
    expect(storage.delete(building.id)).toBe(true);
    expect(storage.get(building.id)).toBeUndefined();
  });
});
