import { buildApp } from '../app';
import { AppError } from '../errors/AppError';
import { getAuthToken, authHeaders } from './testHelpers';

let app: ReturnType<typeof buildApp>;
let token: string;

beforeAll(async () => {
  app = buildApp();

  // Rota que lança AppError com code e details
  app.get('/test/app-error', async () => {
    throw new AppError(409, 'Stage has active packages', 'STAGE_HAS_PACKAGES', {
      stageId: 'abc',
    });
  });

  // Rota que lança AppError sem code/details
  app.get('/test/app-error-simple', async () => {
    throw new AppError(404, 'Building not found');
  });

  // Rota que lança Error genérico (500)
  app.get('/test/generic-error', async () => {
    throw new Error('Cannot read property x of undefined');
  });

  await app.ready();
  token = await getAuthToken(app);
});

afterAll(() => app.close());

describe('Global error handler', () => {
  it('should return structured response for AppError with all fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/app-error',
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe('Stage has active packages');
    expect(body.code).toBe('STAGE_HAS_PACKAGES');
    expect(body.details).toEqual({ stageId: 'abc' });
  });

  it('should return structured response for AppError without optional fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/app-error-simple',
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('Building not found');
    expect(body.code).toBeUndefined();
    expect(body.details).toBeUndefined();
  });

  it('should return real error message for unhandled errors (500)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/generic-error',
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe('Cannot read property x of undefined');
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
