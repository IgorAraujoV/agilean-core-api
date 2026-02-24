import { openDatabase } from '../database/DatabaseService';
import { UserRepository } from '../database/UserRepository';

describe('UserRepository', () => {
  it('findByEmail retorna o master user seedado pelo DatabaseService', () => {
    const db = openDatabase(':memory:');
    const repo = new UserRepository(db);
    const user = repo.findByEmail('master@master.com');
    expect(user).toBeDefined();
    expect(user!.email).toBe('master@master.com');
    expect(user!.id).toBeDefined();
    expect(user!.password_hash).toBeDefined();
  });

  it('findByEmail retorna undefined para email desconhecido', () => {
    const db = openDatabase(':memory:');
    const repo = new UserRepository(db);
    expect(repo.findByEmail('nope@example.com')).toBeUndefined();
  });
});
