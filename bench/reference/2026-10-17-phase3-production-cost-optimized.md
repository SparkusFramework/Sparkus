# Résultats du bench

2026-10-17T14:14:39.394Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 5 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 83 027 | 82 246 – 83 654 | 2 % | – | +19.1 % | 1 | 101 % | 82 750 | 39 |
| **sparkus-prod-bun** | bun | 69 728 | 68 691 – 70 304 | 2 % | – | +11.1 % | 2 | 102 % | 68 854 | 41 |
| **sparkus-node** | node | 62 051 | 61 616 – 64 902 | 5 % | – | +24.8 % | 2 | 101 % | 61 283 | 65 |
| **sparkus-prod-node** | node | 50 320 | 49 296 – 50 890 | 3 % | – |  | 3 | 102 % | 49 545 | 91 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 78 803 | 77 523 – 79 635 | 3 % | – | +18.6 % | 1 | 101 % | 78 321 | 40 |
| **sparkus-prod-bun** | bun | 66 122 | 56 931 – 67 462 | 16 % | – | +11.6 % | 2 | 102 % | 65 096 | 42 |
| **sparkus-node** | node | 59 030 | 53 443 – 61 936 | 14 % | – | +24.1 % | 2 | 100 % | 58 906 | 73 |
| **sparkus-prod-node** | node | 48 182 | 47 434 – 48 592 | 2 % | – |  | 3 | 101 % | 48 071 | 118 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 68 640 | 55 389 – 69 203 | 20 % | – | +17.0 % | 2 | 101 % | 68 208 | 43 |
| **sparkus-prod-bun** | bun | 58 474 | 52 419 – 59 171 | 12 % | – | +25.9 % | 2 | 101 % | 58 287 | 43 |
| **sparkus-node** | node | 46 909 | 37 514 – 49 942 | 26 % | – | +27.2 % ≈ | 3 | 100 % | 46 484 | 74 |
| **sparkus-prod-node** | node | 37 904 | 36 426 – 38 915 | 7 % | – |  | 3 | 100 % | 37 789 | 120 |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-bun | 51 |
| sparkus-node | 76 |
| sparkus-prod-bun | 53 |
| sparkus-prod-node | 122 |

## Machine pendant la session

- Horloge effective : 115 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane -17 %, max 319 % d'un cœur.
- Autocannon : max 224 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).
- **4 mesure(s) bruitée(s)** (autres process > 150 % d'un cœur) : sparkus-bun/post-validate round 5 (319 %), sparkus-node/params-query round 5 (220 %), sparkus-node/post-validate round 5 (311 %), sparkus-prod-bun/params-query round 5 (218 %). Relancer sur une machine calme si elles comptent.
