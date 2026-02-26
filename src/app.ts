import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyJwt from '@fastify/jwt';
import { ZodError } from 'zod';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { buildingRoutes } from './routes/buildings';
import { typologyRoutes } from './routes/typologies';
import { diagramRoutes } from './routes/diagrams';
import { lineRoutes } from './routes/lines';
import { movementRoutes } from './routes/movement';
import { stackingRoutes } from './routes/stacking';
import { calendarRoutes } from './routes/calendar';
import { BuildingStorage } from './storage/BuildingStorage';
import { BuildingCache } from './cache/BuildingCache';
import { BuildingLoader } from './loader/BuildingLoader';
import { openDatabase } from './database/DatabaseService';
import type { Building } from 'agilean';
import type { Database } from 'better-sqlite3';

export interface AppContext {
  storage: BuildingStorage;
  db: Database;
  cache: BuildingCache;
  loader: BuildingLoader;
  getBuilding(buildingId: string, userId: string): Building | null;
}

export interface BuildAppOptions {
  dbPath?: string;  // default: ':memory:' (testes usam este default)
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string };
    user: { userId: string; email: string };
  }
}

// Rotas que NÃO precisam de autenticação
const PUBLIC_PREFIXES = ['/auth/', '/health', '/docs'];

export function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        keywords: ['example'],
      },
    },
  });

  const storage = new BuildingStorage();
  const db = openDatabase(opts.dbPath ?? ':memory:');
  const cache = new BuildingCache();
  const loader = new BuildingLoader(db);

  function getBuilding(buildingId: string, userId: string): Building | null {
    // 1. Fast path: already in memory for this session
    const existing = storage.get(buildingId);
    if (existing) return existing;

    // 2. Check per-user LRU cache
    const cached = cache.get(userId, buildingId);
    if (cached) {
      storage.save(cached, userId);
      return cached;
    }

    // 3. Verify user access then hydrate from SQL
    const access = db
      .prepare('SELECT 1 FROM building_users WHERE building_id = ? AND user_id = ?')
      .get(buildingId, userId);
    if (!access) return null;

    const loaded = loader.loadWithPackages(buildingId);
    if (!loaded) return null;

    storage.save(loaded, userId);
    cache.set(userId, buildingId, loaded);
    return loaded;
  }

  app.decorate('ctx', { storage, db, cache, loader, getBuilding });

  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? 'agilean-secret-2026',
  });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'Agilean Server',
        description: 'Backend REST API para o sistema Agilean.',
        version: '0.1.0',
      },
      tags: [
        { name: 'Auth', description: 'Autenticação' },
        { name: 'Health', description: 'Health check' },
        { name: 'Buildings', description: 'Gerenciamento de Buildings' },
        { name: 'Typologies', description: 'Hierarquia de Places (Unit → Local → SubLocal)' },
        { name: 'Diagrams', description: 'Diagramas de precedência (Network → Stages)' },
        { name: 'Networks', description: 'Redes de stages dentro de um diagrama' },
      ],
    },
  });

  app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // Proteção global por JWT — rotas públicas são ignoradas
  app.addHook('preHandler', async (request, reply) => {
    const url = request.raw.url ?? '';
    if (PUBLIC_PREFIXES.some(prefix => url.startsWith(prefix))) return;
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  app.setErrorHandler(async (error: Error & { validation?: unknown; statusCode?: number }, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Validation error',
        details: error.errors,
      });
    }
    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation error',
        details: error.validation,
      });
    }
    if (error.statusCode) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    return reply.status(500).send({ error: 'Internal server error' });
  });

  // authRoutes registrado ANTES das demais para garantir que /auth/login existe
  app.register(authRoutes);
  app.register(healthRoutes);
  app.register(buildingRoutes);
  app.register(typologyRoutes);
  app.register(diagramRoutes);
  app.register(lineRoutes);
  app.register(movementRoutes);
  app.register(stackingRoutes);
  app.register(calendarRoutes);

  return app;
}
