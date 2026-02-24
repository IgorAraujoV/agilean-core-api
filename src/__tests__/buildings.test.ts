import { buildApp } from '../app';
import { getAuthToken, authHeaders } from './testHelpers';

describe('Buildings API', () => {
  it('POST /buildings should create a building', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings',
      headers: authHeaders(token),
      payload: { name: 'Edifício Teste', firstDate: '2024-01-01' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('Edifício Teste');
  });

  it('GET /buildings should list all buildings', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    await app.inject({
      method: 'POST',
      url: '/buildings',
      headers: authHeaders(token),
      payload: { name: 'Building 1', firstDate: '2024-01-01' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/buildings',
      headers: authHeaders(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });

  it('GET /buildings/:buildingId should return a building', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const createRes = await app.inject({
      method: 'POST',
      url: '/buildings',
      headers: authHeaders(token),
      payload: { name: 'Building X', firstDate: '2024-01-01' },
    });
    const { id } = createRes.json();

    const response = await app.inject({
      method: 'GET',
      url: `/buildings/${id}`,
      headers: authHeaders(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe('Building X');
  });

  it('POST /buildings should return 400 for invalid payload', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const response = await app.inject({
      method: 'POST',
      url: '/buildings',
      headers: authHeaders(token),
      payload: { name: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBeDefined();
  });

  it('GET /buildings/:buildingId should return 404 for unknown', async () => {
    const app = buildApp();
    const token = await getAuthToken(app);

    const response = await app.inject({
      method: 'GET',
      url: '/buildings/nonexistent',
      headers: authHeaders(token),
    });

    expect(response.statusCode).toBe(404);
  });
});
