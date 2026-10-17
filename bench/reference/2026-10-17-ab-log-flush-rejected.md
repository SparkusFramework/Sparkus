# Résultats du bench

2026-10-17T19:16:58.835Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 5 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15 · baseline `HEAD~1`

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-logs-bun@HEAD~1** | bun | 73 248 | 68 448 – 74 157 | 8 % | – | +0.5 % ≈ | 2 | 101 % | 72 649 | 41 |
| **sparkus-logs-bun** | bun | 72 890 | 68 346 – 74 349 | 8 % | – | +6.3 % | 2 | 101 % | 72 362 | 41 |
| **sparkus-prod-bun** | bun | 68 717 | 63 114 – 69 293 | 9 % | – | −0.8 % ≈ | 2 | 101 % | 68 079 | 42 |
| **sparkus-prod-bun@HEAD~1** | bun | 66 378 | 65 030 – 69 421 | 7 % | – | +26.4 % | 2 | 100 % | 66 585 | 42 |
| **sparkus-logs-node@HEAD~1** | node | 54 346 | 50 192 – 55 024 | 9 % | – | +0.5 % ≈ | 2 | 101 % | 53 667 | 90 |
| **sparkus-logs-node** | node | 54 275 | 50 448 – 55 517 | 9 % | – | +8.4 % | 2 | 101 % | 53 771 | 115 |
| **sparkus-prod-node** | node | 50 083 | 46 211 – 51 869 | 11 % | – | +0.4 % ≈ | 3 | 101 % | 49 622 | 116 |
| **sparkus-prod-node@HEAD~1** | node | 49 360 | 46 019 – 51 165 | 10 % | – |  | 3 | 100 % | 48 968 | 89 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-logs-bun@HEAD~1** | bun | 69 984 | 63 818 – 70 598 | 10 % | – | −0.3 % ≈ | 2 | 101 % | 69 082 | 42 |
| **sparkus-logs-bun** | bun | 69 818 | 65 264 – 70 330 | 7 % | – | +6.3 % | 2 | 101 % | 69 504 | 42 |
| **sparkus-prod-bun@HEAD~1** | bun | 65 558 | 61 501 – 66 016 | 7 % | – | +1.1 % ≈ | 2 | 101 % | 64 863 | 42 |
| **sparkus-prod-bun** | bun | 65 290 | 59 312 – 65 466 | 9 % | – | +24.9 % | 2 | 100 % | 64 309 | 43 |
| **sparkus-logs-node** | node | 52 240 | 48 067 – 52 502 | 8 % | – | −1.4 % ≈ | 2 | 100 % | 52 091 | 116 |
| **sparkus-logs-node@HEAD~1** | node | 51 818 | 47 197 – 53 514 | 12 % | – | +11.7 % ≈ | 2 | 100 % | 51 658 | 115 |
| **sparkus-prod-node** | node | 47 715 | 44 618 – 49 789 | 11 % | – | +0.4 % ≈ | 2 | 99 % | 47 719 | 117 |
| **sparkus-prod-node@HEAD~1** | node | 47 363 | 44 592 – 47 805 | 7 % | – |  | 3 | 100 % | 47 509 | 116 |

## A/B : arbre de travail vs `HEAD~1`

Ratio req/s (travail / baseline) round par round. Verdict **prouvé** si les 5+ rounds sont tous du même côté (test des signes, p ≤ 3 %). Même chose sur l'efficacité CPU (req par s CPU).

| Cible | Scénario | req/s : médiane (min – max) | verdict | req par s CPU : médiane (min – max) | verdict |
|---|---|---:|---|---:|---|
| sparkus-prod-bun | hello | −0.8 % (−2.9 % – +5.1 %) | ≈ | −0.2 % (−3.2 % – +4.1 %) | ≈ |
| sparkus-prod-bun | params-query | −1.1 % (−3.6 % – +1.2 %) | ≈ | −0.8 % (−4.2 % – +0.9 %) | ≈ |
| sparkus-prod-node | hello | +0.4 % (−2.1 % – +3.8 %) | ≈ | +1.1 % (−3.0 % – +2.8 %) | ≈ |
| sparkus-prod-node | params-query | +0.4 % (−1.0 % – +8.9 %) | ≈ | +0.7 % (−0.7 % – +10.2 %) | ≈ |
| sparkus-logs-bun | hello | −0.5 % (−1.5 % – +3.0 %) | ≈ | −0.8 % (−1.8 % – +1.4 %) | ≈ |
| sparkus-logs-bun | params-query | +0.3 % (−1.3 % – +2.3 %) | ≈ | +0.6 % (+0.1 % – +2.6 %) | prouvé |
| sparkus-logs-node | hello | −0.5 % (−4.1 % – +8.8 %) | ≈ | −0.5 % (−4.4 % – +10.5 %) | ≈ |
| sparkus-logs-node | params-query | −1.4 % (−3.6 % – +11.2 %) | ≈ | −1.8 % (−3.0 % – +10.9 %) | ≈ |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-prod-bun | 54 |
| sparkus-prod-node | 118 |
| sparkus-logs-bun | 53 |
| sparkus-logs-node | 116 |
| sparkus-prod-bun@HEAD~1 | 53 |
| sparkus-prod-node@HEAD~1 | 117 |
| sparkus-logs-bun@HEAD~1 | 53 |
| sparkus-logs-node@HEAD~1 | 115 |

## Machine pendant la session

- Horloge effective : 115 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane 5 %, max 93 % d'un cœur.
- Autocannon : max 212 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).
