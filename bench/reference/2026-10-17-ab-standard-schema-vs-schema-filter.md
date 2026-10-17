# Résultats du bench

2026-10-17T11:09:56.429Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 5 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15 · baseline `phase2/schema-filter`

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@phase2/schema-filter** | bun | 83 219 | 81 222 – 83 859 | 3 % | – | +0.2 % ≈ | 1 | 100 % | 83 217 | 36 |
| **sparkus-bun** | bun | 82 886 | 81 056 – 84 499 | 4 % | – | +31.9 % | 1 | 101 % | 82 371 | 36 |
| **sparkus-node** | node | 63 587 | 59 933 – 64 080 | 7 % | – | −0.4 % ≈ | 2 | 101 % | 63 095 | 65 |
| **sparkus-node@phase2/schema-filter** | node | 63 024 | 61 635 – 63 946 | 4 % | – |  | 2 | 100 % | 62 708 | 65 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun** | bun | 78 778 | 76 294 – 78 867 | 3 % | – | −0.5 % ≈ | 1 | 101 % | 78 128 | 38 |
| **sparkus-bun@phase2/schema-filter** | bun | 78 496 | 76 998 – 79 610 | 3 % | – | +31.4 % | 1 | 101 % | 77 798 | 38 |
| **sparkus-node** | node | 60 381 | 57 046 – 60 938 | 6 % | – | −1.1 % ≈ | 2 | 99 % | 60 755 | 74 |
| **sparkus-node@phase2/schema-filter** | node | 59 766 | 58 115 – 61 667 | 6 % | – |  | 2 | 99 % | 60 149 | 73 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@phase2/schema-filter** | bun | 68 576 | 66 538 – 69 613 | 4 % | – | +0.5 % ≈ | 2 | 100 % | 68 362 | 38 |
| **sparkus-bun** | bun | 68 026 | 66 342 – 69 664 | 5 % | – | +44.7 % | 2 | 100 % | 67 808 | 38 |
| **sparkus-node@phase2/schema-filter** | node | 47 216 | 46 557 – 47 645 | 2 % | – | +0.9 % | 3 | 100 % | 47 072 | 74 |
| **sparkus-node** | node | 46 883 | 45 955 – 46 922 | 2 % | – |  | 3 | 100 % | 46 740 | 75 |

## A/B : arbre de travail vs `phase2/schema-filter`

Ratio req/s (travail / baseline) round par round. Verdict **prouvé** si les 5+ rounds sont tous du même côté (test des signes, p ≤ 3 %). Même chose sur l'efficacité CPU (req par s CPU).

| Cible | Scénario | req/s : médiane (min – max) | verdict | req par s CPU : médiane (min – max) | verdict |
|---|---|---:|---|---:|---|
| sparkus-bun | hello | −0.2 % (−1.1 % – +1.5 %) | ≈ | +0.1 % (−1.4 % – +0.8 %) | ≈ |
| sparkus-bun | params-query | −0.5 % (−2.6 % – +1.3 %) | ≈ | +0.3 % (−2.5 % – +1.6 %) | ≈ |
| sparkus-bun | post-validate | −0.5 % (−2.6 % – +2.7 %) | ≈ | +0.8 % (−2.0 % – +3.4 %) | ≈ |
| sparkus-node | hello | −0.4 % (−4.1 % – +4.0 %) | ≈ | −1.0 % (−5.3 % – +3.3 %) | ≈ |
| sparkus-node | params-query | −1.1 % (−4.6 % – +4.9 %) | ≈ | −1.1 % (−4.6 % – +3.5 %) | ≈ |
| sparkus-node | post-validate | −0.9 % (−1.5 % – −0.7 %) | prouvé | −0.6 % (−0.9 % – −0.0 %) | prouvé |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-bun | 50 |
| sparkus-node | 77 |
| sparkus-bun@phase2/schema-filter | 50 |
| sparkus-node@phase2/schema-filter | 77 |

## Machine pendant la session

- Horloge effective : 115 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane -6 %, max 78 % d'un cœur.
- Autocannon : max 229 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).

## Relance de sparkus-node / post-validate (9 rounds)

| Cible | Scénario | req/s : médiane (min – max) | verdict | req par s CPU : médiane (min – max) | verdict |
|---|---|---:|---|---:|---|
| sparkus-node | post-validate | −1.1 % (−4.6 % – +3.6 %) | ≈ | −1.8 % (−4.6 % – +4.6 %) | ≈ |

Micro-bench du pipeline compilé (`micro/pipeline.js`, Node 24, builds A B A B, 9 rounds chacun) : `body valid` 90,8 / 89,1 ns (baseline) contre 90,7 / 88,4 ns (Standard Schema). Le code par requête du chemin `t` est inchangé ; le −0,9 % « prouvé » en 5 rounds ne se reproduit pas.
