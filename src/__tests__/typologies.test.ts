import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

describe('Typologies API', () => {
  async function createBuilding(app: ReturnType<typeof buildApp>, token: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/buildings',
      headers: authHeaders(token),
      payload: { name: 'Test Building', firstDate: '2024-01-01' },
    });
    return res.json().id as string;
  }

  async function createUnit(app: ReturnType<typeof buildApp>, token: string, buildingId: string, name: string) {
    const res = await app.inject({
      method: 'POST', url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token), payload: { name },
    });
    return res.json() as { id: string; name: string; level: number };
  }

  async function createChild(app: ReturnType<typeof buildApp>, token: string, buildingId: string, parentId: string, name: string) {
    const res = await app.inject({
      method: 'POST', url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token), payload: { name, parentId },
    });
    return res.json() as { id: string; name: string; level: number };
  }

  it('GET /buildings/:id/typologies should return empty array initially', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await createBuilding(app, token);

    const response = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('POST /buildings/:id/typologies should create a unit', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await createBuilding(app, token);

    const response = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token),
      payload: { name: 'Bloco A' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe('Bloco A');
    expect(body.level).toBe(0);
  });

  it('POST should add children to a unit', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await createBuilding(app, token);

    const unitRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token),
      payload: { name: 'Bloco A' },
    });
    const unitId = unitRes.json().id;

    const floorRes = await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token),
      payload: { name: 'Pavimento 1', parentId: unitId },
    });

    expect(floorRes.statusCode).toBe(201);
    expect(floorRes.json().level).toBe(1);
  });

  it('GET should return typology tree after adding places', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await createBuilding(app, token);

    await app.inject({
      method: 'POST',
      url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token),
      payload: { name: 'Bloco A' },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token),
    });

    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].name).toBe('Bloco A');
  });

  it('PATCH /typologies/:id renames the place', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await createBuilding(app, token);
    const unit = await createUnit(app, token, buildingId, 'Bloco A');

    const res = await app.inject({
      method: 'PATCH',
      url: `/buildings/${buildingId}/typologies/${unit.id}`,
      headers: authHeaders(token),
      payload: { name: 'Torre Norte' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Torre Norte');

    // Confirma persistência no SQL (invalida building e re-hidrata)
    app.ctx.storage.delete(buildingId);
    const get = await app.inject({
      method: 'GET', url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token),
    });
    expect(get.json()[0].name).toBe('Torre Norte');
  });

  it('PATCH /typologies/:id returns 404 for unknown place', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await createBuilding(app, token);

    const res = await app.inject({
      method: 'PATCH',
      url: `/buildings/${buildingId}/typologies/nonexistent`,
      headers: authHeaders(token),
      payload: { name: 'X' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('DELETE /typologies/:id deletes a leaf place', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await createBuilding(app, token);
    const unit = await createUnit(app, token, buildingId, 'Bloco A');

    const del = await app.inject({
      method: 'DELETE',
      url: `/buildings/${buildingId}/typologies/${unit.id}`,
      headers: authHeaders(token),
    });
    expect(del.statusCode).toBe(204);

    const get = await app.inject({
      method: 'GET', url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token),
    });
    expect(get.json()).toHaveLength(0);
  });

  it('DELETE /typologies/:id cascades to children', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await createBuilding(app, token);
    const unit = await createUnit(app, token, buildingId, 'Bloco A');
    await createChild(app, token, buildingId, unit.id, 'Local 1');
    await createChild(app, token, buildingId, unit.id, 'Local 2');

    const del = await app.inject({
      method: 'DELETE',
      url: `/buildings/${buildingId}/typologies/${unit.id}`,
      headers: authHeaders(token),
    });
    expect(del.statusCode).toBe(204);

    const get = await app.inject({
      method: 'GET', url: `/buildings/${buildingId}/typologies`,
      headers: authHeaders(token),
    });
    expect(get.json()).toHaveLength(0);
  });

  it('DELETE /typologies/:id returns 409 if descendant has active package', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);
    const buildingId = await createBuilding(app, token);
    const unit = await createUnit(app, token, buildingId, 'Bloco A');
    const child = await createChild(app, token, buildingId, unit.id, 'Local 1');

    // Insert a package with status >= 3 directly in the DB to simulate an active package.
    // FK enforcement is disabled temporarily because team_id / stage_id are synthetic.
    app.ctx.db.pragma('foreign_keys = OFF');
    app.ctx.db.prepare(`
      INSERT INTO packages (id, team_id, place_id, stage_id, start_col, end_col, status, progress, cost, labor_cost, type, code, name)
      VALUES ('pkg-test', 'team-fake', ?, 'stage-fake', 0, 4, 3, 0, 0, 0, 1, '', '')
    `).run(child.id);
    app.ctx.db.pragma('foreign_keys = ON');

    const del = await app.inject({
      method: 'DELETE',
      url: `/buildings/${buildingId}/typologies/${unit.id}`,
      headers: authHeaders(token),
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error).toBe('Place has active packages');
  });
});
