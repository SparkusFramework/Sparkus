# Résultats du bench

2026-10-17T19:00:50.521Z · linux · 4 CPU logiques · Bun 1.4.3 · Node v24.21.0 · 3 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 2 thread(s) · sans épinglage

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hono-bun | bun | 53 373 | 50 435 – 55 235 | 9 % | 99 % (98 % – 110 %) | +3.7 % ≈ | 4 | 92 % | 57 895 | 49 |
| **sparkus-bun** | bun | 52 323 | 51 446 – 52 566 | 2 % | 102 % (95 % – 104 %) | +1.3 % ≈ | 4 | 92 % | 56 891 | 45 |
| elysia | bun | 51 613 | 51 318 – 51 914 | 1 % | 100 % (96 % – 103 %) | −0.4 % ≈ | 4 | 92 % | 56 108 | 49 |
| bun-raw | bun | 51 549 | 50 410 – 54 038 | 7 % | 100 % | +28.9 % indicatif | 4 | 92 % | 55 419 | 36 |
| **sparkus-prod-bun** | bun | 41 930 | 36 107 – 42 053 | 14 % | 78 % (70 % – 83 %) | +22.1 % indicatif | 5 | 95 % | 44 357 | 51 |
| **sparkus-node** | node | 33 707 | 33 643 – 34 448 | 2 % | 100 % (97 % – 119 %) | +0.1 % ≈ | 6 | 102 % | 33 178 | 84 |
| node-raw | node | 33 598 | 28 877 – 34 667 | 17 % | 100 % | +10.9 % ≈ | 6 | 102 % | 33 138 | 86 |
| fastify | node | 30 286 | 29 523 – 30 862 | 4 % | 90 % (89 % – 102 %) | +25.2 % indicatif | 6 | 102 % | 29 811 | 101 |
| **sparkus-prod-node** | node | 24 034 | 21 346 – 24 187 | 12 % | 72 % (62 % – 83 %) | +70.0 % indicatif | 7 | 102 % | 23 519 | 110 |
| fastify-logger | node | 14 226 | 13 908 – 14 511 | 4 % | 42 % (42 % – 48 %) | +19.2 % indicatif | 12 | 105 % | 13 575 | 228 |
| express | node | 11 670 | 10 534 – 12 393 | 16 % | 36 % (31 % – 40 %) |  | 14 | 102 % | 11 463 | 101 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hono-bun | bun | 53 384 | 52 976 – 57 706 | 9 % | 109 % (107 % – 115 %) | +9.5 % indicatif | 4 | 97 % | 54 614 | 51 |
| **sparkus-bun** | bun | 52 176 | 48 739 – 52 682 | 8 % | 105 % (97 % – 108 %) | −2.4 % ≈ | 4 | 94 % | 55 507 | 48 |
| elysia | bun | 51 005 | 49 942 – 53 443 | 7 % | 102 % (99 % – 110 %) | +2.0 % ≈ | 4 | 94 % | 54 607 | 51 |
| bun-raw | bun | 50 006 | 48 528 – 50 282 | 4 % | 100 % | +10.8 % indicatif | 4 | 94 % | 53 079 | 43 |
| **sparkus-prod-bun** | bun | 43 794 | 42 107 – 45 526 | 8 % | 90 % (84 % – 91 %) | +44.4 % indicatif | 5 | 99 % | 44 324 | 52 |
| **sparkus-node** | node | 30 006 | 28 741 – 30 328 | 5 % | 100 % (95 % – 114 %) | +0.4 % ≈ | 6 | 100 % | 29 947 | 93 |
| node-raw | node | 28 626 | 26 354 – 31 779 | 19 % | 100 % | +0.6 % ≈ | 7 | 100 % | 28 625 | 94 |
| fastify | node | 28 443 | 26 805 – 29 992 | 11 % | 99 % (94 % – 102 %) | +22.2 % indicatif | 6 | 100 % | 28 383 | 103 |
| **sparkus-prod-node** | node | 22 894 | 21 938 – 24 834 | 13 % | 83 % (72 % – 87 %) | +66.8 % indicatif | 7 | 100 % | 22 937 | 110 |
| fastify-logger | node | 13 826 | 13 729 – 14 294 | 4 % | 48 % (43 % – 54 %) | +28.3 % indicatif | 10 | 103 % | 13 398 | 242 |
| express | node | 11 138 | 10 425 – 11 594 | 11 % | 41 % (33 % – 42 %) |  | 14 | 101 % | 11 092 | 104 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bun-raw | bun | 54 301 | 54 230 – 54 736 | 1 % | 100 % | +5.8 % indicatif | 4 | 99 % | 55 408 | 42 |
| **sparkus-bun** | bun | 51 747 | 49 392 – 51 920 | 5 % | 95 % (91 % – 96 %) | +34.9 % indicatif | 4 | 99 % | 51 852 | 50 |
| **sparkus-prod-bun** | bun | 38 485 | 33 141 – 40 776 | 20 % | 71 % (61 % – 74 %) | +3.0 % ≈ | 6 | 100 % | 38 713 | 53 |
| elysia | bun | 37 963 | 37 349 – 39 370 | 5 % | 70 % (69 % – 72 %) | +14.2 % indicatif | 6 | 100 % | 37 896 | 56 |
| hono-bun | bun | 33 622 | 31 811 – 34 474 | 8 % | 62 % (59 % – 63 %) | +53.4 % indicatif | 6 | 101 % | 33 482 | 54 |
| node-raw | node | 20 987 | 20 021 – 22 475 | 12 % | 100 % | +10.5 % ≈ | 7 | 101 % | 20 859 | 97 |
| **sparkus-node** | node | 20 062 | 19 000 – 20 648 | 8 % | 91 % (89 % – 103 %) | +3.9 % ≈ | 8 | 101 % | 19 901 | 93 |
| fastify | node | 19 067 | 16 862 – 19 870 | 16 % | 91 % (75 % – 99 %) | +13.1 % ≈ | 9 | 101 % | 18 953 | 109 |
| **sparkus-prod-node** | node | 16 858 | 15 127 – 18 251 | 19 % | 80 % (76 % – 81 %) | +46.1 % indicatif | 8 | 101 % | 16 760 | 138 |
| fastify-logger | node | 10 655 | 9 975 – 11 542 | 15 % | 53 % (44 % – 55 %) | +15.8 % indicatif | 14 | 103 % | 10 343 | 249 |
| express | node | 9 199 | 8 656 – 9 311 | 7 % | 44 % (39 % – 46 %) |  | 18 | 101 % | 9 091 | 111 |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| bun-raw | 43 |
| sparkus-bun | 50 |
| elysia | 68 |
| hono-bun | 58 |
| node-raw | 97 |
| sparkus-node | 93 |
| fastify | 110 |
| express | 111 |
| sparkus-prod-bun | 54 |
| sparkus-prod-node | 138 |
| fastify-logger | 249 |

## Machine pendant la session

- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane -13 %, max 83 % d'un cœur.
- Autocannon : max 205 % d'un cœur (2 thread(s) : s'il approche 200 %, c'est lui le goulot).
