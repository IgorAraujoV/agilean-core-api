import { BuildingCache } from '../cache/BuildingCache';
import { Building } from 'agilean';

function makeBuilding(id: string): Building {
  return new Building({ id, name: 'Test', firstDate: new Date('2024-01-01'), today: new Date('2024-01-01') });
}

describe('BuildingCache', () => {
  it('returns undefined for unknown userId', () => {
    const cache = new BuildingCache();
    expect(cache.get('u1', 'b1')).toBeUndefined();
  });

  it('stores and retrieves building by userId', () => {
    const cache = new BuildingCache();
    const b = makeBuilding('b1');
    cache.set('u1', 'b1', b);
    expect(cache.get('u1', 'b1')).toBe(b);
  });

  it('returns undefined when userId requests different buildingId than cached', () => {
    const cache = new BuildingCache();
    const b = makeBuilding('b1');
    cache.set('u1', 'b1', b);
    expect(cache.get('u1', 'b2')).toBeUndefined();
  });

  it('replaces previous building when userId switches obra', () => {
    const cache = new BuildingCache();
    cache.set('u1', 'b1', makeBuilding('b1'));
    cache.set('u1', 'b2', makeBuilding('b2'));
    expect(cache.get('u1', 'b1')).toBeUndefined();
    expect(cache.get('u1', 'b2')).not.toBeUndefined();
  });

  it('invalidate removes entry for userId', () => {
    const cache = new BuildingCache();
    cache.set('u1', 'b1', makeBuilding('b1'));
    cache.invalidate('u1');
    expect(cache.get('u1', 'b1')).toBeUndefined();
  });

  it('two users are isolated', () => {
    const cache = new BuildingCache();
    cache.set('u1', 'b1', makeBuilding('b1'));
    cache.set('u2', 'b2', makeBuilding('b2'));
    expect(cache.get('u1', 'b1')).not.toBeUndefined();
    expect(cache.get('u2', 'b2')).not.toBeUndefined();
    cache.invalidate('u1');
    expect(cache.get('u2', 'b2')).not.toBeUndefined();
  });

  it('evictStale removes entries older than TTL', async () => {
    const shortTtl = 50; // 50ms TTL
    const cache = new BuildingCache(shortTtl);
    cache.set('u1', 'b1', makeBuilding('b1'));

    // Before TTL expires: still in cache
    expect(cache.get('u1', 'b1')).not.toBeUndefined();

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, shortTtl + 10));

    cache.evictStale();
    expect(cache.get('u1', 'b1')).toBeUndefined();
  });

  it('evictStale does not remove entries within TTL', () => {
    const longTtl = 60_000; // 60s TTL
    const cache = new BuildingCache(longTtl);
    cache.set('u1', 'b1', makeBuilding('b1'));
    cache.evictStale();
    expect(cache.get('u1', 'b1')).not.toBeUndefined();
  });
});
