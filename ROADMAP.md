# Sparkus v1 — Roadmap

Objectif : le framework backend TypeScript **le plus rapide** dans la catégorie « décorateurs + injection de dépendances » (NestJS, et au-delà Fastify / Elysia / Hono), et le plus **simple à écrire pour un agent IA**.

Principes directeurs :

- **Tout ce qui peut être décidé au démarrage l'est au démarrage.** Le chemin d'une requête ne fait plus que le strict nécessaire : pas de lookup DI, pas de réflexion, pas de middleware générique, pas d'allocation inutile.
- **Fait maison, zéro dépendance à l'exécution.** Les paquets publiés n'utilisent que les APIs de Bun et de Node.

---

## Décisions d'architecture

| # | Décision | Pourquoi |
|---|---|---|
| D1 | **Bun d'abord, Node supporté.** Bun est le runtime de dev du repo (workspaces, scripts, `bun test`) et le moteur HTTP par défaut. Node reste une cible testée en CI. | Bun.serve est le serveur HTTP le plus rapide de l'écosystème JS, et il a un routeur natif. |
| D2 | **Moteurs HTTP branchables** : `bun` (routes natives de `Bun.serve`), `node` (`node:http` + routeur Sparkus), plus tard `uws`. `engine: "auto"` choisit selon le runtime. | Le cœur ne dépend d'aucun serveur ; chaque moteur utilise le chemin le plus rapide de sa plateforme (pas d'objets `Request`/`Response` simulés sous Node). |
| D3 | **Décorateurs standard TC39**, pas `experimentalDecorators`. Pas de `reflect-metadata`. | Fonctionnent nativement avec Bun, tsc et esbuild ; c'est l'avenir de TypeScript. |
| D4 | **Injection par `inject(Service)`** dans les champs ou le constructeur, résolue une fois au démarrage (singletons). | Typée sans métadonnées, lisible, impossible à mal câbler : un agent ne peut pas se tromper de nom de token. |
| D5 | **Un handler reçoit un contexte typé** (`ctx.params`, `ctx.query`, `ctx.body`) dont le type est inféré du schéma de la route. | Les décorateurs standard n'ont pas de décorateurs de paramètres (`@Body()`) ; le contexte typé est plus simple et plus rapide. |
| D6 | **Un schéma unique par route** produit la validation compilée, les types, la sérialisation et l'OpenAPI. | Une seule source de vérité, et le compilateur attrape les erreurs (humaines ou d'agent). |
| D7 | **Réécriture complète** de la v0 ; on garde l'esprit de l'API (`@Controller`, `@Get`…). | Le cœur v0 (DI sur prototypes, handlers sans requête) n'est pas récupérable. |
| D8 | **Chiffres publiés mesurés sous Linux**, harnais reproductible dans `bench/`. | Les perfs réseau sous Windows ne représentent pas la prod. |
| D9 | **Zéro dépendance à l'exécution** dans tous les paquets publiés : routeur, schémas, validation, sérialisation, logger, config, CLI (parsing d'arguments, watcher) sont faits maison. Seules les dépendances de dev (TypeScript) sont admises. Une exception exige une décision écrite ici, et reste un paquet optionnel (ex. moteur `uws`). Vérifié en CI. | Pas de risque supply chain, installs instantanés, bundle minimal pour le build natif, et un contrôle total sur la perf. |
| D10 | **Une seule suite de conformité pour tous les moteurs** (`tests/conformance`). Un moteur n'est pris en charge que s'il la passe entière. | Le choix du moteur ne doit jamais changer le comportement d'une app. |
| D11 | **Outillage Bun, `tsc` réduit aux déclarations.** Vérification de types : `bun check` (mêmes erreurs que `tsc`, sans build). JavaScript : `bun build`. En développement, les paquets exposent leurs sources comme `"types"` ; `tsc --emitDeclarationOnly` ne sert qu'à publier, et la publication fait pointer `"types"` vers `dist/*.d.ts`. | Boucle de dev plus rapide (36 ms de build, typecheck 4 à 6 fois plus rapide). Bun ne sait pas émettre de `.d.ts` (vérifié en 1.4.3), et les utilisateurs npm en ont besoin : `skipLibCheck` ne protège pas d'erreurs dans des sources `.ts` publiées. |

---

## Phase 0 — Spike perf + harnais de bench *(terminée sous Windows, à confirmer sous Linux)*

But : **valider le pari de perf avant de construire.**

- [x] `bench/` : harnais reproductible (démarrage isolé de chaque cible, warm-up, runs entrelacés, médiane, p50/p99, CPU et mémoire), contrat de réponse vérifié avant chaque mesure, verrou machine (un seul bench à la fois, tous worktrees confondus).
- [x] Scénarios : `GET /` JSON, `GET /users/:id?fields=` (params + query + service), `POST /users` (body JSON validé, 201).
- [x] Cibles Bun : `Bun.serve` brut (plafond), Sparkus, Elysia, Hono.
- [x] Cibles Node : `node:http` brut (plafond), Sparkus, Fastify, Express, NestJS (Express), NestJS (Fastify), Hono.
- [x] `spike/` : prototype du noyau. Gardé comme cible de bench (`spike-bun`, `spike-node`) tant que la v1 n'a pas prouvé qu'elle n'est pas plus lente ; supprimé ensuite.
- [x] Méthode fiabilisée : rounds entrelacés, ratios appariés, épinglage CPU (la « dérive » venait d'un voisin SMT sur le cœur du serveur), mode A/B contre une ref git, verdict « prouvé » par test des signes. Session de référence Windows : `bench/reference/2026-10-17-windows.md`.
- [ ] Mesures publiables sous Linux, plusieurs runs.

**Critère de sortie** : Sparkus/Bun à moins de 10 % de `Bun.serve` brut et devant Elysia ; Sparkus/Node devant Fastify. Atteint sous Windows (session de référence, 5 rounds).

## Phase 1 — Noyau v1 *(terminée)*

- [x] Monorepo Bun : `packages/core`, `engine-bun`, `engine-node`, `testing`, `cli`, et `sparkus` (paquet public qui choisit le moteur). v0 et `dist/` versionné supprimés.
- [x] Conteneur DI : singletons, `token<T>()` pour les valeurs, providers (`useValue`, `useClass`, `useFactory`), cycle de vie `onInit` (dépendances d'abord) et `onShutdown` (ordre inverse), cycles détectés avec le chemin complet, échec de construction avec le chemin de dépendances, overrides pour les tests, injection par constructeur refusée au démarrage.
- [x] Contexte de requête (`method`, `path`, `params`, `query`, `body`, `header()`, `status`, `setHeader()`, `state` typé), handlers sync et async sans `await` superflu.
- [x] Réponses : objet → JSON, `string` → text/plain, octets → octet-stream, `undefined` → 204, `Response` passée telle quelle.
- [x] Erreurs `application/problem+json` (RFC 9457) avec code stable : `HttpError` et ses raccourcis, 404 (avec suggestion de route en dev), 405 + `Allow`, 413, 415, 400 (JSON invalide, validation avec chemin), 403 (guard). Erreurs inattendues : 500 journalisée, message exposé seulement en dev/test, jamais de stack. `onError` pour mapper ses propres erreurs. Messages au format « [code] problème, coupable. Correction. », référence dans `docs/errors.md`.
- [x] Guards et intercepteurs (fonctions ou classes injectables), au niveau app, contrôleur et route, **compilés dans la pipeline** : une route sans guard ni intercepteur exécute directement son handler lié. Les hooks avant routage (`onRequest` sur toutes les requêtes, 404 comprises) arrivent avec les logs en phase 3.
- [x] Arrêt propre : SIGINT/SIGTERM, plus de nouvelles connexions, drain des requêtes en cours (keep-alive compris), coupure forcée après `shutdownTimeout`, puis `onShutdown`.
- [x] `app.fetch` (Request → Response, sans serveur) et `@sparkus/testing` (`createTestApp`, `inject()` en mémoire).
- [x] API publique (`@sparkus/core`, `sparkus`) séparée de l'interface des moteurs (`@sparkus/core/engine`).
- [x] Routeur Node réécrit : parcours par index sans `split`, aucune allocation sur les branches qui échouent, params construits par une fabrique générée par route.
- [x] **Suite de conformité unique** jouée sur 4 cibles (mémoire, moteur Bun, moteur Node sous Bun, vrai process Node) : toute différence entre moteurs est un bug.
- [x] CI GitHub Actions (Ubuntu + Windows, Node 22 et 24) et contrôle D9 (`bun run check:deps`).
- [x] Outillage D11 : `bun check`, `bun build` (code splitting entre points d'entrée), `tsc` pour les `.d.ts` seulement ; nos sources compilent sous la config de n'importe quel projet.
- [x] Revue par 5 agents experts (moteur Bun, moteur Node, noyau, méthode de bench, expérience agent), chaque gain prouvé en A/B. Gains gardés (Windows, épinglé, 5 rounds) :
  - query en objets « fast mode » sous V8 : params-query Node **+12,8 %** ;
  - 4xx sans stack trace ni defines de champs : avalanche de 400 Node **+28,9 %**, Bun **+5,1 %** ;
  - 404/405 rendus directement en texte : avalanche de 404 Node **+84,4 %**, Bun **+8,0 %** ;
  - pas d'objet `init` pour les réponses JSON 200 sous Bun : hello **+1,1 %** d'efficacité CPU.

Écarts assumés :

- Sous Bun, au-delà de 2 × `bodyLimit`, c'est Bun qui répond 413 (sans corps problem+json) avant tout handler. En dessous, Sparkus répond lui-même.
- Pas de wildcard (`/files/*`) ni de routes héritées d'un contrôleur parent pour l'instant (erreur `SPK1014` explicite).

Reporté à la phase suivante :

- Moteur Node : 2,8 % derrière le prototype sur `hello` (session de référence) ; variantes H2 à H7 de l'expert Node non mesurées (interrompues par un redémarrage Windows Update).
- Moteur Bun : `post-validate` à 95 % du plafond.
- Champs inconnus du body : acceptés aujourd'hui ; décider s'ils sont rejetés ou retirés (sécurité), et mesurer le coût.
- Comparaison finale v1 intégrée contre `bun-raw`, `node-raw`, Elysia et Fastify ; chiffres Linux (D8).

## Phase 2 — Schémas et contrat

- [x] Un schéma par entrée : `params` et `query` typés, convertis et validés (400 qui nomme la valeur), `body` validé, `response` qui type le retour du handler à la compilation. Schémas vérifiés au démarrage (`SPK1017`).
- [x] OpenAPI 3.1 généré depuis les schémas (`app.openapi()`, `sparkus openapi`).
- [ ] **Sérialisation compilée** des réponses (à prouver en A/B contre `JSON.stringify`), et décision sur les champs non déclarés.
- [ ] Compatibilité [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType) en chemin secondaire.
- [ ] Client TypeScript typé généré.

## Phase 3 — Production

- Config typée et validée depuis l'environnement, échec au démarrage si invalide.
- Logs JSON structurés, request id, niveaux par module.
- CORS, limites de taille de body, headers de sécurité, timeouts.
- Health / readiness, hooks de traces et métriques au format OpenTelemetry (sans dépendre du SDK OTel ; un paquet d'intégration optionnel pourra le brancher).

## Phase 4 — Pensé pour les agents IA

Déjà livré : `sparkus init` (app d'exemple, tests, `AGENTS.md`, `CLAUDE.md`, 4 skills, hook `sparkus check --json`), `sparkus check | routes | openapi` avec `--json`, `sparkus dev` (redémarrage simple, sans process de réserve), codes d'erreur avec correction et `docs/errors.md`, `llms.txt`, `inject()` en mémoire. Reste ci-dessous.

- Conventions strictes et prévisibles : un fichier = un contrôleur ou un service, arborescence fixe.
- CLI `sparkus` avec sortie `--json` : `graph` (graphe DI) à ajouter.
- CLI distribué en **exécutable natif** (`bun build --compile --bytecode`), cross-compilé Windows / Linux / macOS, publié sur npm avec un paquet par plateforme (modèle esbuild / Biome).
- `sparkus dev` : **notre propre watcher**, dans le CLI, jamais dans le framework (pas de `bun --hot` ni `node --watch`).
  - Le CLI supervise l'app dans un process enfant ; `fs.watch` récursif avec debounce ; graphe d'imports (`Bun.Transpiler.scanImports`) pour savoir ce qu'un changement touche.
  - Base, toujours correcte : redémarrage avec un **process de réserve déjà chaud** (runtime et dépendances chargés) qui prend la main ; bascule sans coupure du port via `reusePort` sous Linux.
  - Accélérateur, plus tard : quand seul un contrôleur change, ré-import et échange de la table de routes à chaud (`server.reload()`).
  - À chaque sauvegarde : `check` et typecheck en arrière-plan, erreurs avec code et fichier, flux d'événements `--json` pour les agents.
- Erreurs avec code stable (`SPK1001`), cause, fichier concerné et correction proposée.
- `app.inject({ method, url, body })` : tests en mémoire, sans port.
- `sparkus init` (et `bun create sparkus`) : boilerplate prêt pour les agents.
  - Arborescence conventionnelle, un contrôleur et un service d'exemple avec leurs tests, CI.
  - `AGENTS.md` (standard multi-agents) et `CLAUDE.md` qui l'importe.
  - Skills dans `.claude/skills/` : ajouter un endpoint, ajouter un service, écrire un test, diagnostiquer une erreur `SPKxxxx`.
  - `.mcp.json` qui branche le serveur MCP de dev (`sparkus mcp`) ; hook après édition qui lance `sparkus check --json`.
  - `sparkus agents sync` : régénère ces fichiers quand le framework évolue, pour que les consignes des agents ne soient jamais périmées.
  - Plus tard : un plugin Claude Code « sparkus » qui regroupe skills, MCP et hooks.
- Doc au format `llms.txt`.
- Serveur MCP de dev : lister les routes, lire le graphe DI et les logs, appeler un endpoint.

## Phase 5 — Perf poussée et release

- Moteur `uws` pour Node, en paquet optionnel (seule exception prévue à D9, car uWebSockets.js est un module natif).
- `sparkus build` : **build AOT vers un exécutable unique** (`bun build --compile --bytecode --minify`, cross-compilé Linux x64 / arm64 / musl).
  - Sparkus génère le code au lieu de le calculer au démarrage : validateurs et sérialiseurs en dur (pas de `new Function`), câblage DI en `new` ordonnés, table de routes statique, réponses constantes servies en `Response` statiques par Bun.
  - Le build échoue sur cycle DI, conflit de routes ou erreur de type.
  - Gains attendus : démarrage à froid minimal (serverless), image Docker d'un seul fichier. Le débit par requête reste celui du JIT.
  - Sous Node : bundle JS optimisé (les Single Executable Applications de Node sont moins mûres).
- Bench en CI avec détection de régression ; intégration dans FrameworkBench.
- Site de doc, release 1.0.
