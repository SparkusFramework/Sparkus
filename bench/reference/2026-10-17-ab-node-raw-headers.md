# Résultats du bench

2026-10-17T18:46:10.586Z · win32 · 16 CPU logiques · Bun 1.4.3 · Node v24.22.0 · 5 rounds · 5 s (+2 s de warm-up, 0 s de pause) · 100 connexions · autocannon 4 thread(s) · serveur épinglé sur les CPU 2,3, autocannon sur 8,9,10,11,12,13,14,15 · baseline `HEAD~1`

Lecture : req/s = médiane des rounds ; *min – max* = étendue des rounds ; *écart* = (max − min) / médiane. Les ratios (% du plafond, vs suivant) sont calculés **dans chaque round** puis résumés. **≈** : les rounds ne sont pas tous du même côté, la différence est dans le bruit. *indicatif* : tous les rounds sont d'accord, mais moins de 5 rounds.

## hello — GET / returning a small JSON object

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-node** | node | 63 901 | 59 594 – 65 728 | 10 % | – | +2.1 % | 1 | 101 % | 63 392 | 65 |
| **sparkus-node@HEAD~1** | node | 62 621 | 57 494 – 63 997 | 10 % | – | +5.4 % | 2 | 101 % | 63 206 | 65 |
| **sparkus-requestid-node** | node | 59 920 | 55 357 – 61 200 | 10 % | – | +0.2 % ≈ | 2 | 100 % | 59 727 | 72 |
| **sparkus-requestid-node@HEAD~1** | node | 58 621 | 50 941 – 61 059 | 17 % | – | +7.2 % | 2 | 101 % | 58 080 | 72 |
| **sparkus-logs-node** | node | 55 818 | 46 557 – 57 699 | 20 % | – | +0.8 % ≈ | 2 | 101 % | 54 958 | 90 |
| **sparkus-logs-node@HEAD~1** | node | 54 992 | 51 312 – 55 990 | 9 % | – | +6.6 % | 2 | 100 % | 54 792 | 91 |
| **sparkus-prod-node** | node | 51 126 | 50 224 – 52 547 | 5 % | – | +3.1 % ≈ | 2 | 101 % | 50 808 | 90 |
| **sparkus-prod-node@HEAD~1** | node | 50 077 | 46 000 – 52 112 | 12 % | – |  | 3 | 101 % | 49 454 | 91 |

## params-query — GET /users/:id?fields= through a service

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-node** | node | 61 085 | 56 304 – 61 347 | 8 % | – | +2.0 % | 1 | 100 % | 60 896 | 74 |
| **sparkus-node@HEAD~1** | node | 59 984 | 51 792 – 60 592 | 15 % | – | +2.3 % ≈ | 2 | 100 % | 60 367 | 74 |
| **sparkus-requestid-node** | node | 57 962 | 53 072 – 58 909 | 10 % | – | +1.5 % ≈ | 2 | 100 % | 58 182 | 72 |
| **sparkus-requestid-node@HEAD~1** | node | 56 618 | 51 158 – 58 826 | 14 % | – | +6.7 % | 1 | 100 % | 56 439 | 73 |
| **sparkus-logs-node** | node | 53 917 | 50 198 – 55 133 | 9 % | – | +1.6 % ≈ | 2 | 100 % | 53 917 | 118 |
| **sparkus-logs-node@HEAD~1** | node | 52 656 | 46 179 – 54 269 | 15 % | – | +7.3 % ≈ | 2 | 100 % | 52 653 | 118 |
| **sparkus-prod-node** | node | 49 034 | 48 362 – 50 589 | 5 % | – | +3.6 % ≈ | 2 | 100 % | 48 580 | 118 |
| **sparkus-prod-node@HEAD~1** | node | 47 843 | 41 757 – 49 616 | 16 % | – |  | 2 | 100 % | 47 401 | 120 |

## post-validate — POST /users with a JSON body validated against a schema, 201

| Cible | Runtime | req/s | min – max | écart | % du plafond (min – max) | vs suivant | p99 (ms) | CPU (% d'un cœur) | req par s CPU | RSS (Mo) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **sparkus-node** | node | 48 131 | 44 266 – 48 554 | 9 % | – | +0.3 % ≈ | 2 | 100 % | 47 813 | 74 |
| **sparkus-node@HEAD~1** | node | 47 594 | 42 115 – 48 944 | 14 % | – | +7.9 % | 2 | 101 % | 47 297 | 75 |
| **sparkus-requestid-node** | node | 44 790 | 38 986 – 45 853 | 15 % | – | −0.1 % ≈ | 2 | 100 % | 44 268 | 74 |
| **sparkus-requestid-node@HEAD~1** | node | 44 720 | 40 074 – 45 136 | 11 % | – | +6.7 % | 2 | 100 % | 44 441 | 74 |
| **sparkus-logs-node** | node | 41 360 | 38 429 – 42 320 | 9 % | – | +1.0 % ≈ | 2 | 100 % | 41 399 | 119 |
| **sparkus-logs-node@HEAD~1** | node | 41 277 | 37 693 – 42 717 | 12 % | – | +4.3 % ≈ | 2 | 101 % | 41 382 | 120 |
| **sparkus-prod-node** | node | 38 461 | 37 770 – 40 054 | 6 % | – | +2.1 % ≈ | 3 | 100 % | 38 347 | 120 |
| **sparkus-prod-node@HEAD~1** | node | 37 629 | 36 099 – 39 248 | 8 % | – |  | 3 | 100 % | 37 711 | 122 |

## A/B : arbre de travail vs `HEAD~1`

Ratio req/s (travail / baseline) round par round. Verdict **prouvé** si les 5+ rounds sont tous du même côté (test des signes, p ≤ 3 %). Même chose sur l'efficacité CPU (req par s CPU).

| Cible | Scénario | req/s : médiane (min – max) | verdict | req par s CPU : médiane (min – max) | verdict |
|---|---|---:|---|---:|---|
| sparkus-node | hello | +2.1 % (+1.1 % – +3.7 %) | prouvé | +2.4 % (−0.4 % – +3.3 %) | ≈ |
| sparkus-node | params-query | +2.0 % (+0.2 % – +8.7 %) | prouvé | +1.4 % (−0.4 % – +7.3 %) | ≈ |
| sparkus-node | post-validate | +0.3 % (−0.8 % – +5.1 %) | ≈ | +1.9 % (−2.0 % – +6.4 %) | ≈ |
| sparkus-prod-node | hello | +3.1 % (−0.4 % – +9.2 %) | ≈ | +2.2 % (−0.4 % – +8.8 %) | ≈ |
| sparkus-prod-node | params-query | +3.6 % (−1.2 % – +15.8 %) | ≈ | +3.2 % (−1.8 % – +14.0 %) | ≈ |
| sparkus-prod-node | post-validate | +2.1 % (−2.8 % – +6.5 %) | ≈ | +1.3 % (−1.3 % – +6.9 %) | ≈ |
| sparkus-logs-node | hello | +0.8 % (−9.3 % – +3.1 %) | ≈ | +0.1 % (−8.1 % – +1.8 %) | ≈ |
| sparkus-logs-node | params-query | +1.6 % (−1.7 % – +8.7 %) | ≈ | +0.3 % (−1.4 % – +7.7 %) | ≈ |
| sparkus-logs-node | post-validate | +1.0 % (−1.2 % – +2.0 %) | ≈ | +0.0 % (−0.9 % – +3.9 %) | ≈ |
| sparkus-requestid-node | hello | +0.2 % (−1.1 % – +8.7 %) | ≈ | +0.9 % (−0.5 % – +6.3 %) | ≈ |
| sparkus-requestid-node | params-query | +1.5 % (−6.3 % – +5.2 %) | ≈ | +1.5 % (−5.7 % – +4.9 %) | ≈ |
| sparkus-requestid-node | post-validate | −0.1 % (−7.4 % – +1.6 %) | ≈ | −1.0 % (−7.4 % – +2.2 %) | ≈ |

## Mémoire (pic du process, médiane des rounds)

| Cible | RSS pic (Mo) |
|---|---:|
| sparkus-node | 77 |
| sparkus-prod-node | 121 |
| sparkus-logs-node | 121 |
| sparkus-requestid-node | 76 |
| sparkus-node@HEAD~1 | 77 |
| sparkus-prod-node@HEAD~1 | 124 |
| sparkus-logs-node@HEAD~1 | 122 |
| sparkus-requestid-node@HEAD~1 | 76 |

## Machine pendant la session

- Horloge effective : 113 % – 119 % de la fréquence nominale.
- CPU des autres process (hors serveur et autocannon, sampler compris) : médiane -8 %, max 241 % d'un cœur.
- Autocannon : max 178 % d'un cœur (4 thread(s) : s'il approche 400 %, c'est lui le goulot).
- **4 mesure(s) bruitée(s)** (autres process > 150 % d'un cœur) : sparkus-requestid-node/params-query round 4 (164 %), sparkus-prod-node/params-query round 5 (172 %), sparkus-requestid-node@HEAD~1/hello round 5 (218 %), sparkus-logs-node/hello round 5 (241 %). Relancer sur une machine calme si elles comptent.
