# Résultats du bench

2026-10-17T14:45:51.188Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 7 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15 · baseline `main`

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 82 362 | 77 690 – 83 334 | 7 % | – | −0.1 % ≈ | 1 | 100 % | 82 416 | 39 |
| **sparkus-bun@main** | bun | 81 261 | 77 587 – 83 386 | 7 % | – | +30.3 % | 1 | 100 % | 81 258 | 37 |
| **sparkus-node** | node | 62 435 | 56 202 – 63 696 | 12 % | – | −0.9 % ≈ | 2 | 100 % | 62 239 | 65 |
| **sparkus-node@main** | node | 62 262 | 57 200 – 64 394 | 12 % | – |  | 2 | 101 % | 61 531 | 65 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 77 242 | 72 429 – 78 035 | 7 % | – | −0.4 % ≈ | 1 | 100 % | 76 914 | 40 |
| **sparkus-bun@main** | bun | 76 704 | 73 990 – 78 522 | 6 % | – | +30.5 % | 1 | 100 % | 76 695 | 38 |
| **sparkus-node** | node | 59 651 | 52 643 – 60 157 | 13 % | – | −0.4 % ≈ | 2 | 100 % | 59 824 | 74 |
| **sparkus-node@main** | node | 59 440 | 53 770 – 60 618 | 12 % | – |  | 2 | 100 % | 59 619 | 73 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@main** | bun | 67 706 | 62 512 – 68 656 | 9 % | – | +2.0 % ≈ | 2 | 101 % | 67 286 | 41 |
| **sparkus-bun** | bun | 66 707 | 62 550 – 67 770 | 8 % | – | +41.3 % | 2 | 101 % | 65 895 | 40 |
| **sparkus-node** | node | 47 485 | 41 962 – 48 106 | 13 % | – | +1.0 % ≈ | 3 | 100 % | 47 135 | 74 |
| **sparkus-node@main** | node | 46 467 | 42 397 – 47 786 | 12 % | – |  | 3 | 101 % | 46 181 | 74 |

## error-404 — GET on an unknown path (404 flood)

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@main** | bun | 76 998 | 71 216 – 77 190 | 8 % | – | +2.7 % | 1 | 100 % | 76 949 | 40 |
| **sparkus-bun** | bun | 74 720 | 70 854 – 75 245 | 6 % | – | +23.0 % | 2 | 100 % | 74 480 | 43 |
| **sparkus-node** | node | 60 752 | 53 808 – 61 885 | 13 % | – | +0.8 % ≈ | 2 | 100 % | 60 760 | 87 |
| **sparkus-node@main** | node | 60 163 | 55 421 – 62 032 | 11 % | – |  | 2 | 100 % | 60 541 | 87 |

## error-400 — POST /users with a body that fails validation (400/422 flood)

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@main** | bun | 60 259 | 56 554 – 61 738 | 9 % | – | +1.0 % ≈ | 2 | 101 % | 60 264 | 39 |
| **sparkus-bun** | bun | 59 837 | 56 003 – 61 251 | 9 % | – | +62.7 % | 2 | 101 % | 59 465 | 41 |
| **sparkus-node@main** | node | 37 174 | 33 360 – 37 898 | 12 % | – | +0.2 % ≈ | 3 | 100 % | 36 758 | 88 |
| **sparkus-node** | node | 37 014 | 32 565 – 38 115 | 15 % | – |  | 3 | 100 % | 37 132 | 88 |

## A/B : arbre de travail vs `main`

Ratio req/s (travail / baseline) round par round. Verdict **prouvé** si les 5+ rounds sont tous du même côté (test des signes, p ≤ 3 %). Même chose sur l'efficacité CPU (req par s CPU).

| Cible | Scénario | req/s : médiane (min – max) | verdict | req par s CPU : médiane (min – max) | verdict |
|---|---|---:|---|---:|---|
| sparkus-bun | hello | −0.1 % (−1.8 % – +4.3 %) | ≈ | +0.5 % (−2.1 % – +4.0 %) | ≈ |
| sparkus-bun | params-query | −0.4 % (−2.6 % – +5.5 %) | ≈ | −0.4 % (−3.2 % – +5.1 %) | ≈ |
| sparkus-bun | post-validate | −2.0 % (−2.3 % – +1.1 %) | ≈ | −1.4 % (−4.6 % – +0.5 %) | ≈ |
| sparkus-bun | error-404 | −2.7 % (−3.6 % – −0.5 %) | prouvé | −2.1 % (−4.2 % – −0.5 %) | prouvé |
| sparkus-bun | error-400 | −1.0 % (−2.8 % – +0.6 %) | ≈ | −1.5 % (−2.8 % – −0.3 %) | prouvé |
| sparkus-node | hello | −0.9 % (−2.6 % – +2.3 %) | ≈ | +1.3 % (−2.9 % – +3.2 %) | ≈ |
| sparkus-node | params-query | −0.4 % (−2.9 % – +3.0 %) | ≈ | −0.4 % (−3.8 % – +1.4 %) | ≈ |
| sparkus-node | post-validate | +1.0 % (−2.7 % – +5.2 %) | ≈ | +1.6 % (−2.0 % – +4.5 %) | ≈ |
| sparkus-node | error-404 | +0.8 % (−5.6 % – +2.9 %) | ≈ | −0.1 % (−4.7 % – +3.2 %) | ≈ |
| sparkus-node | error-400 | −0.2 % (−2.4 % – +4.4 %) | ≈ | +0.4 % (−2.3 % – +5.1 %) | ≈ |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-bun | 53 |
| sparkus-node | 89 |
| sparkus-bun@main | 52 |
| sparkus-node@main | 88 |

## Machine pendant la session

- Horloge effective : 111 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane 4 %, max 115 % d'un cœur.
- Autocannon : max 224 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).
