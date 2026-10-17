# Résultats du bench

2026-10-17T18:19:38.362Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 5 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 84 909 | 83 514 – 85 178 | 2 % | – | +0.5 % ≈ | 1 | 100 % | 84 070 | 38 |
| elysia | bun | 84 051 | 83 258 – 84 806 | 2 % | – | +29.7 % | 1 | 100 % | 83 785 | 46 |
| **sparkus-node** | node | 64 573 | 64 138 – 64 883 | 1 % | – | +15.6 % | 1 | 100 % | 64 139 | 66 |
| fastify | node | 55 824 | 54 410 – 56 746 | 4 % | – | +0.8 % ≈ | 2 | 101 % | 55 483 | 75 |
| nest-fastify | node | 55 574 | 53 706 – 56 547 | 5 % | – | +5.9 % | 2 | 100 % | 55 374 | 105 |
| **sparkus-prod-node** | node | 52 054 | 50 717 – 52 835 | 4 % | – |  | 2 | 101 % | 51 699 | 91 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 79 840 | 79 149 – 80 058 | 1 % | – | +0.6 % ≈ | 1 | 100 % | 79 475 | 39 |
| elysia | bun | 79 507 | 79 213 – 80 467 | 2 % | – | +28.3 % | 1 | 101 % | 78 737 | 47 |
| **sparkus-node** | node | 61 987 | 60 944 – 62 698 | 3 % | – | +16.6 % | 1 | 100 % | 61 794 | 74 |
| fastify | node | 53 162 | 52 432 – 54 774 | 4 % | – | +7.4 % | 2 | 100 % | 52 833 | 76 |
| **sparkus-prod-node** | node | 49 347 | 49 206 – 50 826 | 3 % | – | +6.1 % | 2 | 101 % | 48 947 | 118 |
| nest-fastify | node | 46 474 | 46 365 – 48 176 | 4 % | – |  | 2 | 100 % | 46 474 | 107 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 68 883 | 67 923 – 70 138 | 3 % | – | +5.3 % | 1 | 101 % | 68 459 | 40 |
| elysia | bun | 65 427 | 65 037 – 66 630 | 2 % | – | +33.0 % | 2 | 101 % | 64 814 | 55 |
| **sparkus-node** | node | 49 206 | 48 304 – 49 334 | 2 % | – | +24.4 % | 2 | 101 % | 48 896 | 75 |
| **sparkus-prod-node** | node | 39 446 | 38 832 – 39 798 | 2 % | – | −0.7 % ≈ | 3 | 100 % | 39 199 | 119 |
| fastify | node | 39 203 | 38 986 – 39 824 | 2 % | – | +104.1 % | 2 | 101 % | 38 864 | 92 |
| nest-fastify | node | 19 208 | 19 080 – 19 864 | 4 % | – |  | 12 | 112 % | 17 394 | 263 |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-bun | 50 |
| elysia | 72 |
| sparkus-node | 77 |
| fastify | 92 |
| nest-fastify | 264 |
| sparkus-prod-node | 121 |

## Machine pendant la session

- Horloge effective : 111 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane -9 %, max 135 % d'un cœur.
- Autocannon : max 203 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).
