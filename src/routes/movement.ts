import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MovementEndpointService } from '../services/MovementEndpointService';

const MoveSchema = z.union([
  z.object({ date: z.string().datetime() }),
  z.object({ column: z.number().int().min(0) }),
]);

export async function movementRoutes(app: FastifyInstance): Promise<void> {
  const service = new MovementEndpointService(app.ctx.storage, app.ctx.db);

  app.post('/buildings/:buildingId/packages/:packageId/move', {
    schema: {
      tags: ['Packages'],
      summary: 'Mover pacote para uma coluna — retorna patch com pacotes alterados',
      params: { type: 'object', required: ['buildingId', 'packageId'],
        properties: { buildingId: { type: 'string' }, packageId: { type: 'string' } } },
      body: {
        type: 'object',
        oneOf: [
          { required: ['date'], properties: { date: { type: 'string', format: 'date-time' } } },
          { required: ['column'], properties: { column: { type: 'integer', minimum: 0 } } },
        ],
      },
      response: {
        200: { type: 'object', properties: {
          movedCount: { type: 'number' },
          packages: { type: 'array', items: { type: 'object', properties: {
            id: { type: 'string' },
            startCol: { type: 'number' }, endCol: { type: 'number' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          }}},
        }},
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { buildingId, packageId } = request.params as { buildingId: string; packageId: string };
    if (!app.ctx.getBuilding(buildingId, request.user.userId)) {
      return reply.status(404).send({ error: 'Building ou package não encontrado' });
    }
    const parsed = MoveSchema.parse(request.body);
    const target = 'date' in parsed ? new Date(parsed.date) : parsed.column;
    const result = service.move(buildingId, packageId, target);
    if (!result) return reply.status(404).send({ error: 'Building ou package não encontrado' });
    return result;
  });
}
