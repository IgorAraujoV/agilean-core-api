import { FastifyInstance } from 'fastify';
import { Building } from 'agilean';
import { BuildingService } from '../services/BuildingService';
import { AglImportService } from '../services/AglImportService';
import { AglExportService } from '../services/AglExportService';
import { CreateBuildingSchema } from '../schemas';
import { BuildingSummary, ErrorResponse, BuildingIdParam } from '../schemas/openapi';

function buildingToResponse(building: Building) {
  return {
    id: building.id,
    name: building.name,
    diagramCount: building.allDiagrams().length,
    placeCount: building.allPlaces().length,
    firstDate: building.firstDate.toISOString(),
    today: building.today.toISOString(),
    todayEnabled: building.todayEnabled,
  };
}

export async function buildingRoutes(app: FastifyInstance): Promise<void> {
  const service = new BuildingService(app.ctx.storage, app.ctx.db);

  app.post('/buildings', {
    schema: {
      tags: ['Buildings'],
      summary: 'Criar um building',
      body: {
        type: 'object',
        required: ['name', 'firstDate'],
        properties: {
          name: { type: 'string', minLength: 1, example: 'Edifício A' },
          firstDate: { type: 'string', format: 'date', example: '2024-01-01' },
        },
      },
      response: {
        201: BuildingSummary,
        400: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const input = CreateBuildingSchema.parse(request.body);
    const building = service.create(input, request.user.userId);
    return reply.status(201).send(buildingToResponse(building));
  });

  app.get('/buildings', {
    schema: {
      tags: ['Buildings'],
      summary: 'Listar todos os buildings',
      response: {
        200: { type: 'array', items: BuildingSummary },
      },
    },
  }, async (request) => {
    const rows = service.list(request.user.userId);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      diagramCount: r.diagramCount,
      placeCount: r.placeCount,
      firstDate: r.firstDate,
      today: r.today,
      todayEnabled: r.todayEnabled !== 0,
    }));
  });

  app.post('/buildings/import', {
    bodyLimit: 200 * 1024 * 1024, // 200MB — AGL files can be 60-100MB
    schema: {
      tags: ['Buildings'],
      summary: 'Importar building a partir de AGL JSON',
      body: { type: 'object', additionalProperties: true },
      response: {
        201: BuildingSummary,
        400: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    try {
      const importService = new AglImportService(app.ctx.db, app.ctx.storage);
      const building = importService.import(request.body as Record<string, unknown>, request.user.userId);
      return reply.status(201).send(buildingToResponse(building));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao importar AGL';
      return reply.status(400).send({ error: message });
    }
  });

  app.get('/buildings/:buildingId/export', {
    schema: {
      tags: ['Buildings'],
      summary: 'Exportar building como AGL JSON',
      params: BuildingIdParam,
      response: {
        200: { type: 'object', additionalProperties: true },
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { buildingId } = request.params as { buildingId: string };

    // Verificar acesso do usuario via building_users
    const access = app.ctx.db
      .prepare('SELECT 1 FROM building_users WHERE building_id = ? AND user_id = ?')
      .get(buildingId, request.user.userId);
    if (!access) return reply.status(404).send({ error: 'Building not found' });

    const exportService = new AglExportService(app.ctx.db);
    const agl = exportService.export(buildingId);
    if (!agl) return reply.status(404).send({ error: 'Building not found' });

    const buildingName = (agl.company?.buildingCompanies?.[0]?.branchOffices?.[0]?.buildings?.[0]?.name as string) ?? 'building';
    const safeName = buildingName.replace(/[^a-zA-Z0-9_-]/g, '_');

    return reply
      .header('Content-Disposition', `attachment; filename="${safeName}.agl"`)
      .header('Content-Type', 'application/json')
      .send(agl);
  });

  app.get('/buildings/:buildingId', {
    schema: {
      tags: ['Buildings'],
      summary: 'Obter um building por ID',
      params: BuildingIdParam,
      response: {
        200: BuildingSummary,
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { buildingId } = request.params as { buildingId: string };
    const row = service.getByIdSummary(buildingId, request.user.userId);
    if (!row) return reply.status(404).send({ error: 'Building not found' });
    return {
      id: row.id,
      name: row.name,
      diagramCount: row.diagramCount,
      placeCount: row.placeCount,
      firstDate: row.firstDate,
      today: row.today,
      todayEnabled: row.todayEnabled !== 0,
    };
  });
}
