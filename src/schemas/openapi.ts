// Schemas JSON reutilizáveis para documentação OpenAPI (Swagger)

export const BuildingSummary = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    diagramCount: { type: 'number' },
    placeCount: { type: 'number' },
    firstDate: { type: 'string', format: 'date-time' },
    today: { type: 'string', format: 'date-time' },
    todayEnabled: { type: 'boolean' },
  },
} as const;

export const PlaceNode = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    level: { type: 'number', description: '0=Unit, 1=Local, 2=SubLocal, 3=Ambient' },
    children: { type: 'array', items: { type: 'object' } },
  },
} as const;

export const StageItem = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    duration: { type: 'number' },
    latency: { type: 'number' },
  },
} as const;

export const PrecedenceItem = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    sourceStageId: { type: 'string' },
    destinationStageId: { type: 'string' },
    opening: { type: 'number' },
    latency: { type: 'number' },
  },
} as const;

export const NetworkItem = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    stages: { type: 'array', items: StageItem },
  },
} as const;

export const DiagramDetail = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    networks: { type: 'array', items: NetworkItem },
    precedences: { type: 'array', items: PrecedenceItem },
  },
} as const;

export const ErrorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
} as const;

export const BuildingIdParam = {
  type: 'object',
  properties: {
    buildingId: { type: 'string', description: 'UUID do building' },
  },
  required: ['buildingId'],
} as const;

export const DiagramIdParam = {
  type: 'object',
  properties: {
    buildingId: { type: 'string', description: 'UUID do building' },
    diagramId: { type: 'string', description: 'UUID do diagrama' },
  },
  required: ['buildingId', 'diagramId'],
} as const;

export const NetworkIdParam = {
  type: 'object',
  properties: {
    buildingId: { type: 'string', description: 'UUID do building' },
    diagramId: { type: 'string', description: 'UUID do diagrama' },
    networkId: { type: 'string', description: 'UUID da network' },
  },
  required: ['buildingId', 'diagramId', 'networkId'],
} as const;
