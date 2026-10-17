# Résultats du bench

2026-10-17T13:39:53.544Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 7 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15 · baseline `main`

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@main** | bun | 79 238 | 76 474 – 83 629 | 9 % | – | +0.2 % ≈ | 1 | 100 % | 79 237 | 37 |
| **sparkus-bun** | bun | 78 726 | 78 368 – 83 398 | 6 % | – | +32.5 % | 1 | 100 % | 78 864 | 39 |
| **sparkus-node** | node | 59 210 | 57 648 – 65 213 | 13 % | – | +2.5 % ≈ | 2 | 101 % | 58 596 | 65 |
| **sparkus-node@main** | node | 58 141 | 55 382 – 63 920 | 15 % | – |  | 2 | 101 % | 57 773 | 65 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 74 336 | 72 659 – 79 533 | 9 % | – | +1.1 % ≈ | 2 | 100 % | 74 107 | 40 |
| **sparkus-bun@main** | bun | 74 144 | 71 213 – 79 674 | 11 % | – | +28.6 % | 1 | 101 % | 73 691 | 38 |
| **sparkus-node** | node | 57 059 | 54 858 – 61 437 | 12 % | – | −0.0 % ≈ | 2 | 100 % | 56 705 | 74 |
| **sparkus-node@main** | node | 56 106 | 54 915 – 61 667 | 12 % | – |  | 2 | 100 % | 56 458 | 72 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@main** | bun | 64 560 | 61 130 – 69 152 | 12 % | – | +1.4 % ≈ | 2 | 101 % | 64 794 | 39 |
| **sparkus-bun** | bun | 63 478 | 62 461 – 69 037 | 10 % | – | +44.1 % | 2 | 101 % | 62 931 | 43 |
| **sparkus-node@main** | node | 44 214 | 43 114 – 47 965 | 11 % | – | −0.1 % ≈ | 3 | 100 % | 44 357 | 73 |
| **sparkus-node** | node | 43 837 | 42 813 – 48 598 | 13 % | – |  | 3 | 100 % | 44 115 | 74 |

## A/B : arbre de travail vs `main`

Ratio req/s (travail / baseline) round par round. Verdict **prouvé** si les 5+ rounds sont tous du même côté (test des signes, p ≤ 3 %). Même chose sur l'efficacité CPU (req par s CPU).

| Cible | Scénario | req/s : médiane (min – max) | verdict | req par s CPU : médiane (min – max) | verdict |
|---|---|---:|---|---:|---|
| sparkus-bun | hello | −0.2 % (−1.0 % – +2.5 %) | ≈ | +0.5 % (−1.0 % – +1.6 %) | ≈ |
| sparkus-bun | params-query | +1.1 % (−2.0 % – +3.2 %) | ≈ | +2.0 % (−1.7 % – +2.9 %) | ≈ |
| sparkus-bun | post-validate | −1.4 % (−2.8 % – +3.6 %) | ≈ | −2.2 % (−2.9 % – +3.6 %) | ≈ |
| sparkus-node | hello | +2.5 % (−6.0 % – +4.1 %) | ≈ | +2.2 % (−6.2 % – +4.0 %) | ≈ |
| sparkus-node | params-query | −0.0 % (−1.6 % – +6.7 %) | ≈ | +0.4 % (−2.8 % – +6.4 %) | ≈ |
| sparkus-node | post-validate | +0.1 % (−3.7 % – +1.7 %) | ≈ | +1.1 % (−4.0 % – +3.0 %) | ≈ |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-bun | 51 |
| sparkus-node | 77 |
| sparkus-bun@main | 50 |
| sparkus-node@main | 75 |

## Machine pendant la session

- Horloge effective : 114 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane 17 %, max 136 % d'un cœur.
- Autocannon : max 223 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).
