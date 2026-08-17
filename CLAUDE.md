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
// exemplo ilustrativo do padrão — não corresponde a um arquivo real
import { Request, Response } from "express";
import ExemploService from "../services/ExemploService";

export default class ExemploController {
    private readonly exemploService;

    constructor(exemploService: ExemploService) {
        this.exemploService = exemploService;
    }

    check = (req: Request, res: Response) => {
        res.json(this.exemploService.check());
    };
}
```

### Route (`src/routes/`)

Um arquivo `<recurso>.routes.ts` por recurso. Monta a cadeia de dependências (repository → service → controller) e registra os endpoints. `src/routes/index.ts` agrega todos os routers de recurso e é montado em `/api` no `app.ts`.

```ts
// exemplo ilustrativo do padrão — não corresponde a um arquivo real
import { Router } from "express";
import ExemploController from "../controllers/ExemploController";
import ExemploService from "../services/ExemploService";

const router = Router();
const exemploController = new ExemploController(new ExemploService());

router.get("/exemplo", exemploController.check);

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
    data/
      alimentos.ts        # GERADO por scripts/importar-taco.ts — não editar
      exercicios.ts       # catálogo escrito à mão
    routes/
      index.ts            # agrega os routers de recurso, montado em /api
    middlewares/
      errorHandler.ts
      notFoundHandler.ts
    app.ts                 # cria o express app, registra middlewares/rotas
    server.ts              # bootstrap: carrega .env e sobe o listener
  scripts/
    importar-taco.ts       # regenera src/data/alimentos.ts a partir da TACO
    deploy.sh              # roteiro executado NA EC2 pelo GitHub Actions
  .github/workflows/
    deploy.yml             # esteira: build + testes -> SSH -> PM2
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

## Deploy (CI/CD)

Todo push na `master` dispara `.github/workflows/deploy.yml`. A esteira tem dois jobs, e o segundo só existe se o primeiro passar:

```
push na master
      │
      ▼
┌─ job: test (runner do GitHub) ─┐   falhou? ──► deploy não roda,
│  npm ci                        │              a EC2 fica na versão antiga
│  npx prisma generate           │
│  npm run build   (tsc)         │
│  npm test        (jest)        │
└────────────────┬───────────────┘
                 │ passou
                 ▼
┌─ job: deploy (needs: test) ─────────────────┐
│  ssh <user>@<host> 'bash -s' < scripts/deploy.sh
│      git fetch + reset --hard origin/master │
│      npm ci                                 │
│      npx prisma generate                    │
│      npm run build                          │
│      npx prisma migrate deploy              │
│      pm2 reload <app> --update-env          │
└─────────────────────────────────────────────┘
```

`npx prisma generate` aparece antes do build **nos dois lados** porque `src/config/prisma.ts` e os repositories importam `@prisma/client`: sem o client gerado, o `tsc` não acha os tipos e a compilação falha. Em compensação o job de teste **não precisa de um Postgres de serviço** — nenhum arquivo em `tests/` toca o banco, os repositories são sempre substituídos por fake. Se um dia um teste passar a exigir banco de verdade, é aqui que entra um `services: postgres` no workflow.

O roteiro de deploy fica **versionado em `scripts/deploy.sh`** e é enviado por stdin (`bash -s`), não copiado para a máquina. Assim a EC2 executa a versão do script que veio junto do commit sendo publicado, e mudar o processo de deploy vira um commit revisável como qualquer outro.

Três decisões desse script que não devem ser desfeitas sem pensar:

- **`set -euo pipefail`** é o que torna o deploy seguro. Se `migrate deploy` falhar, o `pm2 reload` **não** acontece: o PM2 segue servindo o código antigo, que combina com o banco antigo. Sem o `-e`, o deploy seguiria em frente e subiria código esperando uma coluna que não existe.
- **`git reset --hard origin/master`**, não `git pull`. Se a árvore do servidor tiver divergido, o `pull` abriria um conflito e o deploy travaria esperando um input que não existe numa sessão não interativa. O `.env` **não** é afetado — está no `.gitignore`, então é arquivo não rastreado e o reset não encosta nele. As credenciais de produção vivem só na máquina, nunca no repositório nem nos secrets do CI.
- **`prisma migrate deploy`**, nunca `migrate dev`: só aplica as migrations pendentes, não gera migration nova nem reseta o banco. O `seed` **não** entra no deploy — mesmo sendo idempotente (`skipDuplicates`), popular catálogo é operação de instalação, não de publicação.

O passo de SSH é escrito à mão em vez de usar um action de terceiro: são cinco linhas e evita entregar a chave de produção a um action externo. O `known_hosts` vem de um secret, e não de um `ssh-keyscan` na hora — com o keyscan o CI aceitaria qualquer chave que o outro lado apresentasse, o que anula a proteção contra um host trocado.

### Secrets e variables do repositório

Em **Settings → Secrets and variables → Actions**:

| Nome | Tipo | Conteúdo |
|---|---|---|
| `SSH_HOST` | secret | IP elástico ou domínio da EC2 |
| `SSH_USER` | secret | usuário do deploy (`ubuntu` numa AMI Ubuntu) |
| `SSH_PRIVATE_KEY` | secret | chave privada dedicada ao CI, com as linhas `BEGIN`/`END` |
| `SSH_KNOWN_HOSTS` | secret | saída de `ssh-keyscan <host>` |
| `APP_DIR` | secret | caminho do clone na EC2 |
| `PM2_APP` | **variable** | nome do processo no PM2 — não é segredo, fica em Variables |

Gerar o par de chaves do CI (não reaproveitar o `.pem` da AWS, que dá acesso total e não pode ser revogado isoladamente):

```bash
ssh-keygen -t ed25519 -C "github-actions-bodia" -f ~/.ssh/bodia_ci -N ""
ssh-copy-id -i ~/.ssh/bodia_ci.pub <user>@<host>
cat ~/.ssh/bodia_ci     # → SSH_PRIVATE_KEY
ssh-keyscan <host>      # → SSH_KNOWN_HOSTS
```

### Cuidados conhecidos

- **O `tsc` roda na EC2 e consome memória.** Numa instância de 1 GB (`t2.micro`/`t3.micro`) o build pode ser morto pelo OOM killer — a pista é o job travar ou sair com `Killed`. Correção feita uma vez na máquina: 2 GB de swap (`fallocate` → `mkswap` → `swapon` → entrada no `/etc/fstab`).
- **`npm ci` apaga `node_modules` com o processo antigo no ar.** O Node já carregou seus módulos em memória e continua respondendo, mas um crash exatamente nessa janela deixaria o PM2 reiniciando sem dependências no disco. É a contrapartida de publicar por `git pull`; eliminar isso exigiria deploy em diretórios versionados com symlink.
- **`migrate deploy` não tem rollback.** Antes de publicar migration que remove coluna ou tabela, snapshot do volume/RDS.
- **O repositório é público**, por isso o `git fetch` na EC2 funciona sem credencial. Se ele for fechado, o deploy quebra até uma deploy key ser instalada na máquina.

Para publicar sem um commit novo (rollback manual, ou reexecutar um deploy que falhou por rede), use o botão **Run workflow** — o `workflow_dispatch` está habilitado. Disparado de outra branch, ele valida mas não publica.

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

## Geração do plano pela IA

O fluxo completo de `POST /api/onboarding` é:

```
CalculoService  →  CatalogoService  →  PromptService  →  LlmService  →  PlanoService (valida)
   os números       filtra restrições    monta o prompt     DeepSeek       confere as contas
```

`PlanoService.gerar()` orquestra tudo; `OnboardingService` chama ele e imprime três blocos no console: o plano calculado, o plano gerado pela IA e a conferência dos macros. **Nada é persistido ainda** — o banco entra numa etapa posterior.

### Catálogos (`src/data/`)

- `alimentos.ts` — 591 itens da TACO (NEPA/UNICAMP), macros por 100 g. **Arquivo gerado**: nunca editar à mão, rodar `npx tsx scripts/importar-taco.ts`. O script fica versionado para documentar a procedência dos dados.
- `exercicios.ts` — 100 exercícios escritos à mão. `sessoes` usa os mesmos nomes que `CalculoService.SPLIT_POR_DIAS` gera; `articulacoes` casa com os chips de restrição física do app.

Os `id` são estáveis e servirão de chave estrangeira quando as fichas forem persistidas.

### `CatalogoService` — a restrição é aplicada por código, não por instrução

Filtra os catálogos **antes** de montar o prompt. O modelo não recebe leite para escolher, em vez de receber e ser instruído a não escolher — ele não pode violar uma restrição sobre um alimento que nunca viu.

Regra ao mexer nas listas de exclusão: **falso positivo é aceitável, falso negativo não**. Remover um alimento seguro custa variedade; manter um proibido pode machucar alguém. A exceção `VEGETAIS_COM_NOME_DE_LATICINIO` existe porque "Couve, manteiga" é hortaliça e "Soja, queijo (tofu)" é vegano — sem ela, o filtro de lactose comeria a couve.

### `PromptService` — as três técnicas da fundamentação teórica (4.5.2)

1. **System prompt**: contrato de papel — o modelo é redator, proibido de recalcular, arredondar ou "corrigir" qualquer valor recebido, e de citar item fora das listas.
2. **Context injection**: valores do `CalculoService` + catálogos filtrados (formato compacto `id|nome|kcal|prot|carb|gord`).
3. **Few-shot**: exemplo do JSON de saída. A palavra "json" e o exemplo são **requisito do JSON mode da DeepSeek**, não escolha estética.

O system prompt cita a literatura que embasa cada limite (Pelland 2024, Schoenfeld 2016, ISSN/Jäger 2017, Stokes 2018, Kerksick 2017, Mifflin 1990). Isso não é enfeite acadêmico: explicar *por que* o número é aquele reduz a tentativa do modelo de "melhorar" o valor recebido — a alucinação de fidelidade de Zhang et al. (2024).

Há limites explícitos de volume (4–7 exercícios por sessão, 2–5 séries por exercício) porque **em teste real o modelo leu "18 séries por grupo na semana" como "18 séries deste exercício"** e montou sessões de 15 exercícios. Ao mexer no prompt, não remova esses limites.

### `PlanoService` — o número final nunca é aceito na palavra do modelo

Duas validações depois da resposta:
1. **IDs**: todo `alimentoId`/`exercicioId` precisa existir no catálogo *filtrado*. Id inexistente é alucinação; e, como o catálogo já passou pelo filtro, isso também barra um item proibido entrando pela porta dos fundos.
2. **Macros**: recalcula kcal e macros pela TACO × gramas propostas e mede o desvio contra a meta. `dentroDoLimite` usa 5% de tolerância.

Corrigir automaticamente quando o desvio estoura ainda **não** existe — esta etapa só mede.

### `LlmService` e a configuração

`gerarJson(system, user)` usa `response_format: json_object` e temperatura baixa (a fundamentação 4.2.3 trata a estocasticidade como problema de reprodutibilidade).

**`max_tokens: 32000` não é exagero.** O `deepseek-v4-pro` é modelo de raciocínio e os `reasoning_tokens` contam dentro desse limite — montar um plano gasta ~8k tokens só de raciocínio. Com teto baixo o raciocínio esgota a cota e a resposta volta **vazia**, não truncada. Por isso o erro de resposta vazia carrega `finish_reason` e `usage`: sem eles não dá para distinguir essa causa de uma falha do modelo.

Configuração em `src/config/deepseek.ts` (`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`). Sem a chave o servidor sobe normal e só esta rota falha com 500.

Nos testes o `LlmService` é **sempre** substituído por um fake — chamada real gastaria crédito e deixaria a suíte dependente de rede.

### Latência

Uma geração leva **~2 minutos** (≈19,5k tokens de entrada + ~8k de raciocínio). O timeout do axios no mobile está em 10s, então o app ainda **não** consegue consumir esta rota — resolver isso (geração em background, com o app consultando o resultado depois) é trabalho pendente.

## Endpoints

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/api/onboarding` | Recebe `{ conta, perfil }`, calcula o plano determinístico, gera treino e dieta com a IA e **imprime no console** o plano calculado, o plano gerado e a conferência dos macros. Responde `{ recebido: true }` — o plano ainda não vai na resposta nem é persistido. **400** se o `perfil` faltar ou for inválido; **500** se a IA falhar. Leva ~2 min. |

## Próximos passos (fora do escopo desta etapa)

- **Latência**: a rota leva ~2 min e o mobile tem timeout de 10s. Enquanto não houver geração em background, o app não consegue consumir esta rota.
- Retry automático quando `dentroDoLimite` for `false` (hoje o desvio é medido, mas nada é feito a respeito).
- Persistência: schema Prisma (usuário, perfil, fichas de treino/dieta) usando os `id` dos catálogos como FK.
- Retorno do plano na resposta HTTP (hoje só vai para o console) e exibição no app.
- Auth real (bcrypt + JWT) e validação campo a campo do payload.
