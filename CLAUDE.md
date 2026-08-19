# BodIA — Backend

API do BodIA. Stack: **TypeScript + Express + Prisma 6** (PostgreSQL), com **bcrypt** para hash de senha e **jsonwebtoken** reservado para quando a sessão real entrar. Hoje a API gera o plano (motor determinístico + IA), persiste o cadastro, devolve o plano ao app e registra a hidratação do dia — **ainda não há JWT nem validação campo a campo do payload**.

Qualquer recurso novo **deve seguir exatamente o padrão de camadas abaixo** — não introduzir um estilo diferente (ex.: lógica direto no controller, um ORM alternativo, um container de DI) sem alinhar antes.

## Stack

- **TypeScript** (strict mode) rodando com `tsx` em dev, compilado com `tsc` para produção
- **Express 4** — HTTP layer
- **Prisma 6** — ORM, PostgreSQL como banco (`docker-compose.yml` sobe um Postgres local)
- **bcrypt** — hash de senha, usado por `auth.service`
- **jsonwebtoken** — emissão/validação de token (reservado para quando existir auth)
- **cors**, **dotenv** — infraestrutura básica de app
- **Jest** (`ts-jest`) — testes
- **supertest** — testes de rota (`tests/app.smoke.test.ts`)
- **`openai` SDK** apontado para a **DeepSeek** (`deepseek-v4-pro`) — a API da DeepSeek é compatível com a interface Chat Completions da OpenAI, então o SDK oficial é reaproveitado só trocando a `baseURL`

## Arquitetura em camadas

```
Route → Controller → Service → Repository → PrismaClient
```

Cada camada só conhece a camada imediatamente abaixo. Toda dependência é passada via **construtor** (injeção de dependência manual — sem container/IoC, sem decorators). O ponto de composição (`new X(new Y(...))`) fica no arquivo de rota daquele recurso.

Fora dessa linha principal existem **colaboradores**: classes puras que um service injeta para não inchar. Ver "O que entra em `services/`" abaixo.

### Tipos (`src/types/`)

Interfaces e type aliases compartilhados por mais de uma camada. **Nenhuma classe.**

Existem porque tipo declarado junto da classe que o produz força dependência para cima: o repository precisa de `ResultadoCalculo` para gravar a ficha, e importá-lo do service faria o repository depender do service. Com os tipos aqui, `repositories/` e `data/` não importam nada de `services/`.

| Arquivo | O que guarda |
|---|---|
| `perfil.types.ts` | `PerfilInput`, `PerfilOnboardingInput`, `ContaInput`, `ResultadoCalculo` |
| `plano.types.ts` | `PlanoGerado`, `PlanoDTO`, `MeuPlano`, `Validacao`, `GeradorDePlano`, os payloads das rotas |
| `auth.types.ts` | `LoginInput`, `UsuarioAutenticado` |
| `registro.types.ts` | registros de refeição/hidratação/treino; refeição e treino ainda sem model no Prisma |
| `benchmark.types.ts` | só do endpoint temporário — sai junto com ele |

### Repository (`src/repositories/`)

Única camada que importa `PrismaClient`/`@prisma/client`. Encapsula o acesso a dados de **uma** entidade. Recebe o `PrismaClient` no construtor (nunca instancia um novo — sempre reutiliza o singleton de `src/config/prisma.ts`).

São dois: `user.repository.ts` (busca por e-mail e o create aninhado do cadastro inteiro) e `plan.repository.ts` (leitura do plano ativo).

```ts
// src/repositories/user.repository.ts
import { PrismaClient } from "@prisma/client";

export default class UserRepository {
    private readonly prismaClient;

    constructor(prismaClient: PrismaClient) {
        this.prismaClient = prismaClient;
    }
}
```

### Service (`src/services/`)

Contém a regra de negócio. Recebe o(s) Repository(ies) e colaboradores que precisa no construtor. Nunca importa `PrismaClient`/Express diretamente — não conhece HTTP nem banco, só a interface do repository.

**São oito, um por domínio.** Esta lista não cresce sem alinhar antes:

| Service | Domínio | Estado |
|---|---|---|
| `engine.service.ts` | motor determinístico: TMB, TDEE, meta calórica, macros, split | pronto |
| `auth.service.ts` | login e hash de senha | pronto (sem JWT) |
| `user.service.ts` | cadastro; futuramente atualização, exclusão e perfil | cadastro pronto |
| `plan.service.ts` | gerar, consultar e (via user) persistir o plano | pronto |
| `ai.service.ts` | comunicação com a DeepSeek: envia prompt, devolve resposta | pronto |
| `refeicao.service.ts` | registro/histórico de refeições | **esqueleto** |
| `hidratacao.service.ts` | registro/histórico de hidratação | pronto |
| `treino.service.ts` | registro de treino e exercícios | **esqueleto** |

Os **dois** esqueletos restantes (`refeicao`, `treino`) lançam `"não implementado"` e **não têm rota**: dependem de model que ainda não existe no `schema.prisma`. O que falta em cada um está no cabeçalho do arquivo.

`hidratacao.service` foi o primeiro a sair do esqueleto — o caminho que ele percorreu (model → migration → repository → controller → rota) é o roteiro dos outros dois.

### O que entra em `services/`

Só classe que é **ponto de entrada de um domínio**. O resto é colaborador e mora fora:

| Pasta | O que é | Exemplos |
|---|---|---|
| `mappers/` | tradução entre formato interno e contrato da API | `plano.mapper.ts` (escrita), `meu-plano.mapper.ts` (leitura), `perfil.mapper.ts` (string → enum) |
| `prompts/` | construção do prompt e o filtro que o alimenta | `plano.prompt.ts`, `catalogo.filter.ts` |
| `generators/` | quem monta o plano, atrás da interface `GeradorDePlano` | `plano-ia.generator.ts`, `plano-simulado.generator.ts`, `validador-macros.ts` |
| `benchmark/` | endpoint temporário, service + controller + rota juntos | `benchmark.*.ts` |

A regra prática: **se a classe não é chamada direto por um controller, provavelmente é colaborador.** Criar um service novo só porque uma classe ficou grande recria o problema que essa organização resolveu — services que não eram domínio nenhum.

`benchmark/` está isolado numa pasta de propósito: quando o caminho da IA estabilizar, sai a pasta inteira.

### Controller (`src/controllers/`)

Faz a ponte HTTP ↔ Service: lê `req`, chama o Service, escreve `res`. Não contém regra de negócio. Métodos que viram handler de rota são **arrow function properties** (garante o `this` correto quando passados direto pro Express, sem precisar de `.bind`).

Um controller por service que tem rota — hoje `auth`, `user` e `plan`.

```ts
// src/controllers/plan.controller.ts
import { NextFunction, Request, Response } from "express";

import PlanService from "../services/plan.service";

export default class PlanController {
    private readonly planService;

    constructor(planService: PlanService) {
        this.planService = planService;
    }

    buscar = (req: Request, res: Response, next: NextFunction) => {
        this.planService
            .consultar(req.params.usuarioId)
            .then((plano) => res.json(plano))
            .catch(next);
    };
}
```

### Route (`src/routes/`)

Um arquivo `<recurso>.routes.ts` por recurso (`auth`, `user`, `plan`). Monta a cadeia de dependências e registra os endpoints. `src/routes/index.ts` agrega os routers e é montado em `/api` no `app.ts`.

```ts
// src/routes/auth.routes.ts
import { Router } from "express";

import { bcryptRounds } from "../config/auth";
import prismaClient from "../config/prisma";
import AuthController from "../controllers/auth.controller";
import PerfilMapper from "../mappers/perfil.mapper";
import UserRepository from "../repositories/user.repository";
import AuthService from "../services/auth.service";

const router = Router();

const authController = new AuthController(
    new AuthService(new UserRepository(prismaClient, new PerfilMapper()), bcryptRounds),
);

router.post("/login", authController.entrar);

export default router;
```

Sempre importe o singleton do Prisma em vez de criar um `PrismaClient` novo.

## Convenções

- **Um arquivo por classe**, `export default class`. Nome do arquivo em **kebab-case com sufixo da camada** — `plan.service.ts`, `user.controller.ts`, `user.repository.ts`, `plano.mapper.ts`, `auth.routes.ts`, `validation.error.ts`. A classe dentro continua em PascalCase (`PlanService`) — é identificador TypeScript, não nome de arquivo.
- Nenhuma camada pula a de baixo (controller nunca chama repository direto, service nunca importa Express/Prisma).
- Sem container de DI — a composição é explícita e manual no arquivo de rota.
- **Tipo compartilhado vai para `src/types/`**, nunca exportado de um service. Tipo que só interessa ao próprio arquivo pode ficar nele.
- Erros: lançar na Service, nunca `try/catch` espalhado no controller — o `errorHandler` global (`src/middlewares/error-handler.ts`) captura. `ValidationError` → **400**, `AutenticacaoError` → **401**, `NaoEncontradoError` → **404**, `ConflitoError` → **409**; qualquer outro `Error` vira **500** genérico com o stack no log. Criar novas subclasses em `src/errors/` quando surgir outro status.
- Variáveis de ambiente: `src/server.ts` carrega `dotenv/config`; nunca ler `process.env` fora de `server.ts`/`config/` — se um valor de config for necessário em outra camada, passar como parâmetro.
- Clientes de serviços externos ficam em `src/config/<provider>.ts` e são injetados por construtor (`prisma.ts`, `deepseek.ts`). Quando o SDK valida credencial no construtor — caso do `openai` —, exportar uma **factory** (`getDeepseekClient()`) em vez do cliente pronto: assim a falta da chave não derruba o servidor no boot, só falha a rota que usa aquele serviço.
- **Express 4 não encaminha rejeição de Promise para o `errorHandler`.** Handler que chama Service assíncrono precisa propagar na mão — `.then(...).catch(next)` (ver `plan.controller.ts`). Sem isso a requisição fica pendurada até dar timeout em vez de virar 500.

## Testes (`tests/`)

Testes ficam **fora de `src/`**, numa pasta própria `tests/` que espelha a estrutura de `src/` (ex.: `src/services/engine.service.ts` → `tests/services/engine.service.test.ts`). Isso mantém `src/` só com código de produção — o `tsconfig.json` principal (`rootDir: "src"`) não inclui `tests/`, então `npm run build`/`tsc --noEmit` não enxerga os testes.

O Jest usa um tsconfig próprio, `tsconfig.jest.json` (estende o principal, mas com `rootDir` aberto e `include: ["src", "tests"]`), configurado em `jest.config.js` via `transform`. Isso é necessário porque o TypeScript recusa compilar um arquivo fora do `rootDir` do projeto principal.

```bash
npm test              # roda tudo em tests/**/*.test.ts
```

Convenção de teste: `describe` pelo nome da classe, `it`/`it.each` descrevendo o comportamento em português, um arquivo de teste por classe, mesmo nome (`<arquivo>.test.ts`).

**`tests/app.smoke.test.ts` é o único que exercita o app inteiro** — `app.ts`, a composição de dependências dos arquivos de rota, o `errorHandler` e o `notFoundHandler`. Os demais são unitários com fakes e, por isso, não pegam erro de wiring: um refactor pode compilar, passar em todos eles e ainda assim quebrar todos os endpoints.

Ele não toca no banco — as rotas que cobre ou não usam Prisma, ou falham na validação antes de chegar nele. Para as que precisam de banco, ele percorre o router do Express e confere que a rota continua **registrada**; a ausência de uma rota é detectável mesmo sem poder chamá-la.

**Ao adicionar uma rota, acrescente-a à lista desse teste.**

## Estrutura de pastas

```
backend/
  prisma/
    schema.prisma            # datasource + generator + models
  src/
    config/
      prisma.ts               # PrismaClient singleton
      deepseek.ts             # cliente da IA (factory) + modelo + flag SIMULAR_IA
      auth.ts                 # custo do bcrypt
      fuso.ts                 # recorte do dia no fuso do usuário (America/Sao_Paulo)
    types/                    # interfaces compartilhadas — nenhuma classe
      perfil.types.ts  plano.types.ts  auth.types.ts
      registro.types.ts  benchmark.types.ts
    services/                 # OITO, um por domínio
      engine.service.ts       # motor determinístico (puro)
      auth.service.ts         # login + hash de senha
      user.service.ts         # cadastro
      plan.service.ts         # gerar e consultar o plano
      ai.service.ts           # adaptador DeepSeek
      refeicao.service.ts     # esqueleto — falta model
      hidratacao.service.ts   # registro de água do dia
      treino.service.ts       # esqueleto — falta model
    generators/               # quem monta o plano (interface GeradorDePlano)
      plano-ia.generator.ts   plano-simulado.generator.ts
      validador-macros.ts     # conferência de macros, usada pelos dois
    mappers/
      plano.mapper.ts         # plano cru -> PlanoDTO (escrita)
      meu-plano.mapper.ts     # banco -> MeuPlano (leitura)
      perfil.mapper.ts        # string do app -> enum do Prisma
    prompts/
      plano.prompt.ts         # system + user do LLM
      catalogo.filter.ts      # aplica as restrições ANTES do prompt
    repositories/
      user.repository.ts      plan.repository.ts
      hidratacao.repository.ts
    controllers/
      auth.controller.ts      user.controller.ts      plan.controller.ts
      hidratacao.controller.ts
    routes/
      auth.routes.ts  user.routes.ts  plan.routes.ts  hidratacao.routes.ts
      index.ts                # agrega os routers, montado em /api
    benchmark/                # endpoint TEMPORÁRIO, isolado
      benchmark.service.ts    benchmark.controller.ts   benchmark.routes.ts
    errors/
      validation.error.ts     autenticacao.error.ts
      nao-encontrado.error.ts conflito.error.ts
    data/
      alimentos.ts            # GERADO por scripts/importar-taco.ts — não editar
      exercicios.ts           # catálogo escrito à mão
      plano-simulado.ts       # fixture usado quando SIMULAR_IA=true
    middlewares/
      error-handler.ts        not-found-handler.ts
    app.ts                    # cria o express app, registra middlewares/rotas
    server.ts                 # bootstrap: carrega .env e sobe o listener
  scripts/
    importar-taco.ts          # regenera src/data/alimentos.ts a partir da TACO
    deploy.sh                 # roteiro executado NA EC2 pelo GitHub Actions
  .github/workflows/
    deploy.yml                # esteira: build + testes -> SSH -> PM2
  tests/                      # espelha src/, só arquivos *.test.ts
  docker-compose.yml          # Postgres local (bodia/bodia/bodia, porta 5432)
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

Antes de criar um service, confira se o recurso não pertence a um dos oito que já existem — o padrão é **estender um domínio**, não abrir outro.

1. Modelar a entidade em `prisma/schema.prisma` e rodar `npm run prisma:migrate`.
2. Declarar os tipos compartilhados em `src/types/<dominio>.types.ts`.
3. Criar `src/repositories/<dominio>.repository.ts` (recebe `PrismaClient`, métodos de acesso a dados).
4. Estender o service do domínio, ou — se for domínio novo mesmo — criar `src/services/<dominio>.service.ts`.
5. Criar/estender `src/controllers/<dominio>.controller.ts` e `src/routes/<dominio>.routes.ts`, registrando em `src/routes/index.ts`.
6. Criar `tests/<camada>/<arquivo>.test.ts` cobrindo o que foi adicionado, e acrescentar a rota nova à lista de `tests/app.smoke.test.ts`.

Se a lógica nova é tradução de formato, construção de prompt ou uma estratégia intercambiável, ela é **colaborador** — vai para `mappers/`, `prompts/` ou `generators/`, não para `services/`.

## Motor determinístico (`engine.service.ts`)

`src/services/engine.service.ts` implementa os cálculos exigidos pela fundamentação teórica: TMB (Mifflin-St Jeor), TDEE (fator de atividade), meta calórica por objetivo, distribuição de macronutrientes e estrutura de treino (split/frequência/volume por sessão). É um Service **sem Repository** (puro, não toca banco) — recebe `PerfilInput` e devolve `ResultadoCalculo`. Testado em `tests/services/engine.service.test.ts`.

Consumido por `plan.service` (gerar), `user.service` (recalcular no cadastro) e pelo benchmark. Regra da arquitetura, vinda da fundamentação teórica: **todo número sai daqui**. O LLM só redige em cima destes valores — nunca calcula.

### Distribuição por refeição

`numeroRefeicoes` (inteiro **de 3 a 6**, obrigatório no `PerfilInput`) é escolhido pelo usuário no onboarding e diz em quantas partes o dia é dividido. Como cada parte é dividida está em `DISTRIBUICAO_REFEICOES`, uma tabela fixa no `engine.service`:

| Refeições | Distribuição |
|---|---|
| 3 | Café 25% · Almoço 40% · Jantar 35% |
| 4 | Café 20% · Almoço 35% · Lanche da tarde 15% · Jantar 30% |
| 5 | Café 20% · Lanche manhã 10% · Almoço 35% · Lanche tarde 10% · Jantar 25% |
| 6 | Café 20% · Lanche manhã 10% · Almoço 30% · Lanche tarde 10% · Jantar 20% · Ceia 10% |

A quantidade é do usuário, a repartição é da tabela — **nenhuma das duas é decisão do LLM**, que recebe kcal e os três macros já prontos por refeição. A última refeição do dia recebe o *restante* em vez do seu percentual, para a soma das partes fechar exatamente o total do dia sem o centavo perdido no arredondamento de cada fatia.

Os nomes precisam continuar batendo com `HORARIO_POR_REFEICAO` (`mappers/plano.mapper.ts`), que é quem casa o horário sugerido, e com `DISTRIBUICAO_TEXT` na tela `OnboardingRefeicoesScreen` do mobile, que mostra os percentuais ao usuário.

## Geração do plano pela IA

O fluxo completo de `POST /api/onboarding` é:

```
engine.service → catalogo.filter → plano.prompt → ai.service → validador-macros
  os números      filtra restrições  monta o prompt   DeepSeek     confere as contas
```

Quem encadeia tudo é `plano-ia.generator.ts`; quem o chama é `plan.service.gerar()`.

`plan.service.gerar()` orquestra tudo e imprime três blocos no console: o plano calculado, a conferência dos macros e o plano enviado ao app. O plano volta na resposta HTTP e **só é persistido quando o usuário aprova**, num segundo POST (`/api/cadastro`, `user.service`).

### Catálogos (`src/data/`)

- `alimentos.ts` — 591 itens da TACO (NEPA/UNICAMP), macros por 100 g. **Arquivo gerado**: nunca editar à mão, rodar `npx tsx scripts/importar-taco.ts`. O script fica versionado para documentar a procedência dos dados.
- `exercicios.ts` — 100 exercícios escritos à mão. `sessoes` usa os mesmos nomes que `EngineService.SPLIT_POR_DIAS` gera; `articulacoes` casa com os chips de restrição física do app.

Os `id` são estáveis e servirão de chave estrangeira quando as fichas forem persistidas.

### `catalogo.filter.ts` — a restrição é aplicada por código, não por instrução

Filtra os catálogos **antes** de montar o prompt. O modelo não recebe leite para escolher, em vez de receber e ser instruído a não escolher — ele não pode violar uma restrição sobre um alimento que nunca viu.

Regra ao mexer nas listas de exclusão: **falso positivo é aceitável, falso negativo não**. Remover um alimento seguro custa variedade; manter um proibido pode machucar alguém. A exceção `VEGETAIS_COM_NOME_DE_LATICINIO` existe porque "Couve, manteiga" é hortaliça e "Soja, queijo (tofu)" é vegano — sem ela, o filtro de lactose comeria a couve.

### `plano.prompt.ts` — as três técnicas da fundamentação teórica (4.5.2)

1. **System prompt**: contrato de papel — o modelo é redator, proibido de recalcular, arredondar ou "corrigir" qualquer valor recebido, e de citar item fora das listas.
2. **Context injection**: valores do `engine.service` + catálogos filtrados (formato compacto `id|nome|kcal|prot|carb|gord`). Inclui a meta completa (kcal + 3 macros) de **cada refeição**, com os nomes que o modelo deve usar — ver "Distribuição por refeição".
3. **Few-shot**: exemplo do JSON de saída. A palavra "json" e o exemplo são **requisito do JSON mode da DeepSeek**, não escolha estética.

O system prompt cita a literatura que embasa cada limite (Pelland 2024, Schoenfeld 2016, ISSN/Jäger 2017, Stokes 2018, Kerksick 2017, Mifflin 1990). Isso não é enfeite acadêmico: explicar *por que* o número é aquele reduz a tentativa do modelo de "melhorar" o valor recebido — a alucinação de fidelidade de Zhang et al. (2024).

Há limites explícitos de volume (4–7 exercícios por sessão, 2–5 séries por exercício) porque **em teste real o modelo leu "18 séries por grupo na semana" como "18 séries deste exercício"** e montou sessões de 15 exercícios. Ao mexer no prompt, não remova esses limites.

### `plano-ia.generator.ts` — o número final nunca é aceito na palavra do modelo

Duas validações depois da resposta:
1. **IDs**: todo `alimentoId`/`exercicioId` precisa existir no catálogo *filtrado*. Id inexistente é alucinação; e, como o catálogo já passou pelo filtro, isso também barra um item proibido entrando pela porta dos fundos.
2. **Macros**: recalcula kcal e macros pela TACO × gramas propostas e mede o desvio contra a meta. `dentroDoLimite` usa 5% de tolerância. A conta mora em `generators/validador-macros.ts` e é a MESMA para a IA e para o fixture — antes havia uma cópia em cada, e corrigir uma deixava a outra medindo diferente.

Corrigir automaticamente quando o desvio estoura ainda **não** existe — esta etapa só mede.

### `ai.service.ts` e a configuração

`gerarJson(system, user)` usa `response_format: json_object` e temperatura baixa (a fundamentação 4.2.3 trata a estocasticidade como problema de reprodutibilidade).

**`max_tokens: 32000` não é exagero.** O `deepseek-v4-pro` é modelo de raciocínio e os `reasoning_tokens` contam dentro desse limite — montar um plano gasta ~8k tokens só de raciocínio. Com teto baixo o raciocínio esgota a cota e a resposta volta **vazia**, não truncada. Por isso o erro de resposta vazia carrega `finish_reason` e `usage`: sem eles não dá para distinguir essa causa de uma falha do modelo.

Configuração em `src/config/deepseek.ts` (`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `SIMULAR_IA`). Sem a chave o servidor sobe normal e só esta rota falha com 500.

**`SIMULAR_IA` decide quem monta o plano** e vem **ligada** por padrão: com ela, `plano-simulado.generator` devolve o fixture de `src/data/plano-simulado.ts` em vez de chamar a DeepSeek. O caminho da IA continua inteiro e volta com `SIMULAR_IA=false` — está desligado por causa da latência (~3 min) e das falhas por raciocínio descontrolado, não por estar quebrado. A troca é feita na composição da rota (`plan.routes.ts`), atrás da interface `GeradorDePlano`; o `plan.service` não sabe qual dos dois recebeu.

Nos testes o `ai.service` é **sempre** substituído por um fake — chamada real gastaria crédito e deixaria a suíte dependente de rede.

### Latência

Uma geração leva **~2 minutos** (≈19,5k tokens de entrada + ~8k de raciocínio). O timeout do axios no mobile está em 10s, então o app ainda **não** consegue consumir esta rota — resolver isso (geração em background, com o app consultando o resultado depois) é trabalho pendente.

## Endpoints

| Método | Rota | Corpo / Resposta | Erros |
|---|---|---|---|
| `POST` | `/api/onboarding` | `{ conta, perfil }` → **200** `{ plano }` com metas, treino e dieta prontos para a tela. Nada é persistido. `perfil.numeroRefeicoes` (3–6) é obrigatório. | **400** perfil ausente ou inválido; **500** se a IA falhar |
| `POST` | `/api/cadastro` | `{ conta, perfil, plano }` → **201** `{ usuarioId }`. Grava usuário, peso, restrições e as duas fichas numa transação. | **400** sem perfil ou sem plano; **409** e-mail já cadastrado |
| `POST` | `/api/login` | `{ email, senha }` → **200** `{ usuarioId, nome, sobrenome, email }` | **401** credencial inválida (mesma mensagem para e-mail inexistente e senha errada) |
| `GET` | `/api/plano/:usuarioId` | → **200** o plano ativo no formato das telas (Home, Treino, Dieta, Perfil) | **404** usuário inexistente ou sem plano ativo |
| `POST` | `/api/hidratacao` | `{ usuarioId, volumeMl }` → **201** `{ dia, totalMl, metaMl, registros }`. Registra água e devolve o dia já somado. | **400** volumeMl fora de 1–5000 ou não inteiro; **404** usuário sem plano ativo |
| `GET` | `/api/hidratacao/:usuarioId` | `?dia=AAAA-MM-DD` opcional (default hoje) → **200** mesmo formato | **400** dia mal formatado; **404** usuário sem plano ativo |
| `DELETE` | `/api/hidratacao/:usuarioId/:registroId` | Desfaz um registro → **200** mesmo formato | **404** registro inexistente **ou de outro usuário** |
| `GET` | `/api/teste-geracao` | Benchmark **temporário**: chama a IA de verdade com perfil fictício fixo e devolve tempo, tokens e validação. Ignora `SIMULAR_IA` de propósito. | devolve `success: false` no corpo em vez de lançar |

O onboarding é instantâneo com `SIMULAR_IA=true` (padrão). Com `SIMULAR_IA=false` leva ~3 min — ver "Latência".

O `usuarioId` na URL do plano é limitação conhecida: sem JWT, quem descobrir um id lê o plano alheio. Sai quando a autenticação real entrar.

Nas rotas de hidratação o mesmo buraco é **pior**, porque ali não se lê: se **escreve e se apaga** no histórico alheio. O `usuarioId` no path do `DELETE` não é decoração — é ele que o repository usa no `where` para impedir que um registroId sozinho apague linha de outra pessoa. Registro inexistente e registro alheio devolvem os dois **404**, nunca 403: um 403 confirmaria a existência do registro do outro.

### Por que o dia é recortado no servidor (`config/fuso.ts`)

`RegistroHidratacao` guarda só o instante (UTC). O dia a que ele pertence é calculado na leitura, com offset fixo de **America/Sao_Paulo (−3)**.

Isso existe porque o servidor roda em UTC e o usuário não: uma ceia às 22h em Brasília é 01h UTC do **dia seguinte**, então cortar pela data UTC gravaria a água da noite no dia errado. O app **não envia data** — a regra é uma só, e fica no servidor.

Não há coluna `dia` de propósito: ela seria derivada de `registradoEm` mais o fuso, e duas cópias do mesmo fato divergem (a mesma razão pela qual o peso atual não é campo em `Usuario`).

Limitação assumida: quem estiver em Manaus (−4), no Acre (−5) ou viajando tem o dia recortado pelo relógio de São Paulo. Consertar exige guardar o fuso de cada usuário.

## Próximos passos

- **Auth real**: JWT em `auth.service` (o `jsonwebtoken` já está instalado) e o `usuarioId` saindo da URL do plano.
- **Validação campo a campo do payload** — hoje só o perfil é validado, dentro do `engine.service`.
- **Latência**: a rota da IA leva ~3 min e o mobile tem timeout de 210s. É o motivo de `SIMULAR_IA` existir. Resolver de verdade exige geração em background com o app consultando o resultado depois.
- **Retry automático** quando `dentroDoLimite` for `false` (hoje o desvio é medido, mas nada é feito a respeito).
- **Os dois services de registro restantes** (`refeicao`, `treino`): criar os models no `schema.prisma`, os repositories, os controllers e as rotas, no mesmo caminho que `hidratacao` já percorreu. Ambos reusam `config/fuso.ts` para o recorte do dia — não reimplementar a janela.
- **Escrita sem autenticação**: as rotas de hidratação aceitam o `usuarioId` do payload/URL. Enquanto não houver JWT, qualquer um que descubra um id grava e apaga no histórico daquela pessoa.
- **`ultimoPesoKg` na tabela errada**: o campo vive em `ExercicioSessao`, que pertence à ficha. Gerar plano novo cria ficha nova com o campo nulo, e o usuário perde a carga de todos os exercícios. A carga é atributo do par (usuário, exercício do catálogo) — precisa mudar de lugar antes de o registro de treino entrar.
- **Remover `benchmark/`** quando o caminho da IA estabilizar.
