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
| D13 | **Production intégrée, désactivée par défaut, gratuite quand elle est éteinte.** Config, logs, CORS, headers de sécurité, request id, health, timeouts et télémétrie sont des options de `createApp`. Quand aucune n'est active, l'app n'a pas d'observateur et les moteurs gardent leur chemin de requête nu ; sinon une variante « observée » de chaque handler est choisie au démarrage. La télémétrie suit les types d'`@opentelemetry/api` sans en dépendre (types structurels, vérifiés contre le vrai SDK en dev). | Le choix d'une option se paie au démarrage, jamais par requête quand on ne s'en sert pas (mission n°1), et une app de prod n'installe rien (D9). |
| D12 | **Le schéma est un filtre : ce qu'il ne déclare pas n'entre pas et ne sort pas.** Body : les champs inconnus sont **retirés** (pas rejetés), à toute profondeur ; `ctx.body` contient exactement son type, un champ optionnel absent reste absent. Réponse : avec un schéma `response`, la valeur du handler est réduite aux champs déclarés juste après le handler (les intercepteurs voient la valeur filtrée), puis sérialisée par le JSON natif du runtime (`Response.json` sous Bun, `JSON.stringify` sous Node). Une forme qui ne correspond pas (objet ou tableau attendu) répond 500 `SPK5001`. | Sécurité par défaut : pas d'assignation de masse (`{ ...entity, ...ctx.body }` est sûr), pas de fuite d'un champ interne (`passwordHash`). Retirer plutôt que rejeter : c'est le choix de Zod, Elysia et du `whitelist` de NestJS, un client plus récent ne casse pas, et une faute de frappe sur un champ requis échoue déjà. Le sérialiseur compilé (fast-json-stringify) a été mesuré et écarté : voir phase 2. |

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
- [x] Guards et intercepteurs (fonctions ou classes injectables), au niveau app, contrôleur et route, **compilés dans la pipeline** : une route sans guard ni intercepteur exécute directement son handler lié. Les hooks avant routage (`onRequest` sur toutes les requêtes, 404 comprises) : remplacés en phase 3 par l'observateur intégré (CORS, headers, logs, télémétrie, 404 comprises) ; un hook générique reste possible s'il manque un besoin réel.
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
- ~~Champs inconnus du body~~ : retirés (D12, phase 2).
- Comparaison finale v1 intégrée contre `bun-raw`, `node-raw`, Elysia et Fastify ; chiffres Linux (D8).

## Phase 2 — Schémas et contrat *(terminée)*

- [x] Un schéma par entrée : `params` et `query` typés, convertis et validés (400 qui nomme la valeur), `body` validé, `response` qui type le retour du handler à la compilation. Schémas vérifiés au démarrage (`SPK1017`).
- [x] OpenAPI 3.1 généré depuis les schémas (`app.openapi()`, `sparkus openapi`).
- [x] **Champs non déclarés** (D12) : retirés du body à toute profondeur, retirés de la réponse quand la route déclare `response` (projection compilée juste après le handler, puis JSON natif) ; forme incompatible → 500 `SPK5001`. Coût mesuré en A/B contre `main` (`JSON.stringify` sans filtre, cible de bench avec schémas `response`) : **≈ sur les 6 cases** (Bun et Node × `hello`, `params-query`, `post-validate`), aucune régression prouvée ([rapport](bench/reference/2026-10-17-ab-schema-filter-vs-main.md)).
- [x] **Sérialisation compilée : mesurée et écartée.** Un sérialiseur généré (concaténation, noms de champs en dur, chaînes courtes quotées sans `JSON.stringify`, comme fast-json-stringify) produit la même sortie, mais perd contre le JSON natif dès que la chaîne concaténée doit être aplatie (`Buffer.byteLength` sous Node, `new Response(string)` sous Bun). Micro-bench (`bench/micro/serializer.js`) : sous Bun, `new Response(texte)` coûte 2 à 3,5 × `Response.json(objet)`. A/B HTTP contre la projection (5 rounds, [rapport](bench/reference/2026-10-17-ab-compiled-serializer-vs-projection.md)) : Bun **−3,2 %** `hello`, **−3,4 %** `params-query`, **−12,7 %** `list` (10 enregistrements), tous prouvés ; Node ≈ partout. À réévaluer seulement si un runtime expose un JSON natif plus lent que le nôtre.
- [x] Compatibilité [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType) en chemin secondaire : `body`, `params`, `query` et `response` acceptent tout schéma Standard Schema v1, typé comme un `t` (`Ctx<typeof Route>`). Le `validate()` de la bibliothèque tourne tel quel (async attendu), sa sortie remplace l'entrée ; erreurs au format Sparkus (400 `SPK2004`, 500 `SPK5001`, `~standard` invalide : `SPK1017`) ; OpenAPI via Standard JSON Schema quand la bibliothèque l'expose (Zod 4), sinon `{}`. Types de la spec recopiés (D9), Zod en dépendance de dev de la suite de conformité. Les étapes asynchrones ne sont branchées que sur les routes qui ont un Standard Schema : le chemin `t` garde son code. A/B : ≈ sur 5 cases sur 6 ; `sparkus-node` / `post-validate` à −0,9 % en 5 rounds, non reproduit en 9 rounds (≈), pipeline compilé identique au micro-bench ([rapport](bench/reference/2026-10-17-ab-standard-schema-vs-schema-filter.md)).
- [x] `t.nullable(schema)` : `T | null`, combinable avec `t.optional()`. Accepté par le body et la réponse (copié tel quel, objets toujours filtrés), refusé dans `params`/`query` (`SPK1017`), `type: ["…", "null"]` en OpenAPI. Le code généré pour un schéma sans `nullable` est identique à l'octet près (chemin par requête inchangé).
- [x] Client TypeScript typé généré : `sparkus client [entry] --out fichier`, un seul fichier sans dépendance, construit depuis le document OpenAPI (donc `t` et Standard Schema pareil). `createClient({ baseUrl, headers?, fetch? })`, une méthode par route groupée par contrôleur (`api.article.get({ params, query, body }, { headers, signal })`), retour typé par le schéma `response`, `ApiError` (`status`, `code`, `problem`) hors 2xx. Testé contre la vraie app via `app.fetch` (fichier généré de référence + `@ts-expect-error` sur les entrées invalides).

## Phase 3 — Production *(terminée)*

Tout est une option de `createApp` / `listen()`, désactivée par défaut (D13). Suite de conformité : une fixture « production » (toutes les options) jouée sur les 4 cibles, plus un test contre le vrai SDK OpenTelemetry (dépendances de dev). 511 tests.

- [x] **Config typée** : `config({ DATABASE_URL: t.string(), PORT: t.integer({ default: 3000 }), ... })` renvoie un token injectable ; variables lues au démarrage, converties (entiers, nombres, booléens, `t.enum`, listes séparées par des virgules), figées. Toute variable manquante ou invalide arrête l'app avec **SPK1018 qui les liste toutes, sans jamais afficher les valeurs** (secrets). `AppConfig.override({ ... })` pour les tests (typé, validé, défauts conservés). `PORT` validé aussi.
- [x] **Schémas** : `t.enum([...])` (union de chaînes) et `default` sur les scalaires (body, query, config ; le champ est alors toujours présent, son type n'est pas optionnel). Défaut invalide, `default` + `t.optional()`, défaut sur un paramètre de chemin : SPK1017 au démarrage. Clés inconnues dans les options de route : SPK1017 avec suggestion (`requestTimeout` → `timeout`).
- [x] **Logs** : `Logger` injectable (`inject(Logger).child("users")`), JSON une ligne par entrée (`level`, `time`, `module`, `msg`, champs, erreurs sérialisées avec `cause`), format lisible dans un terminal, niveaux par module (préfixe le plus long), `LOG_LEVEL=info,db=debug`, sortie stdout bufferisée (une écriture par tour de boucle, vidée à l'arrêt et à `exit`). `ctx.log` porte le request id. Le CLI envoie les logs de l'app sur stderr (`check --json`, `openapi` restent parsables).
- [x] **Request id** : `ctx.requestId` (header `x-request-id` du client s'il est sûr, sinon UUID), écho dans la réponse avec `requestId: true`, présent dans les logs et les erreurs 500 journalisées.
- [x] **CORS** (préflight 204 avec les méthodes du chemin, origines exactes, RegExp ou fonction, `credentials`, `vary: origin`), **headers de sécurité** (CSP, HSTS, COOP, CORP, nosniff, frame-options, referrer-policy ; surchargeables), sur toutes les réponses, erreurs et 404 comprises ; un header posé par le handler gagne. Origine avec slash final, `"*"` + credentials : SPK1019.
- [x] **Timeouts** : `requestTimeout` (app) et `timeout` (route) → 503 SPK2008 et `ctx.signal` avorté ; `ctx.signal` suit aussi la déconnexion du client. `bodyLimit` par route. `listen({ idleTimeout })`. Écart de moteurs trouvé et corrigé : **Bun coupait toute requête plus lente que son `idleTimeout` (10 s par défaut), Node non** ; le moteur Bun suspend désormais ce délai pendant un handler asynchrone et le réarme à la réponse.
- [x] **Health** : `/health` (liveness) et `/ready` (readiness) avec `health: true` ; les services qui implémentent `HealthCheck` sont appelés en parallèle, avec timeout ; 503 SPK2009 qui nomme le service. Dès le signal d'arrêt, `/ready` répond 503 ; `listen({ shutdownDelay })` continue de servir pendant ce délai pour que le load balancer retire l'instance. Pas de guards sur les sondes, absentes de l'OpenAPI.
- [x] **Télémétrie OpenTelemetry sans dépendance** : `telemetry: { tracer, meter, extract, activate }` accepte directement `trace.getTracer()` / `metrics.getMeter()` d'`@opentelemetry/api` (types structurels identiques, vérifiés par `tsc` contre le SDK). Span serveur `GET /users/:id` avec les attributs des conventions sémantiques HTTP, exception et statut d'erreur sur 5xx, histogramme `http.server.request.duration` (secondes). `extract` (traceparent) et `activate` (contexte actif) font des spans de l'app des enfants de la requête. Un paquet d'intégration optionnel reste possible, il n'est pas nécessaire.
- [x] Template `sparkus init` : `src/config.ts`, `.env.example`, options de prod activées, tests sur l'app de prod (`createTestApp({ ...options, overrides })`), skills et `AGENTS.md` à jour.
- [x] Relecture par 2 agents (correction, expérience agent) : 2 crashs de process Node évités (header invalide posé par le handler, fonction `cors.origin` qui lève), `Response.redirect()` et réponses partagées copiées au lieu d'être mutées, `finish` exactement une fois, statut 499 si le client part avant la réponse, docs alignées sur le code.

**Perf.** Chemin par défaut (aucune option) en A/B contre `main`, 7 rounds, Bun et Node × `hello`, `params-query`, `post-validate`, `error-404`, `error-400` : **≈ sur 9 cas sur 10** ([rapport](bench/reference/2026-10-17-ab-phase3-final-vs-main.md), [Bun après correction du repli](bench/reference/2026-10-17-ab-phase3-bun-errors-vs-main.md)). Le dixième, Bun `error-400`, perd **1,0 % de débit (prouvé, CPU ≈)** : c'est le prix, sur les routes asynchrones sous Bun, de la suspension du délai d'inactivité (deux appels natifs par requête asynchrone), gardé parce qu'il corrige un écart de comportement entre moteurs (D10). Un premier A/B avait aussi trouvé Bun `error-404` −2,7 % (prouvé) : le repli passait par cette suspension parce que `createFetchHandler` était `async` ; il répond désormais en synchrone quand la réponse l'est (≈ ensuite). Les valeurs par requête rarement utilisées (request id, logger, AbortController, horodatage, span) vivent dans un objet créé à la demande : le contexte nu ne prend que 2 champs.

Coût des options de production (logs de requêtes, headers de sécurité, request id, CORS, health), mesuré contre la même app sans options dans la même session (`bench/compare.ts`, 5 rounds, ratios appariés, tous prouvés) :

| | `hello` | `params-query` | `post-validate` |
|---|---:|---:|---:|
| Sparkus/Bun, première version | −23,0 % | −23,2 % | −20,0 % |
| Sparkus/Bun, optimisé | **−16,0 %** | **−15,7 %** | **−14,5 %** |
| Sparkus/Node, première version | −22,9 % | −22,8 % | −23,5 % |
| Sparkus/Node, optimisé | **−19,9 %** | **−19,5 %** | **−21,4 %** |
| Fastify avec son logger (pino) vs Fastify | −38,5 % | −37,7 % | −33,6 % |
| **Sparkus/Node (toutes options) vs Fastify (logger seul)** | **+43,8 %** | **+42,6 %** | **+40,0 %** |

Décomposition sous Bun avant optimisation (`hello`) : logs −15,1 %, headers de sécurité −8,6 %, request id −7,6 %, CORS sans `Origin` −6,2 % (le coût fixe du chemin observé). Micro-bench (`bench/micro/observe.js`) qui a guidé les deux optimisations gardées : Bun construit les headers d'une réponse à partir d'un objet à ~75 ns par entrée (500 ns pour 7) mais copie un `Headers` préconstruit en 47 ns, d'où un `Headers` de base copié par requête ; la ligne de log de requête sérialisée à la main coûte 87 ns contre 519 ns pour la boucle générique. `randomUUID()` ne coûte que 36 ns : gardé. Rapports : [première version](bench/reference/2026-10-17-phase3-production-cost.md), [optimisé](bench/reference/2026-10-17-phase3-production-cost-optimized.md).

Reporté :

- ~~Propagation automatique du contexte~~ : **livrée en option, désactivée par défaut**, `logger: { requestContext: true }`. Toute ligne journalisée pendant une requête, par n'importe quel logger (`inject(Logger)` dans un service, à travers les `await`), porte `reqId` et, avec la télémétrie, `trace_id` / `span_id` du span serveur (pas le span actif le plus interne : Sparkus ne lit pas le contexte OpenTelemetry). `ctx.log` et un champ `reqId` explicite ne sont pas doublés ; les lignes hors requête n'ont rien. `node:async_hooks` n'est importé (dynamiquement) que si l'option est active ; elle met l'app sur le chemin observé, chaque route y est enveloppée une fois au démarrage (`Observer.enter`), le chemin nu est inchangé (D13). Conformité : 3 cas × 4 cibles (service après `await`, requêtes concurrentes, ligne hors requête) et le vrai SDK OpenTelemetry (ids du span serveur dans les lignes).
  - Micro-bench (`bench/micro/als.js`) : `als.run()` autour d'un handler sync coûte **17 ns sous Bun 1.4.3, 150 ns sous Node 24.22** (2 et 1,6 ns sans) ; `getStore()` 5 à 8 ns ; une fois l'ALS créé, les requêtes hors `run()` ne paient rien.
  - A/B HTTP (`bench/compare.ts`, 5 rounds, même session, [rapport](bench/reference/2026-10-17-als-request-context.md)) :

    | | `hello` | `params-query` | `post-validate` |
    |---|---:|---:|---:|
    | Bun, option seule vs aucune option | −1,1 % ≈ | −0,4 % ≈ | −0,8 % (prouvé) |
    | Bun, production + option vs production | −0,1 % ≈ | −0,9 % (prouvé) | −0,6 % ≈ |
    | Node, option seule vs aucune option | **−3,8 %** | **−4,7 %** | **−3,2 %** |
    | Node, production + option vs production | **−4,0 %** | **−3,1 %** | **−4,2 %** |

    Sous Node, tout est prouvé, CPU par requête compris : ~0,7 µs par requête, 5 fois le micro-bench (sous Node 24, `run()` alloue deux frames `AsyncContextFrame` par requête). Variante essayée et écartée : `enterWith(ctx)` sans restauration (une frame au lieu de deux, bornée par le callback du socket) : ≈ contre `run()` (+1,0 à +1,7 % en médiane, rounds en désaccord), et des lignes risquaient d'hériter d'une requête terminée.
  - Décision : gardée parce qu'elle est optionnelle (D13), qu'elle ne coûte presque rien sous Bun (moteur par défaut, D1), et que sous Node 4 % restent loin du logger de Fastify (−38 %) pour ce qu'elle apporte : plus de `ctx` à faire descendre dans les services. Pas activée dans le template `init`.
- Redaction de champs sensibles dans les logs, compression, rate limiting : hors périmètre de cette phase.
- Chiffres Linux (D8) de la phase 3.

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
