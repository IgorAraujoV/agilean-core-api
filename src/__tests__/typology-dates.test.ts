import fs from 'fs';
import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

describe('PATCH /typologies/:placeId dates', () => {
  function tmpDb() {
    return `/tmp/agilean-typology-dates-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  }

  it('sets startDate and endDate on a unit', async () => {
    const dbPath = tmpDb();
    try {
      const app = buildApp({ dbPath });
      const token = await getAuthToken(app);

      const bRes = await app.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'DateTest', firstDate: '2024-01-01' },
      });
      const buildingId = bRes.json().id;

      const pRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Bloco A' },
      });
      const placeId = pRes.json().id;

      const res = await app.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${placeId}`,
        headers: authHeaders(token),
        payload: { startDate: '2024-02-01T08:00:00.000Z', endDate: '2024-06-01T08:00:00.000Z' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().startDate).toBeTruthy();
      expect(res.json().endDate).toBeTruthy();
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('clears dates with null', async () => {
    const dbPath = tmpDb();
    try {
      const app = buildApp({ dbPath });
      const token = await getAuthToken(app);

      const bRes = await app.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'DateTest', firstDate: '2024-01-01' },
      });
      const buildingId = bRes.json().id;

      const pRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Bloco A' },
      });
      const placeId = pRes.json().id;

      // Set dates first
      await app.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${placeId}`,
        headers: authHeaders(token),
        payload: { startDate: '2024-02-01T08:00:00.000Z' },
      });

      // Clear with null
      const res = await app.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${placeId}`,
        headers: authHeaders(token),
        payload: { startDate: null },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().startDate).toBeNull();
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('returns 400 for non-unit place', async () => {
    const dbPath = tmpDb();
    try {
      const app = buildApp({ dbPath });
      const token = await getAuthToken(app);

      const bRes = await app.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'DateTest', firstDate: '2024-01-01' },
      });
      const buildingId = bRes.json().id;

      const pRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Bloco A' },
      });
      const unitId = pRes.json().id;

      // Create child (level 1)
      const cRes = await app.inject({
        method: 'POST', url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token), payload: { name: 'Apto 101', parentId: unitId },
      });
      const childId = cRes.json().id;

      const res = await app.inject({
        method: 'PATCH', url: `/buildings/${buildingId}/typologies/${childId}`,
        headers: authHeaders(token),
        payload: { startDate: '2024-02-01T08:00:00.000Z' },
      });

      expect(res.statusCode).toBe(400);
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });
});
