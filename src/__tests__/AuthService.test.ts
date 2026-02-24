import { openDatabase } from '../database/DatabaseService';
import { AuthService } from '../services/AuthService';

describe('AuthService', () => {
  it('verifyCredentials retorna user para credenciais válidas', async () => {
    const db = openDatabase(':memory:');
    const service = new AuthService(db);
    const user = await service.verifyCredentials('master@master.com', '12345');
    expect(user.id).toBeDefined();
    expect(user.email).toBe('master@master.com');
  });

  it('verifyCredentials lança erro para senha errada', async () => {
    const db = openDatabase(':memory:');
    const service = new AuthService(db);
    await expect(
      service.verifyCredentials('master@master.com', 'errada'),
    ).rejects.toThrow('Credenciais inválidas');
  });

  it('verifyCredentials lança erro para email desconhecido', async () => {
    const db = openDatabase(':memory:');
    const service = new AuthService(db);
    await expect(
      service.verifyCredentials('ninguem@example.com', '12345'),
    ).rejects.toThrow('Credenciais inválidas');
  });
});
