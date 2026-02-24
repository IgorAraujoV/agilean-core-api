import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/AuthService';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const service = new AuthService(app.ctx.db);

  app.post('/auth/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login com email e senha',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: { token: { type: 'string' } },
        },
        401: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const input = LoginSchema.parse(request.body);
    try {
      const user = await service.verifyCredentials(input.email, input.password);
      const token = await reply.jwtSign(
        { userId: user.id, email: user.email },
        { expiresIn: '7d' },
      );
      return { token };
    } catch {
      return reply.status(401).send({ error: 'Credenciais inválidas' });
    }
  });
}
