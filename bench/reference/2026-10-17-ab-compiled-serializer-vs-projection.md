# Résultats du bench

2026-10-17T10:55:18.541Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 5 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15 · baseline `phase2/schema-filter`

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@phase2/schema-filter** | bun | 83 718 | 82 950 – 84 141 | 1 % | – | +3.3 % | 1 | 100 % | 83 554 | 37 |
| **sparkus-bun** | bun | 81 402 | 78 778 – 81 683 | 4 % | – | +26.7 % | 1 | 100 % | 80 667 | 37 |
| **sparkus-node** | node | 63 376 | 62 474 – 64 621 | 3 % | – | +0.6 % ≈ | 2 | 101 % | 63 038 | 65 |
| **sparkus-node@phase2/schema-filter** | node | 63 171 | 62 742 – 63 722 | 2 % | – |  | 2 | 101 % | 62 775 | 65 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@phase2/schema-filter** | bun | 79 085 | 78 406 – 79 597 | 2 % | – | +3.5 % | 1 | 100 % | 78 891 | 39 |
| **sparkus-bun** | bun | 76 358 | 75 808 – 76 602 | 1 % | – | +25.2 % | 1 | 100 % | 76 136 | 38 |
| **sparkus-node** | node | 60 874 | 58 218 – 61 712 | 6 % | – | −0.1 % ≈ | 2 | 100 % | 60 869 | 74 |
| **sparkus-node@phase2/schema-filter** | node | 60 304 | 59 203 – 61 763 | 4 % | – |  | 2 | 100 % | 60 303 | 74 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@phase2/schema-filter** | bun | 69 037 | 66 998 – 69 357 | 3 % | – | +1.6 % ≈ | 2 | 101 % | 68 506 | 39 |
| **sparkus-bun** | bun | 67 949 | 65 878 – 68 448 | 4 % | – | +40.4 % | 2 | 101 % | 67 587 | 39 |
| **sparkus-node** | node | 48 387 | 47 222 – 49 194 | 4 % | – | −0.3 % ≈ | 3 | 100 % | 48 101 | 74 |
| **sparkus-node@phase2/schema-filter** | node | 47 677 | 44 272 – 48 688 | 9 % | – |  | 3 | 100 % | 47 642 | 75 |

## list — GET /users, 10 records reduced to 4 of their 6 fields (Sparkus targets only)

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@phase2/schema-filter** | bun | 78 010 | 76 896 – 78 765 | 2 % | – | +14.5 % | 1 | 101 % | 77 290 | 39 |
| **sparkus-bun** | bun | 68 141 | 66 432 – 68 499 | 3 % | – | +20.9 % | 2 | 101 % | 67 644 | 40 |
| **sparkus-node** | node | 56 317 | 56 048 – 57 334 | 2 % | – | +0.6 % ≈ | 2 | 100 % | 56 490 | 88 |
| **sparkus-node@phase2/schema-filter** | node | 56 016 | 54 845 – 57 149 | 4 % | – |  | 2 | 100 % | 56 322 | 89 |

## A/B : arbre de travail vs `phase2/schema-filter`

Ratio req/s (travail / baseline) round par round. Verdict **prouvé** si les 5+ rounds sont tous du même côté (test des signes, p ≤ 3 %). Même chose sur l'efficacité CPU (req par s CPU).

| Cible | Scénario | req/s : médiane (min – max) | verdict | req par s CPU : médiane (min – max) | verdict |
|---|---|---:|---|---:|---|
| sparkus-bun | hello | −3.2 % (−6.0 % – −1.9 %) | prouvé | −3.2 % (−6.0 % – −0.6 %) | prouvé |
| sparkus-bun | params-query | −3.4 % (−4.8 % – −2.6 %) | prouvé | −3.5 % (−5.0 % – −2.3 %) | prouvé |
| sparkus-bun | post-validate | −1.6 % (−4.6 % – +2.2 %) | ≈ | −1.3 % (−4.9 % – +3.1 %) | ≈ |
| sparkus-bun | list | −12.7 % (−13.6 % – −12.2 %) | prouvé | −12.2 % (−14.1 % – −11.9 %) | prouvé |
| sparkus-node | hello | +0.6 % (−0.9 % – +2.3 %) | ≈ | +0.1 % (−0.6 % – +3.0 %) | ≈ |
| sparkus-node | params-query | −0.1 % (−1.7 % – +2.8 %) | ≈ | +1.2 % (−1.7 % – +2.5 %) | ≈ |
| sparkus-node | post-validate | −0.3 % (−1.0 % – +11.1 %) | ≈ | +0.3 % (−0.9 % – +13.2 %) | ≈ |
| sparkus-node | list | +0.6 % (−1.8 % – +2.2 %) | ≈ | +0.7 % (−1.8 % – +2.7 %) | ≈ |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-bun | 51 |
| sparkus-node | 89 |
| sparkus-bun@phase2/schema-filter | 50 |
| sparkus-node@phase2/schema-filter | 89 |

## Machine pendant la session

- Horloge effective : 115 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane -22 %, max 100 % d'un cœur.
- Autocannon : max 226 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).
