import { FastifyInstance } from 'fastify';
import { DiagramService } from '../services/DiagramService';
import { CreateDiagramSchema, CreateNetworkSchema, CreateStageSchema, AddPrecedenceSchema } from '../schemas';
import { DiagramDetail, NetworkItem, StageItem, PrecedenceItem, ErrorResponse, BuildingIdParam, DiagramIdParam, NetworkIdParam } from '../schemas/openapi';

export async function diagramRoutes(app: FastifyInstance): Promise<void> {
  const service = new DiagramService(app.ctx.db);

  // --- Diagrams ---

  app.get('/buildings/:buildingId/diagrams', {
    schema: {
      tags: ['Diagrams'],
      summary: 'Listar diagramas de um building',
      params: BuildingIdParam,
      response: { 200: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } }, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId } = request.params as { buildingId: string };
    const exists = app.ctx.db.prepare('SELECT id FROM buildings WHERE id = ?').get(buildingId);
    if (!exists) return reply.status(404).send({ error: 'Building not found' });

    return service.getAllFromDb(buildingId);
  });

  app.get('/buildings/:buildingId/diagrams/:diagramId', {
    schema: {
      tags: ['Diagrams'],
      summary: 'Obter um diagrama por ID (inclui networks, stages e precedences)',
      params: DiagramIdParam,
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            networks: { type: 'array', items: { type: 'object', additionalProperties: true } },
            precedences: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
        },
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { buildingId, diagramId } = request.params as { buildingId: string; diagramId: string };
    const exists = app.ctx.db.prepare('SELECT id FROM buildings WHERE id = ?').get(buildingId);
    if (!exists) return reply.status(404).send({ error: 'Building not found' });

    const diagram = service.getByIdFromDb(diagramId, buildingId);
    if (!diagram) return reply.status(404).send({ error: 'Diagram not found' });

    return diagram;
  });

  app.post('/buildings/:buildingId/diagrams', {
    schema: {
      tags: ['Diagrams'],
      summary: 'Criar um diagrama',
      params: BuildingIdParam,
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, example: 'Processo Principal' } },
      },
      response: { 201: DiagramDetail, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId } = request.params as { buildingId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const input = CreateDiagramSchema.parse(request.body);
    const diagram = service.create(building, input.name);

    return reply.status(201).send({
      id: diagram.id,
      name: diagram.name,
      networks: [],
      precedences: [],
    });
  });

  // --- Networks ---

  app.get('/buildings/:buildingId/diagrams/:diagramId/networks', {
    schema: {
      tags: ['Networks'],
      summary: 'Listar networks de um diagrama',
      params: DiagramIdParam,
      response: { 200: { type: 'array', items: NetworkItem }, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId, diagramId } = request.params as { buildingId: string; diagramId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const networks = service.getNetworks(building, diagramId);
    if (!networks) return reply.status(404).send({ error: 'Diagram not found' });

    return networks;
  });

  app.post('/buildings/:buildingId/diagrams/:diagramId/networks', {
    schema: {
      tags: ['Networks'],
      summary: 'Criar network em um diagrama',
      params: DiagramIdParam,
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, example: 'Rede Principal' } },
      },
      response: { 201: NetworkItem, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId, diagramId } = request.params as { buildingId: string; diagramId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const input = CreateNetworkSchema.parse(request.body);
    const network = service.addNetwork(building, diagramId, input.name);
    if (!network) return reply.status(404).send({ error: 'Diagram not found' });

    return reply.status(201).send({
      id: network.id,
      name: network.name,
      stages: [],
    });
  });

  // --- Stages (dentro de Network) ---

  app.post('/buildings/:buildingId/diagrams/:diagramId/networks/:networkId/stages', {
    schema: {
      tags: ['Networks'],
      summary: 'Adicionar stage a uma network',
      params: NetworkIdParam,
      body: {
        type: 'object',
        required: ['name', 'duration'],
        properties: {
          name: { type: 'string', minLength: 1, example: 'Estrutura' },
          duration: { type: 'number', minimum: 1, example: 12 },
          latency: { type: 'number', minimum: 0, default: 0, example: 0 },
        },
      },
      response: { 201: StageItem, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId, diagramId, networkId } = request.params as { buildingId: string; diagramId: string; networkId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const input = CreateStageSchema.parse(request.body);
    const stage = service.addStageToNetwork(building, diagramId, networkId, input.name, input.duration, input.latency);
    if (!stage) return reply.status(404).send({ error: 'Diagram or Network not found' });

    return reply.status(201).send({
      id: stage.id,
      name: stage.name,
      duration: stage.duration,
      latency: stage.latency,
    });
  });

  // --- Precedences ---

  app.post('/buildings/:buildingId/diagrams/:diagramId/precedences', {
    schema: {
      tags: ['Diagrams'],
      summary: 'Criar precedência entre dois stages do diagrama',
      description: 'Valida que ambos stages existem no diagrama, source ≠ destination, sem duplicatas e sem ciclos.',
      params: DiagramIdParam,
      body: {
        type: 'object',
        required: ['sourceStageId', 'destinationStageId'],
        properties: {
          sourceStageId: { type: 'string', description: 'ID do stage de origem' },
          destinationStageId: { type: 'string', description: 'ID do stage de destino' },
          opening: { type: 'number', default: 0, example: 0 },
          latency: { type: 'number', default: 0, example: 4 },
        },
      },
      response: { 201: PrecedenceItem, 400: ErrorResponse, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId, diagramId } = request.params as { buildingId: string; diagramId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const input = AddPrecedenceSchema.parse(request.body);
    const result = service.addPrecedence(building, diagramId, input.sourceStageId, input.destinationStageId, input.opening, input.latency);

    if ('error' in result) {
      if (result.error === 'Diagram not found') {
        return reply.status(404).send({ error: result.error });
      }
      return reply.status(400).send({ error: result.error });
    }

    return reply.status(201).send(result.precedence);
  });

  // --- Stage impact ---

  app.get('/buildings/:buildingId/diagrams/:diagramId/networks/:networkId/stages/:stageId/impact', {
    schema: {
      tags: ['Networks'],
      summary: 'Obter impacto de remoção de um stage (pacotes e equipes afetados)',
      params: {
        type: 'object',
        properties: {
          buildingId: { type: 'string', description: 'UUID do building' },
          diagramId: { type: 'string', description: 'UUID do diagrama' },
          networkId: { type: 'string', description: 'UUID da network' },
          stageId: { type: 'string', description: 'UUID do stage' },
        },
        required: ['buildingId', 'diagramId', 'networkId', 'stageId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            packageCount: { type: 'number' },
            teamCount: { type: 'number' },
          },
        },
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { buildingId, diagramId, networkId, stageId } = request.params as { buildingId: string; diagramId: string; networkId: string; stageId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const impact = service.stageImpact(building, diagramId, networkId, stageId);
    if (!impact) return reply.status(404).send({ error: 'Diagram, Network or Stage not found' });

    return impact;
  });

  // --- Delete stage ---

  app.delete('/buildings/:buildingId/diagrams/:diagramId/networks/:networkId/stages/:stageId', {
    schema: {
      tags: ['Networks'],
      summary: 'Remover um stage de uma network',
      params: {
        type: 'object',
        properties: {
          buildingId: { type: 'string', description: 'UUID do building' },
          diagramId: { type: 'string', description: 'UUID do diagrama' },
          networkId: { type: 'string', description: 'UUID da network' },
          stageId: { type: 'string', description: 'UUID do stage' },
        },
        required: ['buildingId', 'diagramId', 'networkId', 'stageId'],
      },
      response: { 204: { type: 'null' }, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId, diagramId, networkId, stageId } = request.params as { buildingId: string; diagramId: string; networkId: string; stageId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const removed = service.deleteStage(building, diagramId, networkId, stageId);
    if (!removed) return reply.status(404).send({ error: 'Diagram, Network or Stage not found' });

    return reply.status(204).send();
  });

  // --- Patch stage ---

  app.patch('/buildings/:buildingId/diagrams/:diagramId/networks/:networkId/stages/:stageId', {
    schema: {
      tags: ['Networks'],
      summary: 'Atualizar campos de um stage',
      params: {
        type: 'object',
        properties: {
          buildingId: { type: 'string', description: 'UUID do building' },
          diagramId: { type: 'string', description: 'UUID do diagrama' },
          networkId: { type: 'string', description: 'UUID da network' },
          stageId: { type: 'string', description: 'UUID do stage' },
        },
        required: ['buildingId', 'diagramId', 'networkId', 'stageId'],
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          duration: { type: 'number', minimum: 1 },
          latency: { type: 'number', minimum: 0 },
        },
      },
      response: { 200: StageItem, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId, diagramId, networkId, stageId } = request.params as { buildingId: string; diagramId: string; networkId: string; stageId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const fields = request.body as { name?: string; duration?: number; latency?: number };
    const updated = service.updateStage(building, diagramId, networkId, stageId, fields);
    if (!updated) return reply.status(404).send({ error: 'Diagram, Network or Stage not found' });

    return updated;
  });

  // --- Delete precedence ---

  app.delete('/buildings/:buildingId/diagrams/:diagramId/precedences/:precedenceId', {
    schema: {
      tags: ['Diagrams'],
      summary: 'Remover uma precedência de um diagrama',
      params: {
        type: 'object',
        properties: {
          buildingId: { type: 'string', description: 'UUID do building' },
          diagramId: { type: 'string', description: 'UUID do diagrama' },
          precedenceId: { type: 'string', description: 'UUID da precedência' },
        },
        required: ['buildingId', 'diagramId', 'precedenceId'],
      },
      response: { 204: { type: 'null' }, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId, diagramId, precedenceId } = request.params as { buildingId: string; diagramId: string; precedenceId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const removed = service.deletePrecedence(building, diagramId, precedenceId);
    if (!removed) return reply.status(404).send({ error: 'Diagram or Precedence not found' });

    return reply.status(204).send();
  });

  // --- Patch precedence ---

  app.patch('/buildings/:buildingId/diagrams/:diagramId/precedences/:precedenceId', {
    schema: {
      tags: ['Diagrams'],
      summary: 'Atualizar campos de uma precedência',
      params: {
        type: 'object',
        properties: {
          buildingId: { type: 'string', description: 'UUID do building' },
          diagramId: { type: 'string', description: 'UUID do diagrama' },
          precedenceId: { type: 'string', description: 'UUID da precedência' },
        },
        required: ['buildingId', 'diagramId', 'precedenceId'],
      },
      body: {
        type: 'object',
        properties: {
          opening: { type: 'number', minimum: 0 },
          latency: { type: 'number', minimum: 0 },
        },
      },
      response: { 200: PrecedenceItem, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId, diagramId, precedenceId } = request.params as { buildingId: string; diagramId: string; precedenceId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const fields = request.body as { opening?: number; latency?: number };
    const updated = service.updatePrecedence(building, diagramId, precedenceId, fields);
    if (!updated) return reply.status(404).send({ error: 'Diagram or Precedence not found' });

    return updated;
  });

  // --- Delete diagram ---

  app.delete('/buildings/:buildingId/diagrams/:diagramId', {
    schema: {
      tags: ['Diagrams'],
      summary: 'Remover um diagrama de um building',
      params: DiagramIdParam,
      response: { 204: { type: 'null' }, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { buildingId, diagramId } = request.params as { buildingId: string; diagramId: string };
    const building = app.ctx.getBuilding(buildingId, request.user.userId);
    if (!building) return reply.status(404).send({ error: 'Building not found' });

    const removed = service.deleteDiagram(building, diagramId);
    if (!removed) return reply.status(404).send({ error: 'Diagram not found' });

    return reply.status(204).send();
  });
}
