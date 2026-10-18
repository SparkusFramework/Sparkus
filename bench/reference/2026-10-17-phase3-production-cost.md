# Résultats du bench

2026-10-17T13:56:40.695Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 5 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 83 322 | 83 168 – 84 320 | 1 % | – | +29.8 % | 1 | 100 % | 83 291 | 39 |
| **sparkus-prod-bun** | bun | 64 560 | 63 715 – 64 960 | 2 % | – | +1.9 % | 2 | 101 % | 64 153 | 42 |
| **sparkus-node** | node | 63 030 | 62 518 – 64 419 | 3 % | – | +15.9 % | 2 | 101 % | 63 032 | 65 |
| fastify | node | 54 582 | 53 955 – 56 086 | 4 % | – | +12.4 % | 2 | 101 % | 54 237 | 75 |
| **sparkus-prod-node** | node | 48 528 | 47 037 – 49 661 | 5 % | – | +43.8 % | 3 | 101 % | 48 381 | 89 |
| fastify-logger | node | 33 557 | 33 349 – 36 234 | 9 % | – |  | 5 | 104 % | 32 045 | 239 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 78 842 | 78 227 – 79 917 | 2 % | – | +30.0 % | 1 | 101 % | 78 206 | 39 |
| **sparkus-node** | node | 60 534 | 59 651 – 61 469 | 3 % | – | −0.6 % ≈ | 2 | 100 % | 59 805 | 73 |
| **sparkus-prod-bun** | bun | 60 534 | 59 843 – 61 130 | 2 % | – | +15.3 % | 2 | 101 % | 59 816 | 41 |
| fastify | node | 52 509 | 51 901 – 53 354 | 3 % | – | +12.4 % | 2 | 100 % | 52 513 | 76 |
| **sparkus-prod-node** | node | 46 736 | 46 365 – 47 446 | 2 % | – | +42.6 % | 3 | 100 % | 46 399 | 116 |
| fastify-logger | node | 32 747 | 32 315 – 35 664 | 10 % | – |  | 5 | 104 % | 31 241 | 240 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 68 858 | 67 030 – 69 728 | 4 % | – | +25.0 % | 2 | 101 % | 67 819 | 42 |
| **sparkus-prod-bun** | bun | 54 960 | 54 672 – 55 069 | 1 % | – | +13.9 % | 2 | 102 % | 53 991 | 46 |
| **sparkus-node** | node | 48 234 | 47 005 – 48 605 | 3 % | – | +23.9 % | 3 | 101 % | 47 494 | 75 |
| fastify | node | 38 550 | 37 776 – 39 798 | 5 % | – | +5.6 % | 3 | 101 % | 38 246 | 77 |
| **sparkus-prod-node** | node | 36 195 | 35 758 – 37 456 | 5 % | – | +40.0 % | 3 | 100 % | 35 860 | 117 |
| fastify-logger | node | 25 826 | 25 128 – 27 608 | 10 % | – |  | 6 | 102 % | 25 348 | 270 |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-bun | 51 |
| sparkus-node | 77 |
| fastify | 85 |
| sparkus-prod-bun | 53 |
| sparkus-prod-node | 119 |
| fastify-logger | 270 |

## Machine pendant la session

- Horloge effective : 111 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane -17 %, max 78 % d'un cœur.
- Autocannon : max 220 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).
