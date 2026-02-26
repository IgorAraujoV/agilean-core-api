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
│   ├── MovementEndpointService.ts   # Package movement
│   └── StackingEndpointService.ts   # Stack/unstack — snapshot all line pkgs → diff → persist
├── routes/
│   ├── auth.ts          # POST /auth/login  (pública — sem JWT)
│   ├── health.ts        # GET /health       (pública)
│   ├── buildings.ts     # POST/GET /buildings, /buildings/:id
│   ├── typologies.ts    # Place hierarchy endpoints
│   ├── diagrams.ts      # Diagram & Network CRUD
│   ├── lines.ts         # Line endpoints
│   ├── movement.ts      # Package movement/scheduling
│   └── stacking.ts      # Stack +1 / Unstack -1
└── __tests__/
    ├── testHelpers.ts        # getAuthToken(app), authHeaders(token)
    ├── auth.test.ts
    ├── health.test.ts
    ├── buildings.test.ts
    ├── diagrams.test.ts
    ├── typologies.test.ts
    ├── lines.test.ts
    ├── movement.test.ts
    ├── stacking.test.ts
    ├── restart.test.ts
    ├── BuildingStorage.test.ts
    ├── StructuralRepository.test.ts
    ├── UserRepository.test.ts
    ├── AuthService.test.ts
    ├── Benchmark50k.test.ts
    └── usecases/             # Testes de regressão baseados em cenários reais
        └── stacking-precedence-colado/
            ├── README.md                              # Descrição do bug e cenário
            └── stacking-precedence-colado.test.ts
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
- **Assertions usam valores hardcoded** — nunca calcular o esperado a partir de variáveis. Ex: `expect(row.start_col).toBe(1209)`, não `expect(row.start_col).toBe(X + D)`. Se não sabe o valor exato, rode o código antes para descobri-lo.

## Testes de use-case (regressão)

- Pasta: `__tests__/usecases/`
- Cada use-case é uma **pasta** com nome descritivo:
  ```
  usecases/
  └── stacking-precedence-colado/
      ├── README.md               # Descrição do bug, cenário, causa raiz e fix
      ├── stacking-precedence-colado.test.ts
      └── dados-cliente.json      # (opcional) dados reais do projeto do cliente
  ```
- `README.md` — descrição breve ou detalhada conforme complexidade do bug
- `dados-cliente.json` — (quando aplicável) arquivo com dados reais do cliente; o teste importa e usa para montar a base
- O teste monta toda a base via API com dados exatos do cenário
- Executa o movimento/operação que causou o erro
- Assert com valores hardcoded garante que o fix resolve na raiz
- Quando surgir um bug em projeto real, criar uma pasta aqui que reproduz exatamente o cenário

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

## Dependência Local (git submodule)

O server depende de `agilean` via git submodule (`"agilean": "file:./agilean"` em `package.json`).

```bash
# Após clonar o server pela primeira vez:
git submodule update --init
cd agilean && npm install && npm run build
cd .. && npm install

# Para atualizar o submodule quando o model mudar:
cd agilean && git pull origin <branch> && npm run build
cd .. && npm install && npm test
```

## O que NÃO existe (ainda)

- Autenticação com múltiplos usuários (apenas master hardcoded)
- CORS configurado
- WebSocket / SSE
- Reload de buildings do SQLite na inicialização (storage começa vazio — buildings só existem se criados naquela sessão)

## Linguagem

Documentação e comentários em português. Código (variáveis, funções, testes) em inglês.
