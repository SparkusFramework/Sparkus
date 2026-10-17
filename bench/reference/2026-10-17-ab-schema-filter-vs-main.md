# Résultats du bench

2026-10-17T10:41:04.563Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 5 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15 · baseline `main`

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@main** | bun | 78 509 | 67 952 – 78 854 | 14 % | – | +0.0 % ≈ | 1 | 100 % | 78 259 | 36 |
| **sparkus-bun** | bun | 77 626 | 76 218 – 79 110 | 4 % | – | +33.8 % | 1 | 100 % | 77 856 | 36 |
| **sparkus-node@main** | node | 59 139 | 53 456 – 60 093 | 11 % | – | +2.0 % ≈ | 2 | 101 % | 59 140 | 65 |
| **sparkus-node** | node | 57 898 | 56 650 – 58 890 | 4 % | – |  | 2 | 101 % | 57 798 | 65 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@main** | bun | 74 170 | 64 621 – 74 976 | 14 % | – | +0.7 % ≈ | 1 | 100 % | 74 428 | 37 |
| **sparkus-bun** | bun | 73 632 | 69 334 – 73 914 | 6 % | – | +29.7 % | 1 | 101 % | 73 003 | 38 |
| **sparkus-node@main** | node | 56 259 | 53 462 – 56 867 | 6 % | – | +1.0 % ≈ | 2 | 100 % | 56 090 | 72 |
| **sparkus-node** | node | 55 395 | 54 070 – 55 715 | 3 % | – |  | 2 | 100 % | 55 530 | 73 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-bun@main** | bun | 64 733 | 60 598 – 64 771 | 6 % | – | +1.2 % ≈ | 2 | 100 % | 63 758 | 39 |
| **sparkus-bun** | bun | 63 926 | 61 462 – 64 003 | 4 % | – | +45.3 % | 2 | 100 % | 63 921 | 42 |
| **sparkus-node@main** | node | 44 054 | 41 258 – 45 642 | 10 % | – | +1.0 % ≈ | 3 | 100 % | 43 919 | 73 |
| **sparkus-node** | node | 43 882 | 43 350 – 45 334 | 5 % | – |  | 3 | 100 % | 43 613 | 74 |

## A/B : arbre de travail vs `main`

Ratio req/s (travail / baseline) round par round. Verdict **prouvé** si les 5+ rounds sont tous du même côté (test des signes, p ≤ 3 %). Même chose sur l'efficacité CPU (req par s CPU).

| Cible | Scénario | req/s : médiane (min – max) | verdict | req par s CPU : médiane (min – max) | verdict |
|---|---|---:|---|---:|---|
| sparkus-bun | hello | −0.0 % (−1.3 % – +12.2 %) | ≈ | +0.3 % (−1.2 % – +10.8 %) | ≈ |
| sparkus-bun | params-query | −0.7 % (−4.3 % – +7.3 %) | ≈ | −1.0 % (−6.0 % – +7.7 %) | ≈ |
| sparkus-bun | post-validate | −1.1 % (−2.0 % – +1.4 %) | ≈ | −0.2 % (−0.7 % – +1.1 %) | ≈ |
| sparkus-node | hello | −2.0 % (−3.7 % – +6.0 %) | ≈ | −2.3 % (−3.4 % – +6.6 %) | ≈ |
| sparkus-node | params-query | −1.0 % (−4.4 % – +2.8 %) | ≈ | −1.0 % (−4.4 % – +3.4 %) | ≈ |
| sparkus-node | post-validate | −1.0 % (−3.9 % – +9.9 %) | ≈ | −1.5 % (−4.4 % – +9.9 %) | ≈ |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-bun | 50 |
| sparkus-node | 76 |
| sparkus-bun@main | 49 |
| sparkus-node@main | 75 |

## Machine pendant la session

- Horloge effective : 114 % – 117 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane 45 %, max 166 % d'un cœur.
- Autocannon : max 231 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).
- **1 mesure(s) bruitée(s)** (autres process > 150 % d'un cœur) : sparkus-node@main/params-query round 3 (166 %). Relancer sur une machine calme si elles comptent.
