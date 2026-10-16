# Sparkus bench

Harnais reproductible qui compare Sparkus à NestJS, Fastify, Express, Elysia et Hono, avec le serveur brut de chaque runtime comme plafond (100 %).

## Lancer

```bash
bun install
```

```bash
bun run bench
```

Options (après `bun run.ts`) : `--targets sparkus-bun,elysia`, `--scenarios hello,post-validate`, `--runs 3`, `--duration 10`, `--warmup 3`, `--connections 100`, `--workers 4`.

`NODE_BIN` choisit le binaire Node des cibles Node et d'autocannon (par défaut `node` du PATH).

Les résultats vont dans `results/` : un JSON brut par session et `latest.md` (tableaux).

## Méthode

- Chaque cible tourne **seule**, dans son propre process, sur un port neuf.
- Avant toute mesure, la cible est vérifiée contre le **contrat** (`scenarios.ts`) : statut, `content-type` JSON, corps identique, et refus d'un body invalide.
- Warm-up, puis mesure avec autocannon dans un **process séparé** (`--workers` pour qu'il ne soit pas le goulot).
- L'ordre des cibles est **mélangé à chaque run** ; on retient la **médiane** des runs.
- Mémoire : pic de RSS du process serveur sur toute la session.
- **Un seul bench à la fois par machine** : `run.ts` prend un verrou dans le dossier temporaire du système (partagé par tous les checkouts et worktrees) et attend s'il est pris. Un verrou laissé par un process mort est repris.

## Équité

Chaque framework est écrit **de façon idiomatique**, avec sa configuration recommandée :

| Cible | Validation | Particularités |
|---|---|---|
| `bun-raw`, `node-raw` | à la main | plafonds, sans framework |
| Sparkus | schéma compilé (`t.*`) | décorateurs TC39, `inject()`, paquet `sparkus` (v1) |
| `spike-bun`, `spike-node` | schéma compilé (`t.*`) | prototype de la phase 0, référence anti-régression (temporaire) |
| Elysia | TypeBox (`t.*`) | répond 422 sur body invalide |
| Hono | Zod (`@hono/zod-validator`) | |
| Fastify | JSON Schema (ajv) | schémas de réponse (fast-json-stringify) |
| Express 5 | Zod | réglages par défaut |
| NestJS (Express / Fastify) | class-validator + `ValidationPipe` | module + service injecté |

## Limites

- Sous Windows, le plafond mesuré est celui de la pile réseau Windows : **les chiffres publiables doivent venir de Linux**.
- Générateur de charge et serveur partagent la même machine.
- Sous Windows, le débit baisse au fil d'une session (jusqu'à −40 % pour les dernières cibles mesurées, probablement du throttling) : avec un seul run, le classement dépend de l'ordre de passage. Comparer deux cibles dans la même session, avec plusieurs runs.
