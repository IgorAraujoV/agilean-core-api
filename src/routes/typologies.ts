import { FastifyInstance } from 'fastify';
import { TypologyService } from '../services/TypologyService';
import { CreateUnitSchema, CreateLocalSchema, RenamePlaceSchema } from '../schemas';
import { ErrorResponse, BuildingIdParam } from '../schemas/openapi';

const PlaceNode = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    level: { type: 'number', description: '0=Unit, 1=Local, 2=SubLocal, 3=Ambient' },
    children: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
} as const;

export async function typologyRoutes(app: FastifyInstance): Promise<void> {
  const service = new TypologyService(app.ctx.db);

  app.get('/buildings/:buildingId/typologies', {
    schema: {
      tags: ['Typologies'],
      summary: 'Listar tipologia (árvore de units com filhos)',
      params: BuildingIdParam,
      response: {
        200: { type: 'array', items: PlaceNode },
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { buildingId } = request.params as { buildingId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    return service.getUnits(building);
  });

  app.post('/buildings/:buildingId/typologies', {
    schema: {
      tags: ['Typologies'],
      summary: 'Criar unit (sem parentId) ou filho (com parentId)',
      params: BuildingIdParam,
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, example: 'Bloco A' },
          parentId: { type: 'string', format: 'uuid', description: 'Se informado, cria filho do parent. Senão, cria unit (nível 0).' },
        },
      },
      response: {
        201: PlaceNode,
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { buildingId } = request.params as { buildingId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const body = request.body as Record<string, unknown>;

    if (body.parentId) {
      const input = CreateLocalSchema.parse(body);
      const child = service.addChild(building, input.parentId, input.name);
      if (!child) return reply.status(404).send({ error: 'Parent not found' });

      return reply.status(201).send({
        id: child.id,
        name: child.name,
        level: child.level,
        children: [],
      });
    }

    const input = CreateUnitSchema.parse(body);
    const unit = service.createUnit(building, input.name);

    return reply.status(201).send({
      id: unit.id,
      name: unit.name,
      level: unit.level,
      children: [],
    });
  });

  app.patch('/buildings/:buildingId/typologies/:placeId', {
    schema: {
      tags: ['Typologies'],
      summary: 'Renomear um place',
      params: {
        type: 'object',
        required: ['buildingId', 'placeId'],
        properties: {
          buildingId: { type: 'string' },
          placeId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1 } },
      },
      response: { 200: PlaceNode, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId, placeId } = request.params as { buildingId: string; placeId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const { name } = RenamePlaceSchema.parse(request.body);
    const updated = service.renamePlace(building, placeId, name);
    if (!updated) return reply.status(404).send({ error: 'Place not found' });

    return reply.send({
      id: updated.id,
      name: updated.name,
      level: updated.level,
      children: [],
    });
  });

  app.delete('/buildings/:buildingId/typologies/:placeId', {
    schema: {
      tags: ['Typologies'],
      summary: 'Deletar um place (cascade)',
      params: {
        type: 'object',
        required: ['buildingId', 'placeId'],
        properties: {
          buildingId: { type: 'string' },
          placeId: { type: 'string' },
        },
      },
      response: {
        204: { type: 'null' },
        404: ErrorResponse,
        409: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { buildingId, placeId } = request.params as { buildingId: string; placeId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const result = service.deletePlace(building, placeId);
    if ('notFound' in result) return reply.status(404).send({ error: 'Place not found' });
    if ('blocked' in result) return reply.status(409).send({ error: 'Place has active packages' });

    // Invalidate cache: next request re-hydrates from SQL without the deleted places/packages
    app.ctx.storage.delete(buildingId);
    app.ctx.cache.invalidate(request.user.userId);

    return reply.status(204).send();
  });
}
