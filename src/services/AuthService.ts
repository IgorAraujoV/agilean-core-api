import bcryptjs from 'bcryptjs';
import type { Database } from 'better-sqlite3';
import { UserRepository } from '../database/UserRepository';

export class AuthService {
  private userRepo: UserRepository;

  constructor(db: Database) {
    this.userRepo = new UserRepository(db);
  }

  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string }> {
    const user = this.userRepo.findByEmail(email);
    if (!user) throw new Error('Credenciais inválidas');

    const valid = await bcryptjs.compare(password, user.password_hash);
    if (!valid) throw new Error('Credenciais inválidas');

    return { id: user.id, email: user.email };
  }
}
