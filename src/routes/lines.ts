import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LineService } from '../services/LineService';

const CreateLineSchema = z.object({
  networkId: z.string().min(1),
  placeId: z.string().min(1),
  localIds: z.array(z.string().min(1)).optional(),
});

export async function lineRoutes(app: FastifyInstance): Promise<void> {
  const service = new LineService(app.ctx.storage, app.ctx.db);

  app.post('/buildings/:buildingId/lines', {
    schema: {
      tags: ['Lines'],
      summary: 'Criar uma line (Network + Unit → gera Teams e Packages)',
      params: { type: 'object', required: ['buildingId'],
        properties: { buildingId: { type: 'string' } } },
      body: { type: 'object', required: ['networkId', 'placeId'],
        properties: { networkId: { type: 'string' }, placeId: { type: 'string' } } },
      response: {
        201: { type: 'object', properties: { id: { type: 'string' }, packageCount: { type: 'number' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { buildingId } = request.params as { buildingId: string };
    if (!app.ctx.getBuilding(buildingId, request.user.userId)) {
      return reply.status(404).send({ error: 'Building, network ou place não encontrado' });
    }
    const input = CreateLineSchema.parse(request.body);
    const result = service.create(buildingId, input.networkId, input.placeId, input.localIds);
    if (!result) return reply.status(404).send({ error: 'Building, network ou place não encontrado' });
    return reply.status(201).send(result);
  });

  app.get('/buildings/:buildingId/lines', {
    schema: {
      tags: ['Lines'],
      summary: 'Listar lines de um building',
      params: { type: 'object', required: ['buildingId'],
        properties: { buildingId: { type: 'string' } } },
      response: {
        200: { type: 'array', items: { type: 'object', properties: {
          id: { type: 'string' }, networkId: { type: 'string' }, diagramId: { type: 'string' }, placeId: { type: 'string' } } } },
      },
    },
  }, async (request) => {
    const { buildingId } = request.params as { buildingId: string };
    app.ctx.getBuilding(buildingId, request.user.userId);
    return service.list(buildingId);
  });

  app.delete('/buildings/:buildingId/lines/:lineId', {
    schema: {
      tags: ['Lines'],
      summary: 'Deletar uma line e toda sua cascata (teams, packages, links)',
      params: { type: 'object', required: ['buildingId', 'lineId'],
        properties: { buildingId: { type: 'string' }, lineId: { type: 'string' } } },
      response: {
        204: { type: 'null' },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { buildingId, lineId } = request.params as { buildingId: string; lineId: string };
    if (!app.ctx.getBuilding(buildingId, request.user.userId)) {
      return reply.status(404).send({ error: 'Building ou line não encontrado' });
    }
    const deleted = service.delete(buildingId, lineId);
    if (!deleted) return reply.status(404).send({ error: 'Building ou line não encontrado' });
    return reply.status(204).send();
  });

  app.get('/buildings/:buildingId/lines/:lineId/packages', {
    schema: {
      tags: ['Lines'],
      summary: 'Listar packages de uma line com datas, status e progresso',
      params: { type: 'object', required: ['buildingId', 'lineId'],
        properties: { buildingId: { type: 'string' }, lineId: { type: 'string' } } },
      response: {
        200: { type: 'array', items: { type: 'object', properties: {
          id: { type: 'string' },
          placeId: { type: 'string' },
          stageId: { type: 'string' },
          startCol: { type: 'number' },
          endCol: { type: 'number' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          plannedStartDate: { type: 'string', format: 'date-time' },
          plannedEndDate: { type: 'string', format: 'date-time' },
          executionStart: { type: 'string', format: 'date-time', nullable: true },
          executionEnd: { type: 'string', format: 'date-time', nullable: true },
          estimatedEnd: { type: 'string', format: 'date-time', nullable: true },
          status: { type: 'number' },
          progress: { type: 'number' },
          cost: { type: 'number' },
        }}},
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { buildingId, lineId } = request.params as { buildingId: string; lineId: string };
    if (!app.ctx.getBuilding(buildingId, request.user.userId)) {
      return reply.status(404).send({ error: 'Building ou line não encontrado' });
    }
    const packages = service.listPackages(buildingId, lineId);
    if (!packages) return reply.status(404).send({ error: 'Building ou line não encontrado' });
    return packages;
  });
}
