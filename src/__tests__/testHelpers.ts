import { buildApp } from '../app';

export async function getAuthToken(app: ReturnType<typeof buildApp>): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'master@master.com', password: '12345' },
  });
  return (res.json() as { token: string }).token;
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
