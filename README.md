# Agilean Server

Backend REST API para o sistema Agilean, construído com Fastify + TypeScript. Orquestra o model de domínio existente em `agilean/` sem duplicar lógica de negócio.

## Tecnologias

| Tecnologia | Versão | Propósito |
|---|---|---|
| **Node.js** | 20+ | Runtime |
| **TypeScript** | ^5.7 | Tipagem estática (strict mode) |
| **Fastify** | ^5.2 | Framework HTTP (performance + simplicidade) |
| **Zod** | ^3.24 | Validação de payloads com inferência de tipos |
| **better-sqlite3** | ^9.x | Persistência SQLite (síncrono, single-file) |
| **Jest** | ^29.7 | Testes (via ts-jest) |
| **tsx** | ^4.19 | Dev server com hot reload |

## Setup

```bash
# 1. Compilar o model (necessário para a dependência local)
cd ../agilean && npm run build

# 2. Instalar dependências do server
cd ../server && npm install
```

## Comandos

```bash
npm run dev          # Inicia servidor em modo watch (porta 3000)
npm run build        # Compila TypeScript para dist/
npm start            # Executa versão compilada (dist/server.js)
npm test             # Roda todos os testes
npm run test:watch   # Testes em modo watch
```

## Arquitetura

```
src/
├── app.ts               # Factory do Fastify (buildApp) + registro de plugins
├── server.ts            # Entry point (listen na porta 3000)
├── storage/
│   └── BuildingStorage.ts     # Map<string, Building> em memória (estado de runtime)
├── database/
│   ├── schema.sql             # Esquema SQLite (criado automaticamente)
│   ├── DatabaseService.ts     # Abre conexão SQLite (WAL + FK)
│   ├── StructuralRepository.ts # INSERT para buildings, diagrams, stages, places, precedences
│   ├── LineRepository.ts      # INSERT/UPDATE para lines, teams, packages, links
│   └── PackageRepository.ts   # UPDATE bulk para packages (movimento em cascata)
├── services/
│   ├── BuildingService.ts     # CRUD de Building
│   ├── TypologyService.ts     # Criação de Units e Places
│   ├── DiagramService.ts      # Criação de Diagrams, Stages e Precedences
│   ├── LineService.ts         # Criação de Lines e leitura de Packages
│   └── MovementEndpointService.ts # Movimentação de Package com persistência do patch
├── routes/
│   ├── health.ts              # GET /health
│   ├── buildings.ts           # CRUD /buildings
│   ├── typologies.ts          # /buildings/:id/typologies
│   ├── diagrams.ts            # /buildings/:id/diagrams
│   ├── lines.ts               # /buildings/:id/lines + packages
│   └── movement.ts            # POST /buildings/:id/packages/:pkgId/move
├── schemas/
│   └── index.ts               # Schemas Zod exportados
└── __tests__/                 # Testes de integração + benchmark
```

### Duas camadas de estado

O server mantém **dois estados em paralelo**:

| Camada | Tecnologia | Para que serve |
|--------|-----------|----------------|
| **Runtime** | `BuildingStorage` (`Map<string, Building>`) | Operações em memória — o model de domínio roda aqui |
| **Persistência** | SQLite (`data/agilean.db`) | Dados sobrevivem ao restart do servidor |

Toda operação que muta estado faz as duas coisas: chama o método do model (em memória) e persiste no SQLite via repositório. **Leitura** usa sempre o model em memória (mais rápido).

> **Nota:** ao reiniciar o servidor, o estado em memória é perdido. A recarga do SQLite para `BuildingStorage` ainda não está implementada — as operações existentes se baseiam no assumption de que o servidor não reinicia em produção (MVP). Isso será resolvido quando houver necessidade.

### Fluxo de uma request mutante

```
POST /buildings/:id/lines
         │
    Route (lines.ts)
         │ extrai params + body
    Zod validation
         │ 400 se inválido
    LineService.create()
         ├── building.createLine(...)    ← model em memória
         └── LineRepository.insertAll() ← SQLite
         │
    Response 201 { id, packageCount }
```

### Contexto compartilhado

`buildApp()` injeta `ctx: { storage, db }` em todas as routes via `app.decorate()`:

```typescript
// app.ts
app.decorate('ctx', { storage: new BuildingStorage(), db: openDatabase(opts.dbPath) });

// qualquer route
const building = app.ctx.storage.get(buildingId);
const repo = new LineRepository(app.ctx.db);
```

### Error handler global

Erros de Zod e de validação do Fastify retornam 400 com detalhes. Outros erros retornam 500:

```json
{
  "error": "Validation error",
  "details": [{ "code": "too_small", "path": ["name"], "message": "..." }]
}
```

---

## Endpoints

### Swagger UI

Documentação interativa disponível em `http://localhost:3000/docs` quando o servidor está rodando.

### Health

| Method | Path | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check — retorna `{ "status": "ok" }` |

### Buildings

| Method | Path | Descrição |
|--------|------|-----------|
| POST | `/buildings` | Cria um building |
| GET | `/buildings` | Lista todos os buildings |
| GET | `/buildings/:buildingId` | Retorna um building específico |

**POST /buildings** — Body:
```json
{ "name": "Edifício A", "firstDate": "2024-01-01" }
```

**Response (201):**
```json
{ "id": "uuid", "name": "Edifício A", "diagramCount": 0, "placeCount": 0 }
```

### Typologies (Places)

| Method | Path | Descrição |
|--------|------|-----------|
| GET | `/buildings/:buildingId/typologies` | Lista unidades (árvore com filhos) |
| POST | `/buildings/:buildingId/typologies` | Cria unit ou filho |

**POST — Criar unit** (sem parentId):
```json
{ "name": "Bloco A" }
```

**POST — Criar filho** (com parentId):
```json
{ "name": "Pavimento 1", "parentId": "uuid-da-unit" }
```

**GET — Resposta (árvore recursiva):**
```json
[{
  "id": "uuid",
  "name": "Bloco A",
  "level": 0,
  "children": [{
    "id": "uuid",
    "name": "Pavimento 1",
    "level": 1,
    "children": []
  }]
}]
```

### Diagrams

| Method | Path | Descrição |
|--------|------|-----------|
| GET | `/buildings/:buildingId/diagrams` | Lista diagramas |
| GET | `/buildings/:buildingId/diagrams/:diagramId` | Detalhe do diagrama (com stages e precedências) |
| POST | `/buildings/:buildingId/diagrams` | Cria diagrama |
| POST | `/buildings/:buildingId/diagrams/:diagramId/stages` | Adiciona stage |
| POST | `/buildings/:buildingId/diagrams/:diagramId/precedences` | Adiciona precedência entre stages |

**POST /stages** — Body:
```json
{ "name": "Estrutura", "duration": 12, "latency": 0 }
```

**GET /diagrams/:id — Response:**
```json
{
  "id": "uuid",
  "name": "Processo Principal",
  "stages": [{ "id": "uuid", "name": "Estrutura", "duration": 12, "latency": 0 }],
  "precedences": [{ "sourceId": "uuid", "destId": "uuid", "opening": 0, "latency": 0 }]
}
```

### Lines

| Method | Path | Descrição |
|--------|------|-----------|
| POST | `/buildings/:buildingId/lines` | Cria uma Line (Network + Unit → gera Teams e Packages) |
| GET | `/buildings/:buildingId/lines` | Lista lines do building |
| GET | `/buildings/:buildingId/lines/:lineId/packages` | Lista packages com datas, status e progresso |

**POST /lines** — Body:
```json
{ "networkId": "uuid-da-network", "placeId": "uuid-da-unit" }
```

**Response (201):**
```json
{ "id": "uuid-da-line", "packageCount": 150 }
```

**GET /packages — Response (por package):**
```json
{
  "id": "uuid",
  "placeId": "uuid",
  "stageId": "uuid",
  "startCol": 10,
  "endCol": 22,
  "startDate": "2024-01-15T08:00:00.000Z",
  "endDate": "2024-02-05T08:00:00.000Z",
  "plannedStartDate": "2024-01-15T08:00:00.000Z",
  "plannedEndDate": "2024-02-05T08:00:00.000Z",
  "executionStart": null,
  "executionEnd": null,
  "estimatedEnd": null,
  "status": 0,
  "progress": 0,
  "cost": 0
}
```

### Movement

| Method | Path | Descrição |
|--------|------|-----------|
| POST | `/buildings/:buildingId/packages/:packageId/move` | Move package — retorna patch com todos os packages alterados |

**Body (por data ou por coluna):**
```json
{ "date": "2024-03-01T08:00:00.000Z" }
```
```json
{ "column": 45 }
```

**Response (200) — patch:**
```json
{
  "movedCount": 12,
  "packages": [
    {
      "id": "uuid",
      "startCol": 45,
      "endCol": 57,
      "startDate": "2024-03-01T08:00:00.000Z",
      "endDate": "2024-03-20T08:00:00.000Z"
    }
  ]
}
```

O response retorna **apenas os packages que mudaram de posição** (patch), não todos os packages. O front-end aplica o patch no estado local.

---

## Testes

Os testes são de **integração** — usam `app.inject()` do Fastify para simular requests HTTP sem subir servidor real. O SQLite usa `:memory:` (default) para isolamento total entre testes.

```bash
npm test                                        # Todos os testes
npm test -- buildings.test                      # Apenas buildings
npm test -- --testNamePattern="should create"   # Por nome
npm test -- --testPathPattern=Benchmark50k      # Benchmark de performance
```

### Contagem de testes

| Arquivo | Testes | O que cobre |
|---------|--------|-------------|
| `health.test.ts` | 1 | Health check |
| `BuildingStorage.test.ts` | 4 | CRUD do storage em memória |
| `StructuralRepository.test.ts` | 5 | INSERTs no SQLite |
| `buildings.test.ts` | 5 | CRUD + validação 400 |
| `typologies.test.ts` | 4 | Units + children + árvore |
| `diagrams.test.ts` | 15 | Diagrams + stages + precedências |
| `lines.test.ts` | 5 | Lines + packages |
| `movement.test.ts` | 3 | Move por data e coluna + 404 |
| `Benchmark50k.test.ts` | 2 | Performance 50k packages (não conta no CI normal) |

**Total: 42 testes de integração + 2 benchmark**

### Padrão dos testes

Cada teste cria uma instância isolada do app via `buildApp()` — sem estado compartilhado:

```typescript
it('should create a line', async () => {
  const app = buildApp();  // app fresco, storage vazio, SQLite :memory:

  const buildingId = await createBuilding(app);   // helper
  const diagramId = await createDiagram(app, buildingId);
  const stageId = await createStage(app, buildingId, diagramId);
  const networkId = await getNetworkId(app, buildingId, diagramId);
  const placeId = await createUnit(app, buildingId);
  await createChild(app, buildingId, placeId);

  const res = await app.inject({
    method: 'POST',
    url: `/buildings/${buildingId}/lines`,
    payload: { networkId, placeId },
  });

  expect(res.statusCode).toBe(201);
  expect(res.json().packageCount).toBe(1);
});
```

---

## Como adicionar um novo endpoint

Siga o padrão existente em 4 passos:

### 1. Adicionar método no Service

```typescript
// src/services/MyService.ts
export class MyService {
  constructor(private storage: BuildingStorage, private db: Database) {}

  doSomething(buildingId: string, ...): ResultType | null {
    const building = this.storage.get(buildingId);
    if (!building) return null;

    // 1. Chamar o model de domínio (agilean)
    const result = building.someMethod(...);

    // 2. Persistir se necessário
    // new MyRepository(this.db).insert(result);

    return result;
  }
}
```

### 2. Adicionar repositório (se persistir dados)

```typescript
// src/database/MyRepository.ts
export class MyRepository {
  constructor(private db: Database) {}

  insert(entity: MyEntity): void {
    this.db.prepare(`INSERT INTO my_table (...) VALUES (...)`).run({ ... });
  }
}
```

Se o schema precisar de nova tabela, edite `src/database/schema.sql`. O `CREATE TABLE IF NOT EXISTS` garante que a tabela seja criada automaticamente na próxima conexão.

### 3. Criar a route

```typescript
// src/routes/myRoutes.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MyService } from '../services/MyService';

const InputSchema = z.object({ name: z.string().min(1) });

export async function myRoutes(app: FastifyInstance): Promise<void> {
  const service = new MyService(app.ctx.storage, app.ctx.db);

  app.post('/buildings/:buildingId/my-resource', {
    schema: {
      tags: ['MyTag'],
      summary: 'Descrição para o Swagger',
      // ... params, body, response shapes
    },
  }, async (request, reply) => {
    const { buildingId } = request.params as { buildingId: string };
    const input = InputSchema.parse(request.body);
    const result = service.doSomething(buildingId, input.name);
    if (!result) return reply.status(404).send({ error: 'Not found' });
    return reply.status(201).send(result);
  });
}
```

### 4. Registrar em app.ts

```typescript
// src/app.ts
import { myRoutes } from './routes/myRoutes';

// dentro de buildApp():
app.register(myRoutes);
```

### 5. Escrever o teste

```typescript
// src/__tests__/myRoutes.test.ts
import { buildApp } from '../app';

it('should do something', async () => {
  const app = buildApp();  // sempre buildApp() sem args → SQLite :memory:
  const buildingId = await createBuilding(app);

  const res = await app.inject({
    method: 'POST',
    url: `/buildings/${buildingId}/my-resource`,
    payload: { name: 'Test' },
  });

  expect(res.statusCode).toBe(201);
});
```

---

## Banco de dados

O SQLite é inicializado automaticamente via `openDatabase(dbPath)`:

- Em **dev/produção** (`npm run dev` / `npm start`): `data/agilean.db` (criado se não existir)
- Em **testes** (`buildApp()` sem args): `:memory:` — descartado ao fim de cada teste

O schema está em `src/database/schema.sql` e é executado a cada conexão com `CREATE TABLE IF NOT EXISTS`.

### Tabelas principais

| Tabela | Propósito |
|--------|-----------|
| `buildings` | Building com firstDate e today |
| `diagrams` / `networks` / `stages` / `precedences` | Rede de precedências |
| `places` | Hierarquia de tipologia (pai/filho via `parent_id`) |
| `lines` / `teams` | Line of Balance |
| `packages` | Packages com posição (`start_col`, `end_col`), status e progresso |
| `links` | Dependências entre packages |

---

## Decisões Técnicas

- **SQLite com WAL mode** — escrita síncrona, reads concorrentes. Adequado para MVP e desenvolvimento. Para multi-tenant com > 10 usuários simultâneos, migrar para PostgreSQL.
- **Estado em memória (`BuildingStorage`)** — o model de domínio vive na RAM. Reload do SQLite para memória ao reiniciar ainda não implementado.
- **Sem autenticação** — Backend mínimo para desenvolvimento.
- **Sem WebSocket/SSE** — Apenas REST síncrono.
- **Zod para validação** — Schemas definem tipos e validação em um lugar só.
- **Services finos** — Apenas orquestram chamadas ao model, sem lógica própria.
- **Swagger automático** — `@fastify/swagger` + `@fastify/swagger-ui` geram `/docs` a partir dos schemas JSON das routes.
