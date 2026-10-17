# Résultats du bench

2026-10-17T18:03:40.953Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 3 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bun-raw | bun | 85 306 | 83 949 – 85 344 | 2 % | 100 % | +1.0 % indicatif | 1 | 100 % | 85 033 | 32 |
| **sparkus-bun** | bun | 83 846 | 82 502 – 84 422 | 2 % | 99 % (97 % – 100 %) | −0.3 % ≈ | 1 | 100 % | 83 318 | 38 |
| elysia | bun | 83 232 | 82 400 – 84 717 | 3 % | 98 % (98 % – 99 %) | +5.2 % indicatif | 1 | 101 % | 82 976 | 47 |
| hono-bun | bun | 79 187 | 79 110 – 79 814 | 1 % | 93 % (93 % – 95 %) | +12.4 % indicatif | 1 | 101 % | 78 204 | 44 |
| **sparkus-prod-bun** | bun | 70 675 | 69 933 – 71 008 | 2 % | 83 % (82 % – 85 %) | +8.6 % indicatif | 2 | 100 % | 70 464 | 42 |
| node-raw | node | 64 912 | 64 765 – 65 085 | 0 % | 100 % | +2.0 % indicatif | 1 | 100 % | 64 710 | 64 |
| **sparkus-node** | node | 63 638 | 63 293 – 64 099 | 1 % | 98 % (97 % – 99 %) | +15.0 % indicatif | 1 | 101 % | 62 902 | 65 |
| fastify | node | 55 018 | 54 512 – 56 803 | 4 % | 85 % (84 % – 88 %) | +0.2 % ≈ | 2 | 101 % | 54 847 | 75 |
| hono-node | node | 54 902 | 54 390 – 55 318 | 2 % | 84 % (84 % – 85 %) | +1.1 % indicatif | 2 | 101 % | 54 056 | 80 |
| nest-fastify | node | 53 898 | 53 827 – 54 723 | 2 % | 83 % (83 % – 84 %) | +4.2 % indicatif | 2 | 100 % | 53 831 | 104 |
| **sparkus-prod-node** | node | 52 496 | 50 538 – 52 592 | 4 % | 81 % (78 % – 81 %) | +53.1 % indicatif | 2 | 102 % | 51 691 | 90 |
| express | node | 34 347 | 34 184 – 35 651 | 4 % | 53 % (53 % – 55 %) | +0.2 % ≈ | 4 | 101 % | 34 509 | 77 |
| fastify-logger | node | 34 288 | 32 424 – 34 499 | 6 % | 53 % (50 % – 53 %) | +26.7 % indicatif | 5 | 104 % | 32 646 | 237 |
| nest-express | node | 26 450 | 25 915 – 27 067 | 4 % | 41 % (40 % – 42 %) |  | 4 | 101 % | 26 206 | 110 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bun-raw | bun | 80 173 | 79 738 – 80 429 | 1 % | 100 % | +0.6 % indicatif | 1 | 100 % | 79 914 | 33 |
| **sparkus-bun** | bun | 79 686 | 78 931 – 79 981 | 1 % | 99 % (99 % – 99 %) | +0.1 % indicatif | 1 | 101 % | 78 692 | 40 |
| elysia | bun | 79 226 | 78 918 – 79 635 | 1 % | 99 % (99 % – 99 %) | +4.6 % indicatif | 1 | 102 % | 77 471 | 47 |
| hono-bun | bun | 75 603 | 75 565 – 75 731 | 0 % | 94 % (94 % – 95 %) | +11.6 % indicatif | 2 | 101 % | 74 808 | 46 |
| **sparkus-prod-bun** | bun | 67 757 | 65 786 – 67 770 | 3 % | 85 % (82 % – 85 %) | +8.1 % indicatif | 2 | 101 % | 66 737 | 42 |
| node-raw | node | 62 288 | 62 000 – 62 678 | 1 % | 100 % | +2.4 % indicatif | 1 | 100 % | 62 093 | 73 |
| **sparkus-node** | node | 60 848 | 60 784 – 61 187 | 1 % | 98 % (97 % – 99 %) | +14.7 % indicatif | 1 | 100 % | 61 045 | 73 |
| fastify | node | 53 040 | 52 189 – 54 806 | 5 % | 85 % (83 % – 88 %) | +1.6 % indicatif | 2 | 100 % | 53 038 | 76 |
| hono-node | node | 52 163 | 52 131 – 52 195 | 0 % | 84 % (83 % – 84 %) | +4.8 % indicatif | 2 | 100 % | 52 300 | 95 |
| **sparkus-prod-node** | node | 49 814 | 48 976 – 49 846 | 2 % | 80 % (79 % – 80 %) | +5.5 % indicatif | 2 | 100 % | 49 534 | 118 |
| nest-fastify | node | 46 787 | 46 422 – 47 235 | 2 % | 75 % (74 % – 76 %) | +40.1 % indicatif | 2 | 100 % | 46 784 | 106 |
| fastify-logger | node | 33 578 | 32 525 – 33 725 | 4 % | 54 % (52 % – 54 %) | +13.6 % indicatif | 4 | 104 % | 32 174 | 253 |
| express | node | 29 688 | 29 410 – 30 824 | 5 % | 48 % (47 % – 50 %) | +34.6 % indicatif | 4 | 101 % | 29 501 | 94 |
| nest-express | node | 22 155 | 22 056 – 22 555 | 2 % | 36 % (35 % – 36 %) |  | 5 | 102 % | 21 811 | 113 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bun-raw | bun | 73 171 | 72 326 – 73 965 | 2 % | 100 % | +6.2 % indicatif | 1 | 101 % | 72 483 | 34 |
| **sparkus-bun** | bun | 68 179 | 66 941 – 69 651 | 4 % | 94 % (91 % – 94 %) | +4.8 % indicatif | 1 | 101 % | 67 320 | 42 |
| elysia | bun | 66 054 | 65 069 – 66 077 | 2 % | 90 % (89 % – 90 %) | +8.2 % indicatif | 2 | 100 % | 65 428 | 50 |
| hono-bun | bun | 61 059 | 60 739 – 61 270 | 1 % | 83 % (83 % – 85 %) | +2.6 % indicatif | 2 | 101 % | 60 360 | 51 |
| **sparkus-prod-bun** | bun | 59 178 | 59 062 – 59 728 | 1 % | 81 % (81 % – 82 %) | +16.7 % indicatif | 2 | 102 % | 58 450 | 48 |
| node-raw | node | 50 698 | 49 981 – 51 382 | 3 % | 100 % | +5.9 % indicatif | 2 | 101 % | 50 388 | 88 |
| **sparkus-node** | node | 47 856 | 47 331 – 48 029 | 1 % | 94 % (93 % – 95 %) | +20.3 % indicatif | 2 | 101 % | 47 471 | 74 |
| fastify | node | 39 786 | 38 685 – 40 234 | 4 % | 78 % (75 % – 80 %) | +0.9 % indicatif | 3 | 100 % | 40 032 | 77 |
| **sparkus-prod-node** | node | 39 446 | 38 192 – 39 882 | 4 % | 78 % (74 % – 80 %) | +52.9 % indicatif | 3 | 100 % | 39 072 | 119 |
| fastify-logger | node | 25 794 | 25 429 – 26 472 | 4 % | 51 % (51 % – 52 %) | +18.4 % indicatif | 5 | 103 % | 25 011 | 269 |
| express | node | 21 880 | 21 784 – 21 982 | 1 % | 43 % (43 % – 44 %) | +13.1 % indicatif | 5 | 100 % | 21 812 | 99 |
| nest-fastify | node | 19 342 | 19 131 – 19 563 | 2 % | 38 % (38 % – 39 %) | +32.0 % indicatif | 12 | 109 % | 17 686 | 270 |
| hono-node | node | 14 815 | 14 234 – 14 930 | 5 % | 29 % (28 % – 30 %) | +4.3 % indicatif | 18 | 114 % | 12 779 | 272 |
| nest-express | node | 14 078 | 14 073 – 14 319 | 2 % | 28 % (28 % – 28 %) |  | 8 | 101 % | 14 120 | 118 |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| bun-raw | 47 |
| sparkus-bun | 50 |
| elysia | 71 |
| hono-bun | 60 |
| node-raw | 89 |
| sparkus-node | 76 |
| fastify | 85 |
| hono-node | 274 |
| express | 104 |
| nest-fastify | 271 |
| nest-express | 122 |
| sparkus-prod-bun | 53 |
| sparkus-prod-node | 121 |
| fastify-logger | 273 |

## Machine pendant la session

- Horloge effective : 110 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane -13 %, max 133 % d'un cœur.
- Autocannon : max 199 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).
