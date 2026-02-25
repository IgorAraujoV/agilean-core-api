import { FastifyInstance } from 'fastify';
import { CalendarService } from '../services/CalendarService';

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  const service = new CalendarService(app.ctx.storage);

  app.get('/buildings/:buildingId/day-dates', {
    schema: {
      tags: ['Calendar'],
      summary: 'Datas reais para cada dia do chart (via ACal)',
      params: {
        type: 'object',
        required: ['buildingId'],
        properties: { buildingId: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            dates: { type: 'array', items: { type: 'string', format: 'date' } },
          },
        },
        404: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const { buildingId } = request.params as { buildingId: string };

    if (!app.ctx.getBuilding(buildingId, request.user.userId)) {
      return reply.status(404).send({ error: 'Building not found' });
    }

    const dates = service.dayDates(buildingId);
    if (!dates) return reply.status(404).send({ error: 'Building not found' });

    return { dates };
  });
}
