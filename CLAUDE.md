# BodIA — Backend

API do BodIA. Stack: **TypeScript + Express + Prisma 6** (PostgreSQL), autenticação futura com **bcrypt** (hash de senha) e **jsonwebtoken** (sessão). Hoje a API recebe o cadastro do app, calcula o plano no motor determinístico (`CalculoService`) e já conversa com o LLM (`LlmService`) — mas **ainda não há auth, persistência nem o prompt real da IA**.

Qualquer recurso novo (auth, usuário, perfil, treino, dieta...) **deve seguir exatamente o padrão de camadas abaixo** — não introduzir um estilo diferente (ex.: lógica direto no controller, um ORM alternativo, um container de DI) sem alinhar antes.

## Stack

- **TypeScript** (strict mode) rodando com `tsx` em dev, compilado com `tsc` para produção
- **Express 4** — HTTP layer
- **Prisma 6** — ORM, PostgreSQL como banco (`docker-compose.yml` sobe um Postgres local)
- **bcrypt** — hash de senha (reservado para quando existir auth)
- **jsonwebtoken** — emissão/validação de token (reservado para quando existir auth)
- **cors**, **dotenv** — infraestrutura básica de app
- **Jest** (`ts-jest`) — testes unitários
- **`openai` SDK** apontado para a **DeepSeek** (`deepseek-v4-pro`) — a API da DeepSeek é compatível com a interface Chat Completions da OpenAI, então o SDK oficial é reaproveitado só trocando a `baseURL`

## Arquitetura em camadas

```
Route → Controller → Service → Repository → PrismaClient
```

Cada camada só conhece a camada imediatamente abaixo. Toda dependência é passada via **construtor** (injeção de dependência manual — sem container/IoC, sem decorators). O ponto de composição (`new X(new Y(...))`) fica no arquivo de rota daquele recurso.

### Repository (`src/repositories/`)

Única camada que importa `PrismaClient`/`@prisma/client`. Encapsula o acesso a dados de **uma** entidade. Recebe o `PrismaClient` no construtor (nunca instancia um novo — sempre reutiliza o singleton de `src/config/prisma.ts`).

```ts
// src/repositories/UserRepository.ts
import { PrismaClient } from "@prisma/client";

export default class UserRepository {
    private readonly prismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prismaClient = prismaClient;
    }
}
```

### Service (`src/services/`)

Contém a regra de negócio. Recebe o(s) Repository(ies) que precisa no construtor. Nunca importa `PrismaClient`/Express diretamente — não conhece HTTP nem banco, só a interface do repository.

```ts
// src/services/UserService.ts
import UserRepository from "../repositories/UserRepository";

export default class UserService {
    private readonly userRepository;

    constructor(userRepository: UserRepository) {
        this.userRepository = userRepository;
    }
}
```

### Controller (`src/controllers/`)

Faz a ponte HTTP ↔ Service: lê `req`, chama o Service, escreve `res`. Não contém regra de negócio. Métodos que viram handler de rota são **arrow function properties** (garante o `this` correto quando passados direto pro Express, sem precisar de `.bind`).

```ts
// src/controllers/HealthController.ts
import { Request, Response } from "express";
import HealthService from "../services/HealthService";

export default class HealthController {
    private readonly healthService;

    constructor(healthService: HealthService) {
        this.healthService = healthService;
    }

    check = (req: Request, res: Response) => {
        res.json(this.healthService.check());
    };
}
```

### Route (`src/routes/`)

Um arquivo `<recurso>.routes.ts` por recurso. Monta a cadeia de dependências (repository → service → controller) e registra os endpoints. `src/routes/index.ts` agrega todos os routers de recurso e é montado em `/api` no `app.ts`.

```ts
// src/routes/health.routes.ts
import { Router } from "express";
import HealthController from "../controllers/HealthController";
import HealthService from "../services/HealthService";

const router = Router();
const healthController = new HealthController(new HealthService());

router.get("/health", healthController.check);

export default router;
```

Quando um recurso precisar de Prisma, importe o singleton em vez de criar um `PrismaClient` novo:

```ts
import prismaClient from "../config/prisma";
import UserRepository from "../repositories/UserRepository";

const userRepository = new UserRepository(prismaClient);
```

## Convenções

- **Um arquivo por classe**, nome do arquivo = nome da classe (`PascalCase.ts`), `export default class`.
- Nenhuma camada pula a de baixo (controller nunca chama repository direto, service nunca importa Express/Prisma).
- Sem container de DI — a composição é explícita e manual no arquivo de rota.
- Erros: lançar na Service, nunca `try/catch` espalhado no controller — o `errorHandler` global (`src/middlewares/errorHandler.ts`) captura. Para entrada inválida, lançar `ValidationError` (`src/errors/ValidationError.ts`), que o middleware traduz em **400** com a mensagem do erro; qualquer outro `Error` vira **500** genérico com o stack no log. Criar novas subclasses em `src/errors/` quando surgir outro status.
- Variáveis de ambiente: `src/server.ts` carrega `dotenv/config`; nunca ler `process.env` fora de `server.ts`/`config/` — se um valor de config for necessário em outra camada, passar como parâmetro.
- Clientes de serviços externos ficam em `src/config/<provider>.ts` e são injetados por construtor (`prisma.ts`, `deepseek.ts`). Quando o SDK valida credencial no construtor — caso do `openai` —, exportar uma **factory** (`getDeepseekClient()`) em vez do cliente pronto: assim a falta da chave não derruba o servidor no boot, só falha a rota que usa aquele serviço.
- **Express 4 não encaminha rejeição de Promise para o `errorHandler`.** Handler que chama Service assíncrono precisa propagar na mão — `.then(...).catch(next)` (ver `OnboardingController`). Sem isso a requisição fica pendurada até dar timeout em vez de virar 500.

## Testes (`tests/`)

Testes ficam **fora de `src/`**, numa pasta própria `tests/` que espelha a estrutura de `src/` (ex.: `src/services/CalculoService.ts` → `tests/services/CalculoService.test.ts`). Isso mantém `src/` só com código de produção — o `tsconfig.json` principal (`rootDir: "src"`) não inclui `tests/`, então `npm run build`/`tsc --noEmit` não enxerga os testes.

O Jest usa um tsconfig próprio, `tsconfig.jest.json` (estende o principal, mas com `rootDir` aberto e `include: ["src", "tests"]`), configurado em `jest.config.js` via `transform`. Isso é necessário porque o TypeScript recusa compilar um arquivo fora do `rootDir` do projeto principal.

```bash
npm test              # roda tudo em tests/**/*.test.ts
```

Convenção de teste: `describe` pelo nome da classe, `it`/`it.each` descrevendo o comportamento em português, um arquivo de teste por classe, mesmo nome (`<Nome>.test.ts`).

## Estrutura de pastas

```
backend/
  prisma/
    schema.prisma        # datasource + generator + models
  src/
    config/
      prisma.ts           # PrismaClient singleton
      deepseek.ts         # cliente da IA (factory) + modelo
    controllers/
    services/
    repositories/
    errors/
      ValidationError.ts  # erro de entrada inválida -> 400 no errorHandler
    routes/
      index.ts            # agrega os routers de recurso, montado em /api
    middlewares/
      errorHandler.ts
      notFoundHandler.ts
    app.ts                 # cria o express app, registra middlewares/rotas
    server.ts              # bootstrap: carrega .env e sobe o listener
  tests/                   # espelha src/, só arquivos *.test.ts
  docker-compose.yml        # Postgres local (bodia/bodia/bodia, porta 5432)
  jest.config.js / tsconfig.jest.json
  .env / .env.example
```

## Como rodar

```bash
docker-compose up -d        # sobe o Postgres local
npm install
npm run prisma:generate     # gera o client a partir do schema.prisma
npm run dev                 # tsx watch — API em http://localhost:3333
```

`GET /api/health` → `{ status: "ok", timestamp: ... }` confirma que a API está de pé.

## Como adicionar um recurso novo

1. Modelar a entidade em `prisma/schema.prisma` e rodar `npm run prisma:migrate`.
2. Criar `src/repositories/<Nome>Repository.ts` (recebe `PrismaClient`, métodos de acesso a dados).
3. Criar `src/services/<Nome>Service.ts` (recebe o Repository, regra de negócio).
4. Criar `src/controllers/<Nome>Controller.ts` (recebe o Service, handlers HTTP).
5. Criar `src/routes/<nome>.routes.ts` (monta a cadeia e declara os endpoints) e registrar em `src/routes/index.ts`.
6. Criar `tests/<camada>/<Nome>.test.ts` cobrindo o que foi adicionado.

## Motor determinístico (`CalculoService`)

`src/services/CalculoService.ts` já implementa os cálculos exigidos pela fundamentação teórica: TMB (Mifflin-St Jeor), TDEE (fator de atividade), meta calórica por objetivo, distribuição de macronutrientes e estrutura de treino (split/frequência/volume por sessão). É um Service **sem Repository** (puro, não toca banco) — recebe `PerfilInput` e devolve `ResultadoCalculo`. Testado em `tests/services/CalculoService.test.ts`.

Quem o consome é o `OnboardingService`, que o recebe por construtor (composto em `routes/onboarding.routes.ts`). Regra da arquitetura, vinda da fundamentação teórica: **todo número sai daqui**. O LLM só redige em cima destes valores — nunca calcula.

## Integração com IA (`LlmService`)

`src/services/LlmService.ts` é a terceira camada da arquitetura híbrida (motor determinístico → RAG → LLM redator). Hoje é um wrapper mínimo: `enviarMensagem(texto)` manda uma mensagem e devolve o texto da resposta.

**O que existe hoje é só um teste de conexão** — `OnboardingService` chama a IA depois de calcular o plano e imprime a resposta no console, para provar que a integração funciona. Ainda **não há prompt de verdade**.

Configuração em `src/config/deepseek.ts`, alimentada por `DEEPSEEK_API_KEY` e `DEEPSEEK_MODEL` no `.env`. Sem a chave, o servidor sobe normal e só `POST /api/onboarding` falha com 500 (a mensagem no log diz o que configurar).

Nos testes o `LlmService` é sempre substituído por um fake — chamada real gastaria crédito e deixaria a suíte dependente de rede.

Falta construir (próxima etapa): o system prompt com as regras da fundamentação teórica (proibir o modelo de inventar ou recalcular número, citar os autores/Position Stands que embasam cada limite), a seleção de exercícios e alimentos a partir de tabelas, e o RAG.

## Endpoints

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/health` | Health check — confirma que a API está de pé. |
| `POST` | `/api/onboarding` | Recebe `{ conta, perfil }` do app, passa o `perfil` pelo `CalculoService` e **imprime o plano calculado no console** (é o contexto numérico que alimentará o prompt do LLM). Em seguida consulta a IA e imprime a resposta (teste de conexão). Responde `{ recebido: true }` — nem o plano nem o texto da IA vão na resposta ainda. Devolve **400** se o `perfil` faltar ou for inválido, e **500** se a IA falhar. Ainda **sem persistência** e sem validação campo a campo (o `req.body` é convertido por cast). |

## Próximos passos (fora do escopo desta etapa)

- Prompt real do LLM: system prompt com as regras da fundamentação teórica (não inventar número, citar os autores que embasam cada limite) e seleção de exercícios/alimentos a partir de tabelas.
- RAG: banco vetorial com a literatura científica para ancorar o texto gerado.
- Validação campo a campo do payload e retorno do plano na resposta HTTP (hoje só vai para o console).
- Modelagem do schema Prisma (usuário, perfil de onboarding, planos de treino/dieta) e persistência.
- Auth real (hash de senha com bcrypt, emissão/validação de JWT, middleware de autenticação).
- Catálogo de exercícios (para a divisão de treino sair de "estrutura numérica" para exercícios concretos).
