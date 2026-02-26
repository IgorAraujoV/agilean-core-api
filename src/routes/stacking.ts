import { FastifyInstance } from 'fastify';
import { StackingEndpointService } from '../services/StackingEndpointService';

export async function stackingRoutes(app: FastifyInstance): Promise<void> {
  const service = new StackingEndpointService(app.ctx.storage, app.ctx.db);

  const responseSchema = {
    200: {
      type: 'object',
      properties: {
        movedCount: { type: 'number' },
        packages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              startCol: { type: 'number' },
              endCol: { type: 'number' },
              startDate: { type: 'string', format: 'date-time' },
              endDate: { type: 'string', format: 'date-time' },
              teamId: { type: 'string' },
            },
          },
        },
        createdTeams: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              stageId: { type: 'string' },
              lineId: { type: 'string' },
              index: { type: 'number' },
            },
          },
        },
        deletedTeamIds: { type: 'array', items: { type: 'string' } },
      },
    },
    404: { type: 'object', properties: { error: { type: 'string' } } },
  };

  const paramsSchema = {
    type: 'object' as const,
    required: ['buildingId', 'packageId'],
    properties: {
      buildingId: { type: 'string' as const },
      packageId: { type: 'string' as const },
    },
  };

  app.post('/buildings/:buildingId/packages/:packageId/stack', {
    schema: {
      tags: ['Packages'],
      summary: 'Stack +1 — adiciona equipe e redistribui pacotes do stage',
      params: paramsSchema,
      response: responseSchema,
    },
  }, async (request, reply) => {
    const { buildingId, packageId } = request.params as { buildingId: string; packageId: string };
    if (!app.ctx.getBuilding(buildingId, request.user.userId)) {
      return reply.status(404).send({ error: 'Building ou package não encontrado' });
    }
    const result = service.stack(buildingId, packageId, 1);
    if (!result) return reply.status(404).send({ error: 'Building ou package não encontrado' });
    return result;
  });

  app.post('/buildings/:buildingId/packages/:packageId/unstack', {
    schema: {
      tags: ['Packages'],
      summary: 'Unstack -1 — remove equipe e consolida pacotes do stage',
      params: paramsSchema,
      response: responseSchema,
    },
  }, async (request, reply) => {
    const { buildingId, packageId } = request.params as { buildingId: string; packageId: string };
    if (!app.ctx.getBuilding(buildingId, request.user.userId)) {
      return reply.status(404).send({ error: 'Building ou package não encontrado' });
    }
    const result = service.stack(buildingId, packageId, -1);
    if (!result) return reply.status(404).send({ error: 'Building ou package não encontrado' });
    return result;
  });
}
