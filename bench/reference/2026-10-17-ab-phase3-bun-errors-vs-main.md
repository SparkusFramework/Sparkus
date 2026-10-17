# Résultats du bench

2026-10-17T14:53:36.118Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 7 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15 · baseline `main`

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@main** | bun | 68 022 | 66 515 – 69 421 | 4 % | – | +1.5 % ≈ | 2 | 100 % | 68 033 | 37 |
| **sparkus-bun** | bun | 67 283 | 66 403 – 68 474 | 3 % | – |  | 2 | 100 % | 67 072 | 39 |

## error-404 — GET on an unknown path (404 flood)

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 77 050 | 74 730 – 78 355 | 5 % | – | +1.1 % ≈ | 1 | 101 % | 75 704 | 41 |
| **sparkus-bun@main** | bun | 76 960 | 75 206 – 77 280 | 3 % | – |  | 1 | 101 % | 76 299 | 38 |

## error-400 — POST /users with a body that fails validation (400/422 flood)

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@main** | bun | 61 789 | 60 963 – 62 083 | 2 % | – | +1.0 % | 2 | 101 % | 61 401 | 39 |
| **sparkus-bun** | bun | 60 912 | 60 394 – 61 680 | 2 % | – |  | 2 | 100 % | 60 581 | 43 |

## A/B : arbre de travail vs `main`

Ratio req/s (travail / baseline) round par round. Verdict **prouvé** si les 5+ rounds sont tous du même côté (test des signes, p ≤ 3 %). Même chose sur l'efficacité CPU (req par s CPU).

| Cible | Scénario | req/s : médiane (min – max) | verdict | req par s CPU : médiane (min – max) | verdict |
|---|---|---:|---|---:|---|
| sparkus-bun | post-validate | −1.5 % (−2.2 % – +0.7 %) | ≈ | −1.1 % (−2.7 % – +0.3 %) | ≈ |
| sparkus-bun | error-404 | +1.1 % (−3.1 % – +2.1 %) | ≈ | +0.4 % (−3.1 % – +3.0 %) | ≈ |
| sparkus-bun | error-400 | −1.0 % (−2.5 % – −0.3 %) | prouvé | −1.3 % (−2.2 % – +1.0 %) | ≈ |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-bun | 52 |
| sparkus-bun@main | 51 |

## Machine pendant la session

- Horloge effective : 117 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane -18 %, max 47 % d'un cœur.
- Autocannon : max 214 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).
