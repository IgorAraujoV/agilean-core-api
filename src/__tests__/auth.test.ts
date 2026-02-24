import { buildApp } from '../app';

describe('Auth API', () => {
  it('POST /auth/login retorna token para credenciais válidas', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'master@master.com', password: '12345' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeDefined();
    expect(typeof res.json().token).toBe('string');
  });

  it('POST /auth/login retorna 401 para senha errada', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'master@master.com', password: 'errada' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBeDefined();
  });

  it('GET /buildings retorna 401 sem token', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/buildings' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /health é acessível sem token', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /buildings retorna 200 com token válido', async () => {
    const app = buildApp();
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'master@master.com', password: '12345' },
    });
    const { token } = loginRes.json();

    const res = await app.inject({
      method: 'GET',
      url: '/buildings',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
