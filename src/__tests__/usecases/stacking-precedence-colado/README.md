# Use-case: Desempilhar com precedência colada

## Problema

Ao desempilhar o stage A quando A→B estão ambos empilhados e colados (touching),
os pacotes de B não eram movidos no banco de dados nem retornados na response.

O frontend ficava com posições stale para B, mostrando sobreposição visual onde
na verdade os pacotes deveriam ter sido empurrados pra direita.

## Cenário

- 2 stages: A (dur=5, lat=0) e B (dur=5, lat=0)
- Precedência: A → B
- 3 pavimentos
- firstDate: 2024-01-01

### Estado inicial (sequencial)

```
A: [1204,1208]  [1209,1213]  [1214,1218]
B:              [1209,1213]  [1214,1218]  [1219,1223]
```

### Após empilhar A (+1) e B (+1)

```
A: [1204,1208]  [1209,1213]
   [1204,1208]
B:              [1209,1213]  [1214,1218]
                [1209,1213]
```

### Bug: desempilhar A (-1)

A se expande de volta ao layout sequencial. B precisa ser empurrado pra direita
para manter a precedência. O domínio fazia isso corretamente em memória, mas o
`StackingEndpointService` só fazia snapshot/diff do stage alvo (A), ignorando B.

## Causa raiz

`StackingEndpointService` usava `building.getTeamsByStage(stageId)` para snapshot/diff.
Pacotes de stages dependentes (via precedência) não eram capturados.

## Fix

Trocou `building.getTeamsByStage(stageId)` por `line.teams()` — agora faz snapshot
de **todos** os pacotes da line, capturando movimentos em stages dependentes.
