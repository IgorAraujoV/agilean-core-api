# CLAUDE.md — Server

Instruções para Claude Code ao trabalhar no backend Fastify.

## Visão Geral

Backend REST que orquestra o model de domínio em `agilean/`. Não contém lógica de negócio — apenas instancia classes do model, persiste no SQLite e expõe via HTTP.

## Comandos

```bash
npm run dev          # Servidor em modo watch (porta 3000)
npm run build        # Compilar TypeScript
npm test             # Rodar todos os testes (Jest)
npm test -- buildings.test   # Teste específico
npm run test:watch   # Watch mode
```

## Estrutura

```
src/
├── app.ts                  # buildApp() factory + JWT plugin + preHandler auth + error handler Zod
├── server.ts               # Entry point (listen 3000)
├── storage/
│   └── BuildingStorage.ts  # Cache in-memory (Map<id, Building> + userId tracking)
├── database/
│   ├── DatabaseService.ts  # openDatabase(): pragma WAL, executa schema.sql, seed + migrações
│   ├── schema.sql           # DDL completo: users, buildings, diagrams, networks, stages,
│   │                        # precedences, places, lines, teams, packages, links, building_users
│   ├── StructuralRepository.ts  # INSERT/UPDATE/DELETE para entidades estruturais
│   ├── LineRepository.ts        # Persistência de Line/Team
│   └── PackageRepository.ts     # Persistência de Package/Link
├── services/
│   ├── BuildingService.ts       # create(input, userId), list(userId), getById
│   ├── AuthService.ts           # verifyCredentials(email, password)
│   ├── DiagramService.ts        # Operações de Diagram/Network/Stage
│   ├── DiagramPropagationService.ts  # Snapshot → diff → persist changeset
│   ├── TypologyService.ts       # Place hierarchy
│   ├── LineService.ts           # Line operations
│   └── MovementEndpointService.ts   # Package movement
├── routes/
│   ├── auth.ts          # POST /auth/login  (pública — sem JWT)
│   ├── health.ts        # GET /health       (pública)
│   ├── buildings.ts     # POST/GET /buildings, /buildings/:id
│   ├── typologies.ts    # Place hierarchy endpoints
│   ├── diagrams.ts      # Diagram & Network CRUD
│   ├── lines.ts         # Line endpoints
│   └── movement.ts      # Package movement/scheduling
└── __tests__/
    ├── testHelpers.ts        # getAuthToken(app), authHeaders(token)
    ├── auth.test.ts
    ├── health.test.ts
    ├── buildings.test.ts
    ├── diagrams.test.ts
    ├── typologies.test.ts
    ├── lines.test.ts
    ├── movement.test.ts
    ├── BuildingStorage.test.ts
    ├── StructuralRepository.test.ts
    ├── UserRepository.test.ts
    ├── AuthService.test.ts
    └── Benchmark50k.test.ts
```

## Dual-Write Pattern

Cada entidade é salva em dois lugares simultaneamente:
1. **In-memory** (`BuildingStorage`) — para acesso rápido e domínio
2. **SQLite** (`StructuralRepository` etc.) — para persistência

```typescript
// Exemplo em BuildingService.create()
this.storage.save(building, userId);   // in-memory
this.repo.insertBuilding(building);    // SQLite
```

## Contexto compartilhado via decorator

```typescript
// app.ts
app.decorate('ctx', { storage, db });

// routes
const building = app.ctx.storage.get(buildingId);
const repo = new StructuralRepository(app.ctx.db);
```

`AppContext` em `app.ts` contém `storage: BuildingStorage` e `db: Database`.
Para adicionar novo contexto global, expandir `AppContext` em `app.ts`.

## Autenticação (JWT)

- `POST /auth/login` e `GET /health` são rotas **públicas**
- Todas as demais requerem `Authorization: Bearer <token>` via hook global `preHandler`
- Token gerado por `@fastify/jwt`, senha hasheada com `bcryptjs`
- Usuário master pré-seed: `master@master.com` / `12345`
- JWT secret: `process.env.JWT_SECRET ?? 'agilean-secret-2026'`
- Payload do token: `{ userId: string, email: string }`
- Acesso no handler: `request.user.userId`

## Relação Building ↔ Users

- **Many-to-many** via tabela junction `building_users (building_id, user_id)`
- Permite que uma obra seja atribuída a múltiplos usuários no futuro
- Atualmente apenas 1 usuário (master) — arquitetura já preparada
- `BuildingService.list(userId)` filtra via `building_users`
- `BuildingService.create(input, userId)` insere em `buildings` + `building_users`

## Padrão para novos endpoints

1. Criar Zod schema em `schemas/index.ts`
2. Criar ou atualizar service em `services/`
3. Criar route em `routes/` como Fastify plugin async
4. Registrar route em `app.ts` com `app.register()`
5. Escrever teste de integração em `__tests__/`

## Padrão dos testes

- Cada teste cria `const app = buildApp()` para instância isolada (`:memory:` DB)
- Usa `app.inject()` — sem servidor real
- **Todos os testes de rota** devem obter token no início:
  ```typescript
  import { getAuthToken, authHeaders } from './testHelpers';
  // dentro do teste:
  const token = await getAuthToken(app);
  // em cada inject:
  headers: authHeaders(token)
  ```
- `health.test.ts` **não precisa** de token (rota pública)
- `BuildingStorage.test.ts` e `StructuralRepository.test.ts` **não precisam** de token (não testam rotas HTTP)
- Helpers no topo do describe para criar resources pré-existentes (ex: `createBuilding(app, token)`)

## Error handling

- Erros de Zod → 400 com detalhes (automático via error handler global)
- Credenciais inválidas → 401 (tratado em `authRoutes`)
- JWT ausente/inválido → 401 (hook `preHandler` global)
- Entidade não encontrada → 404 manual na route
- Erros inesperados → 500 genérico

## TypeScript

- Strict mode com `noUncheckedIndexedAccess`
- Type augmentation do Fastify em `app.ts` (declare module 'fastify')
- Type augmentation do JWT em `app.ts` (declare module '@fastify/jwt')
- Usar `as` apenas para params do Fastify (`request.params as { buildingId: string }`)

## Banco de Dados (SQLite)

- Driver: `better-sqlite3` (síncrono, embutido)
- Arquivo: `server/data/agilean.db`
- `openDatabase(':memory:')` nos testes (DB fresco por teste)
- `DatabaseService.ts` executa `schema.sql`, depois roda migrações e seed do master user
- Migrações usam `PRAGMA table_info()` para verificar se coluna já existe antes de `ALTER TABLE`

## Dependência Local

O server depende de `agilean` via `file:../agilean`. Se o model mudar:

```bash
cd ../agilean && npm run build
cd ../server && npm test
```

## O que NÃO existe (ainda)

- Autenticação com múltiplos usuários (apenas master hardcoded)
- CORS configurado
- WebSocket / SSE
- Reload de buildings do SQLite na inicialização (storage começa vazio — buildings só existem se criados naquela sessão)

## Linguagem

Documentação e comentários em português. Código (variáveis, funções, testes) em inglês.
