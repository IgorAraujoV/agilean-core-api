import fs from 'fs';
import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

/**
 * Simula reinício do servidor: app2 compartilha o mesmo SQLite mas tem
 * storage em memória vazio. Todos os endpoints que precisam do Building
 * em memória devem hidratar automaticamente via BuildingLoader.
 */
describe('Server restart: routes hydrate building from DB', () => {
  function tmpDb() {
    return `/tmp/agilean-restart-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  }

  it('GET /diagrams returns 200 after restart (storage empty)', async () => {
    const dbPath = tmpDb();
    try {
      const app1 = buildApp({ dbPath });
      const token = await getAuthToken(app1);

      const bRes = await app1.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'Restart Test', firstDate: '2024-01-01' },
      });
      const { id: buildingId } = bRes.json() as { id: string };

      // Restart: novo app, mesmo DB, storage vazio
      const app2 = buildApp({ dbPath });
      const res = await app2.inject({
        method: 'GET',
        url: `/buildings/${buildingId}/diagrams`,
        headers: authHeaders(token),
      });

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('POST /diagrams returns 201 after restart (storage empty)', async () => {
    const dbPath = tmpDb();
    try {
      const app1 = buildApp({ dbPath });
      const token = await getAuthToken(app1);

      const bRes = await app1.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'Restart Test', firstDate: '2024-01-01' },
      });
      const { id: buildingId } = bRes.json() as { id: string };

      // Restart
      const app2 = buildApp({ dbPath });
      const res = await app2.inject({
        method: 'POST',
        url: `/buildings/${buildingId}/diagrams`,
        headers: authHeaders(token),
        payload: { name: 'Novo Diagrama' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Novo Diagrama');
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('GET /typologies returns 200 after restart (storage empty)', async () => {
    const dbPath = tmpDb();
    try {
      const app1 = buildApp({ dbPath });
      const token = await getAuthToken(app1);

      const bRes = await app1.inject({
        method: 'POST', url: '/buildings', headers: authHeaders(token),
        payload: { name: 'Restart Test', firstDate: '2024-01-01' },
      });
      const { id: buildingId } = bRes.json() as { id: string };

      // Restart
      const app2 = buildApp({ dbPath });
      const res = await app2.inject({
        method: 'GET',
        url: `/buildings/${buildingId}/typologies`,
        headers: authHeaders(token),
      });

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    } finally {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  });

  it('unknown buildingId still returns 404 after restart logic', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const res = await app.inject({
      method: 'GET',
      url: '/buildings/nonexistent-id/diagrams',
      headers: authHeaders(token),
    });

    expect(res.statusCode).toBe(404);
  });
});
