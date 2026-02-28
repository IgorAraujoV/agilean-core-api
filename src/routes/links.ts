import { FastifyInstance } from 'fastify';
import { LinkEndpointService } from '../services/LinkEndpointService';
import { CreateLinkSchema, PatchLinkSchema } from '../schemas';

export async function linkRoutes(app: FastifyInstance): Promise<void> {
  const service = new LinkEndpointService(app.ctx.storage, app.ctx.db);

  // GET /buildings/:buildingId/links
  app.get('/buildings/:buildingId/links', {
    schema: {
      tags: ['Links'],
      summary: 'Lista todos os links do building',
    },
  }, async (request, reply) => {
    const { buildingId } = request.params as { buildingId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });
    return service.getAll(building);
  });

  // POST /buildings/:buildingId/links
  app.post('/buildings/:buildingId/links', {
    schema: {
      tags: ['Links'],
      summary: 'Cria um link entre dois pacotes',
    },
  }, async (request, reply) => {
    const { buildingId } = request.params as { buildingId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const input = CreateLinkSchema.parse(request.body);
    const result = service.create(building, input.sourceId, input.destinationId, input.latency);

    if ('error' in result) {
      return reply.status(400).send({ error: result.error });
    }
    return reply.status(201).send(result.link);
  });

  // PATCH /buildings/:buildingId/links/:linkId
  app.patch('/buildings/:buildingId/links/:linkId', {
    schema: {
      tags: ['Links'],
      summary: 'Atualiza latencia e/ou locked de um link',
    },
  }, async (request, reply) => {
    const { buildingId, linkId } = request.params as { buildingId: string; linkId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const input = PatchLinkSchema.parse(request.body);
    const result = service.update(building, linkId, input);
    if (!result) return reply.status(404).send({ error: 'Link not found' });
    return result;
  });

  // DELETE /buildings/:buildingId/links/:linkId
  app.delete('/buildings/:buildingId/links/:linkId', {
    schema: {
      tags: ['Links'],
      summary: 'Remove um link',
    },
  }, async (request, reply) => {
    const { buildingId, linkId } = request.params as { buildingId: string; linkId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const success = service.delete(building, linkId);
    if (!success) return reply.status(404).send({ error: 'Link not found' });
    return reply.status(204).send();
  });

  // POST /buildings/:buildingId/links/:linkId/toggle-lock
  app.post('/buildings/:buildingId/links/:linkId/toggle-lock', {
    schema: {
      tags: ['Links'],
      summary: 'Toggle lock de um link (recalcula latencia pelo gap atual)',
    },
  }, async (request, reply) => {
    const { buildingId, linkId } = request.params as { buildingId: string; linkId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const result = service.toggleLock(building, linkId);
    if (!result) return reply.status(404).send({ error: 'Link not found' });
    return result;
  });
}
