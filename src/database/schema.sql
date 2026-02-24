-- Tabelas estruturais (criadas uma vez, raramente alteradas)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buildings (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  first_date    TEXT NOT NULL,
  today         TEXT NOT NULL,
  today_enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS diagrams (
  id          TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS networks (
  id         TEXT PRIMARY KEY,
  diagram_id TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
  name       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stages (
  id         TEXT PRIMARY KEY,
  network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  duration   INTEGER NOT NULL,
  latency    INTEGER NOT NULL DEFAULT 0,
  direction  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS precedences (
  id              TEXT PRIMARY KEY,
  diagram_id      TEXT NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
  source_stage_id TEXT NOT NULL REFERENCES stages(id),
  dest_stage_id   TEXT NOT NULL REFERENCES stages(id),
  opening         INTEGER NOT NULL DEFAULT 0,
  latency         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS places (
  id          TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES places(id),
  name        TEXT NOT NULL,
  level       INTEGER NOT NULL,
  row_num     INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lines (
  id          TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  network_id  TEXT NOT NULL REFERENCES networks(id),
  diagram_id  TEXT NOT NULL REFERENCES diagrams(id),
  place_id    TEXT NOT NULL REFERENCES places(id),
  name        TEXT NOT NULL DEFAULT '',
  code        TEXT NOT NULL DEFAULT '',
  type        INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS teams (
  id         TEXT PRIMARY KEY,
  line_id    TEXT NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  stage_id   TEXT NOT NULL REFERENCES stages(id),
  network_id TEXT NOT NULL REFERENCES networks(id),
  direction  INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0
);

-- Tabela operacional (alta frequência de escrita)
-- Campos que mudam em MOVIMENTO: start_col, end_col
-- Campos que mudam em EXECUÇÃO: status, progress, execution_start, execution_end, estimated_end
-- Campos que mudam em CUSTO: cost, labor_cost
-- Campos imutáveis após criação: id, team_id, place_id, stage_id, type, code, name
CREATE TABLE IF NOT EXISTS packages (
  id               TEXT    PRIMARY KEY,
  team_id          TEXT    NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  place_id         TEXT    NOT NULL REFERENCES places(id),
  stage_id         TEXT    NOT NULL REFERENCES stages(id),
  -- Datas planejadas (em colunas — o que o algoritmo de movimento altera)
  start_col        INTEGER NOT NULL,
  end_col          INTEGER NOT NULL,
  -- Datas de execução (ISO strings, null = não iniciado/terminado)
  execution_start  TEXT,
  execution_end    TEXT,
  estimated_end    TEXT,
  -- Baseline para comparação (null = sem baseline)
  baseline_start   TEXT,
  baseline_end     TEXT,
  -- Status e progresso
  status           INTEGER NOT NULL DEFAULT 0,  -- 0=PLANNED, 1=STARTED, 2=DONE, 3=PAID
  progress         REAL    NOT NULL DEFAULT 0,  -- 0.0 a 100.0
  -- Custos
  cost             REAL    NOT NULL DEFAULT 0,
  labor_cost       REAL    NOT NULL DEFAULT 0,
  -- Identificação
  type             INTEGER NOT NULL DEFAULT 1,  -- 1=Package, 2=Split, 3=Extra
  code             TEXT    NOT NULL DEFAULT '',
  name             TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS links (
  id        TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  dest_id   TEXT NOT NULL REFERENCES packages(id),
  latency   INTEGER NOT NULL DEFAULT 0
);

-- Relação many-to-many: building pode ter múltiplos users (futuro)
-- Por ora apenas master@master.com é atribuído
CREATE TABLE IF NOT EXISTS building_users (
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (building_id, user_id)
);
