# BodIA — Backend

API do BodIA. Stack: **TypeScript + Express + Prisma 6** (PostgreSQL), com **bcrypt** para hash de senha e **JWT** para a sessão. A API gera o plano (motor determinístico + IA), persiste o cadastro, devolve o plano ao app, registra hidratação, refeições, treinos executados e peso, edita o perfil, regenera o plano e exclui a conta. **Toda rota que toca dado de usuário exige `Authorization: Bearer`** — o `usuarioId` sai do token, nunca do payload nem da URL.

Qualquer recurso novo **deve seguir exatamente o padrão de camadas abaixo** — não introduzir um estilo diferente (ex.: lógica direto no controller, um ORM alternativo, um container de DI) sem alinhar antes.

## Stack

- **TypeScript** (strict mode) rodando com `tsx` em dev, compilado com `tsc` para produção
- **Express 4** — HTTP layer
- **Prisma 6** — ORM, PostgreSQL como banco (`docker-compose.yml` sobe um Postgres local)
- **bcrypt** — hash de senha, usado por `auth.service`
- **jsonwebtoken** — emissão e validação do token de sessão (`config/jwt.ts` + `middlewares/autenticacao.ts`)
- **helmet**, **express-rate-limit** — cabeçalhos de segurança e limite por IP (RNF11)
- **cors**, **dotenv** — infraestrutura básica de app
- **Jest** (`ts-jest`) — testes
- **supertest** — testes de rota (`tests/app.smoke.test.ts`)
- **`openai` SDK** — hoje na **OpenAI**, modelo padrão `gpt-4o-mini` (`IA_MODEL`). O provider é configurável (`IA_BASE_URL`): DeepSeek e Gemini expõem endpoints compatíveis com Chat Completions, então o mesmo SDK serve os três

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
| `registro.types.ts` | registros de refeição/hidratação/treino; só o treino ainda sem model no Prisma |
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
| `auth.service.ts` | login, hash de senha, emissão do token | pronto |
| `user.service.ts` | cadastro, perfil, peso + recálculo, exclusão de conta | pronto |
| `plan.service.ts` | gerar, consultar, regenerar o plano | pronto |
| `ai.service.ts` | comunicação com a IA: envia prompt, devolve resposta | pronto |
| `refeicao.service.ts` | registro/histórico de refeições | pronto |
| `hidratacao.service.ts` | registro/histórico de hidratação | pronto |
| `treino.service.ts` | treino executado: abrir, concluir, consultar | pronto |

Os oito estão implementados. O `treino.service` foi o último a sair do esqueleto e percorreu o mesmo caminho que `hidratacao` e `refeicao` já haviam percorrido — model → migration → repository → service → controller → rota → serviço no mobile.

### O que entra em `services/`

Só classe que é **ponto de entrada de um domínio**. O resto é colaborador e mora fora:

| Pasta | O que é | Exemplos |
|---|---|---|
| `mappers/` | tradução entre formato interno e contrato da API | `plano.mapper.ts` (escrita), `meu-plano.mapper.ts` (leitura), `perfil.mapper.ts` (string → enum) |
| `prompts/` | construção dos prompts e o filtro que os alimenta | `dieta-selecao.prompt.ts`, `treino.prompt.ts`, `catalogo.filter.ts` |
| `generators/` | quem monta o plano, atrás da interface `GeradorDePlano` | `plano-ia.generator.ts` (orquestra), `dieta-ia.generator.ts`, `treino-ia.generator.ts`, `plano-simulado.generator.ts`, `validador-macros.ts`, `validador-volume.ts` |
| `benchmark/` | endpoint temporário, service + controller + rota juntos | `benchmark.*.ts` |

A regra prática: **se a classe não é chamada direto por um controller, provavelmente é colaborador.** Criar um service novo só porque uma classe ficou grande recria o problema que essa organização resolveu — services que não eram domínio nenhum.

`benchmark/` está isolado numa pasta de propósito: quando o caminho da IA estabilizar, sai a pasta inteira.

### Controller (`src/controllers/`)

Faz a ponte HTTP ↔ Service: lê `req`, chama o Service, escreve `res`. Não contém regra de negócio. Métodos que viram handler de rota são **arrow function properties** (garante o `this` correto quando passados direto pro Express, sem precisar de `.bind`).

Um controller por service que tem rota — `auth`, `user`, `plan`, `hidratacao`, `refeicao` e `treino`.

O `usuarioId` vem sempre de `usuarioAutenticado(req)` (`middlewares/autenticacao.ts`), nunca de `req.body` nem de `req.params`. A função existe porque `Express.Request.usuarioId` é opcional: sem ela, cada controller precisaria de um `!`, e um `!` errado manda `undefined` para o `where` do Prisma, que não acha nada e devolve 404 em vez de acusar o problema.

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
- Clientes de serviços externos ficam em `src/config/<provider>.ts` e são injetados por construtor (`prisma.ts`). Quando o SDK valida credencial no construtor — caso do `openai` —, exportar uma **factory** (`getIaClient()`) em vez do cliente pronto: assim a falta da chave não derruba o servidor no boot, só falha a rota que usa aquele serviço.
- **`config/ia.ts` é exceção deliberada a essa regra de nome.** O projeto trocou de provider três vezes (DeepSeek → Gemini → OpenAI) em pouco tempo, então o provider virou valor de **configuração** (`IA_BASE_URL`, `IA_MODEL`), não identidade do código — trocar de novo é editar o `.env`. Não renomear para `openai.ts`: isso desfaz a portabilidade.
- **Express 4 não encaminha rejeição de Promise para o `errorHandler`.** Handler que chama Service assíncrono precisa propagar na mão — `.then(...).catch(next)` (ver `plan.controller.ts`). Sem isso a requisição fica pendurada até dar timeout em vez de virar 500.

## Testes (`tests/`)

Testes ficam **fora de `src/`**, numa pasta própria `tests/` que espelha a estrutura de `src/` (ex.: `src/services/engine.service.ts` → `tests/services/engine.service.test.ts`). Isso mantém `src/` só com código de produção — o `tsconfig.json` principal (`rootDir: "src"`) não inclui `tests/`, então `npm run build`/`tsc --noEmit` não enxerga os testes.

O Jest usa um tsconfig próprio, `tsconfig.jest.json` (estende o principal, mas com `rootDir` aberto e `include: ["src", "tests"]`), configurado em `jest.config.js` via `transform`. Isso é necessário porque o TypeScript recusa compilar um arquivo fora do `rootDir` do projeto principal.

```bash
npm test              # roda tudo em tests/**/*.test.ts
```

Convenção de teste: `describe` pelo nome da classe, `it`/`it.each` descrevendo o comportamento em português, um arquivo de teste por classe, mesmo nome (`<arquivo>.test.ts`).

`tests/setup.ts` roda **antes de qualquer módulo ser importado** (`setupFiles`). Existe porque `config/jwt.ts` lê `JWT_SECRET` no momento em que é carregado, e definir a variável dentro de um `beforeAll` seria tarde demais — o import já teria acontecido.

**`tests/app.smoke.test.ts` é o único que exercita o app inteiro** — `app.ts`, a composição de dependências dos arquivos de rota, o `errorHandler` e o `notFoundHandler`. Os demais são unitários com fakes e, por isso, não pegam erro de wiring: um refactor pode compilar, passar em todos eles e ainda assim quebrar todos os endpoints.

Ele não toca no banco — as rotas que cobre ou não usam Prisma, ou falham na validação antes de chegar nele. Para as que precisam de banco, ele percorre o router do Express e confere que a rota continua **registrada**; a ausência de uma rota é detectável mesmo sem poder chamá-la.

**Ao adicionar uma rota, acrescente-a à lista desse teste** — e, se ela for autenticada, ao `it.each` que confere o **401 sem token**. A rota que perde o middleware num refactor continua respondendo 200 em todo teste unitário; só ali o buraco aparece.

## Estrutura de pastas

```
backend/
  prisma/
    schema.prisma            # datasource + generator + models
  src/
    config/
      prisma.ts               # PrismaClient singleton
      ia.ts                   # cliente da IA (factory) + modelo + flag SIMULAR_IA
      auth.ts                 # custo do bcrypt
      fuso.ts                 # recorte do dia no fuso do usuário (America/Sao_Paulo)
    types/                    # interfaces compartilhadas — nenhuma classe
      perfil.types.ts  plano.types.ts  auth.types.ts
      registro.types.ts  benchmark.types.ts
      express.d.ts            # req.usuarioId, preenchido pelo middleware
    services/                 # OITO, um por domínio
      engine.service.ts       # motor determinístico (puro)
      auth.service.ts         # login + hash de senha
      user.service.ts         # cadastro
      plan.service.ts         # gerar e consultar o plano
      ai.service.ts           # adaptador do provider de IA
      refeicao.service.ts     # refeições marcadas como comidas
      hidratacao.service.ts   # registro de água do dia
      treino.service.ts       # esqueleto — falta model
    generators/               # quem monta o plano (interface GeradorDePlano)
      plano-ia.generator.ts   # orquestra as 3 chamadas, dieta e treino em paralelo
      dieta-ia.generator.ts   # chamadas 1 e 2 (seleção -> quantidades)
      treino-ia.generator.ts  # chamada 3
      plano-simulado.generator.ts
      validador-macros.ts     # confere kcal/macros contra a TACO
      validador-volume.ts     # confere séries por grupo contra o orçamento
      porcoes.solver.ts       # as gramas de cada refeição, sem IA
      ajuste-selecao.ts       # o desvio medido, em linguagem de escolha de alimento
    mappers/
      plano.mapper.ts         # plano cru -> PlanoDTO (escrita)
      meu-plano.mapper.ts     # banco -> MeuPlano (leitura)
      perfil.mapper.ts        # string do app <-> enum do Prisma (ida e volta)
      ficha.mapper.ts         # plano -> as duas fichas (cadastro E regeneração)
      conferencia.mapper.ts   # validadores -> o que a tela de revisão mostra
    prompts/
      dieta-selecao.prompt.ts      # chamada 1: quais alimentos, sem gramas
      treino.prompt.ts             # chamada 3: o treino
      padrao-refeicoes.ts          # como é cada refeição no Brasil (dado)
      prompt.types.ts              # o par { system, user }
      catalogo.filter.ts           # aplica as restrições ANTES do prompt
    repositories/
      user.repository.ts      plan.repository.ts      peso.repository.ts
      hidratacao.repository.ts  refeicao.repository.ts  treino.repository.ts
    controllers/
      auth.controller.ts      user.controller.ts      plan.controller.ts
      hidratacao.controller.ts  refeicao.controller.ts  treino.controller.ts
    routes/
      auth.routes.ts  user.routes.ts  plan.routes.ts
      hidratacao.routes.ts  refeicao.routes.ts  treino.routes.ts
      index.ts                # agrega os routers, montado em /api
    benchmark/                # endpoint TEMPORÁRIO, isolado
      benchmark.service.ts    benchmark.controller.ts   benchmark.routes.ts
    errors/
      validation.error.ts     autenticacao.error.ts
      nao-encontrado.error.ts conflito.error.ts
    data/
      alimentos.ts            # GERADO por scripts/importar-taco.ts — não editar
      exercicios.ts           # catálogo escrito à mão
      volume-treino.ts        # limites e política de volume (primário/secundário)
      limites-seguranca.ts    # pisos e tetos dos cálculos (RF17)
      porcoes.ts              # papel e faixa de porção de cada alimento
      hidratacao.ts           # ml por kg por nível de atividade
      descanso-treino.ts      # intervalo de descanso por exercício
      plano-simulado.ts       # fixture usado quando SIMULAR_IA=true
    middlewares/
      error-handler.ts        not-found-handler.ts
      autenticacao.ts         # exige o Bearer e injeta req.usuarioId
    app.ts                    # cria o express app, registra middlewares/rotas
    server.ts                 # bootstrap: carrega .env e sobe o listener
  scripts/
    importar-taco.ts          # regenera src/data/alimentos.ts a partir da TACO
    deploy.sh                 # roteiro executado NA EC2 pelo GitHub Actions
  .github/workflows/
    deploy.yml                # esteira: build + testes -> SSH -> PM2
  tests/                      # espelha src/, só arquivos *.test.ts
    setup.ts                  # env que os módulos de config leem na CARGA
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

O passo de SSH é escrito à mão em vez de usar um action de terceiro: são cinco linhas e evita entregar a chave de produção a um action externo. A chave pública do host é **fixada** em `SSH_HOST_KEY`, e não descoberta por um `ssh-keyscan` na hora — com o keyscan o CI aceitaria qualquer chave que o outro lado apresentasse, o que anula a proteção contra um host trocado.

O `known_hosts` é **montado no runner** com o mesmo `$SSH_HOST` usado na conexão:

```bash
printf '%s %s\n' "$SSH_HOST" "$SSH_HOST_KEY" > ~/.ssh/known_hosts
```

Antes o arquivo inteiro vinha pronto num secret (`SSH_KNOWN_HOSTS`), e isso embutia o nome do host **dentro** dele — sem nada garantir que fosse o mesmo de `SSH_HOST`. Domínio de um lado e IP do outro, ou um IP antigo depois de recriar a EC2, e o ssh não achava entrada nenhuma: `No ED25519 host key is known for ***`. Montando a linha na hora, o nome casa por construção e só a chave precisa ser mantida.

### Secrets e variables do repositório

Em **Settings → Secrets and variables → Actions**:

| Nome | Tipo | Conteúdo |
|---|---|---|
| `SSH_HOST` | secret | IP elástico ou domínio da EC2 |
| `SSH_USER` | secret | usuário do deploy (`ubuntu` numa AMI Ubuntu) |
| `SSH_PRIVATE_KEY` | secret | chave privada dedicada ao CI, com as linhas `BEGIN`/`END` |
| `SSH_HOST_KEY` | **variable** | chave pública do host, só tipo + base64 (`ssh-ed25519 AAAA…`), sem o nome do host na frente. Chave **pública** não é segredo, então fica em Variables |
| `APP_DIR` | secret | caminho do clone na EC2 |
| `PM2_APP` | **variable** | nome do processo no PM2 — não é segredo, fica em Variables |

Gerar o par de chaves do CI (não reaproveitar o `.pem` da AWS, que dá acesso total e não pode ser revogado isoladamente):

```bash
ssh-keygen -t ed25519 -C "github-actions-bodia" -f ~/.ssh/bodia_ci -N ""
ssh-copy-id -i ~/.ssh/bodia_ci.pub <user>@<host>
cat ~/.ssh/bodia_ci     # → SSH_PRIVATE_KEY
ssh-keyscan -t ed25519 <host> | awk '{print $2, $3}'   # → SSH_HOST_KEY
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

Consumido por `plan.service` (gerar e regenerar), `user.service` (cadastro, registro de peso e edição de perfil) e pelo benchmark. Regra da arquitetura, vinda da fundamentação teórica: **todo número sai daqui**. O LLM só redige em cima destes valores — nunca calcula.

### Limites de segurança (RF17) — `data/limites-seguranca.ts`

São aplicados em duas frentes, e as duas são necessárias:

- **Na entrada**, o `validarPerfil` recusa peso, altura e idade fora de faixas plausíveis. Não é julgamento sobre corpo nenhum: é o intervalo fora do qual o valor certamente é erro de digitação ou de unidade (1,75 em vez de 175 cm), e um deles sozinho contamina TMB, meta calórica, macros e hidratação de uma vez.
- **Na saída**, dois pisos aparam a meta calórica e um teto apara a proteína. Um perfil perfeitamente plausível ainda produz uma meta baixa demais depois do déficit: num usuário sedentário o TDEE é só 1,2× a TMB, e o déficit de 20% já prescreve menos energia do que o corpo gasta em repouso.

Os pisos são dois, e o maior vence, porque cada um cobre o que o outro deixa passar: `KCAL_MIN_ABSOLUTO` protege quem é pequeno o bastante para que uma fração da TMB ainda seja pouco; `FATOR_MIN_SOBRE_TMB` protege quem é grande o bastante para que 1500 kcal continuem sendo um déficit extremo.

O teto de proteína (`PROTEINA_MAX_FRACAO_KCAL`) existe porque, sem ele, um perfil pesado com objetivo de perda fazia proteína e gordura estourarem a meta sozinhas — e o `calcularMacros` **lançava**, transformando um caso extremo em falha de geração em vez de um plano seguro.

As constantes são **exportadas**, e não números soltos dentro da função que os aplica, pela mesma razão dos limites de `volume-treino.ts`: um limite que só existe dentro da função não pode ser conferido por um teste nem citado por outra camada, e foi exatamente assim que a contradição do volume passou despercebida.

### Distribuição por refeição

`numeroRefeicoes` (inteiro **de 3 a 6**, obrigatório no `PerfilInput`) é escolhido pelo usuário no onboarding e diz em quantas partes o dia é dividido. Como cada parte é dividida está em `DISTRIBUICAO_REFEICOES`, uma tabela fixa no `engine.service`:

| Refeições | Distribuição |
|---|---|
| 3 | Café 25% · Almoço 40% · Jantar 35% |
| 4 | Café 20% · Almoço 35% · Lanche da tarde 15% · Jantar 30% |
| 5 | Café 20% · Lanche manhã 10% · Almoço 35% · Lanche tarde 10% · Jantar 25% |
| 6 | Café 20% · Lanche manhã 10% · Almoço 30% · Lanche tarde 10% · Jantar 20% · Ceia 10% |

A quantidade é do usuário, a repartição é da tabela — **nenhuma das duas é decisão do LLM**, que recebe kcal e os três macros já prontos por refeição. A última refeição do dia recebe o *restante* em vez do seu percentual, para a soma das partes fechar exatamente o total do dia sem o centavo perdido no arredondamento de cada fatia.

### A proteína tem tabela própria

Caloria e gordura seguem a tabela acima. **Proteína não**: ela tem `DISTRIBUICAO_PROTEINA`, e o **carboidrato passou a ser o resíduo de cada refeição** (`kcal − proteína×4 − gordura×9`, ÷4) — a mesma conta que já governava o carboidrato do dia, aplicada uma vez por prato.

| Refeições | Proteína |
|---|---|
| 3 | Café 20% · Almoço 42% · Jantar 38% |
| 4 | Café 18% · Almoço 40% · Lanche tarde 10% · Jantar 32% |
| 5 | Café 18% · Lanche manhã 6% · Almoço 40% · Lanche tarde 6% · Jantar 30% |
| 6 | Café 16% · Lanche manhã 6% · Almoço 38% · Lanche tarde 6% · Jantar 28% · Ceia 6% |

São duas tabelas porque a caloria se reparte pelo TAMANHO da refeição e a proteína pela COMIDA que ela de fato tem. Repartir proporcionalmente dava ao café da manhã 20% da proteína do dia, que pão com fruta não entrega, e a caloria que sobrava virava carboidrato no almoço. Medido: o prato brasileiro convencional (arroz, feijão, carne, salada, azeite), escalado para bater a caloria do almoço, tem **~70% mais proteína e ~30% menos carboidrato** que a meta que saía daqui — e o resultado na tela era **250 g de arroz com 80 g de frango**, 3,13:1 numa mulher de 57 kg.

**Tensão com a literatura, e ela é deliberada.** A ISSN (Jäger et al., 2017) recomenda 0,25 g/kg ou 20–40 g por refeição *"distribuídos uniformemente, a cada 3–4 h"*, e Mamerow et al. (2014) mediram síntese proteica 24 h **25% maior** com distribuição uniforme contra concentrada no jantar. Mas isso é um **piso por refeição**, não uma divisão igual de um total fixo. Aplicada como divisão igual, a uniforme foi testada aqui e é a **pior** das opções: o almoço cai para 19 g de proteína, o frango vai ao piso de 80 g e o desvio de proteína chega a **+85%**, porque um prato brasileiro real entrega muito mais que isso.

Efeito medido da tabela nova, com o mesmo prato clássico:

| perfil | antes | depois |
|---|---|---|
| mulher 57 kg, manutenção | 3,13:1 · C −7% | **3,00:1 · os 4 alvos dentro dos 5%** |
| homem 85 kg, manutenção | 2,50:1 · C −15% | **2,08:1 · C −11%** |

O prato de prescrição de verdade (~1,5:1) exigiria proteína a **2,0 g/kg** — topo da faixa 1,4–2,0 de Stokes et al. 2018, que já é a fonte de `PROTEINA_G_POR_KG`. Medido, ele fecha os quatro alvos nos dois perfis. A dose ficou em 1,7 por decisão de produto; a porta está nos próximos passos.

Os nomes precisam continuar batendo com `HORARIO_POR_REFEICAO` (`mappers/plano.mapper.ts`), que é quem casa o horário sugerido, e com `DISTRIBUICAO_TEXT` na tela `OnboardingRefeicoesScreen` do mobile, que mostra os percentuais ao usuário.

## Geração do plano pela IA

O `POST /api/onboarding` faz **duas chamadas** ao modelo, não uma:

```
                                   ┌─ dieta:seleção ─▶ porcoes.solver ─┐
engine.service ─▶ catalogo.filter ─┤    (IA: quais)     (motor: quanto)  ├─▶ validador-macros
  os números       filtra restrições└─ treino ─────────────────────────┘     confere as contas
                                        (em paralelo com a dieta)
```

Quem encadeia é `plano-ia.generator.ts`; quem o chama é `plan.service.gerar()`.

### Por que duas chamadas, e não uma

A versão anterior pedia ao modelo, na mesma resposta, escolher alimentos, dosar gramas até fechar quatro macros e montar o treino. Levava 2–3 min, falhava com frequência e produzia café da manhã com filé de merluza. O comentário de `reasoning_effort` que existia no `ai.service` já dizia onde estava o problema: *"a dificuldade aritmética da tarefa (encaixar gramas de centenas de alimentos até fechar 4 macros ao mesmo tempo)"*.

Cada chamada agora faz uma coisa só:

| Etapa | Faz | Onde |
|---|---|---|
| `dieta:seleção` | escolhe **quais** alimentos entram em cada refeição, por id. Proibida de informar gramas. | IA, ~17k caracteres (leva a TACO filtrada) |
| porções | dosa em gramas **só os alimentos escolhidos** na etapa anterior | `porcoes.solver.ts`, sem IA |
| `treino` | monta o treino. Não conhece a dieta. | IA, ~7,8k caracteres |

**O ganho não é prompt menor no total** — a soma é parecida com a de antes, porque a seleção ainda carrega o catálogo inteiro. O ganho é que a etapa **difícil** saiu do modelo: a aritmética que estourava o raciocínio virou código.

Se a latência ainda incomodar, é a chamada de seleção que precisa encolher — e o caminho é classificar a TACO por refeição e filtrar por código, como o `catalogo.filter` já faz com as restrições.

**Dieta e treino rodam em `Promise.all`.** São independentes, e sem isso a divisão sairia mais lenta que a chamada única.

### As gramas saem do motor, não do modelo

A etapa de porções **já foi uma terceira chamada à IA**, e produziu o pior defeito que o app teve: um almoço com **400 g de arroz** e um jantar com 500 g, 2,9 kg de comida no dia, o total 30% acima da própria meta calórica e a proteína 72% acima. O modelo recebia as quatro metas da refeição e devolvia as gramas; a única conferência era `gramas > 0`, e o prompt trazia um PISO ("uma porção de arroz é 100-200 g, não 37 g") e nenhum teto.

Dosar porções sob restrição é aritmética, e é justamente o que a fundamentação do trabalho diz que LLM não faz bem. Hoje quem resolve é o `porcoes.solver.ts`:

- **`data/porcoes.ts`** dá a cada alimento um **papel** (`BASE_CARBO`, `PROTEINA`, `GORDURA`, `LATICINIO`, `VEGETAL`, `FRUTA`) e uma **faixa** `[min, usual, max]`. O papel sai da CATEGORIA da TACO, que diz bem o que o alimento é; a faixa sai da DENSIDADE ENERGÉTICA, que diz bem quanto se come — ninguém come 200 g de azeite nem 20 g de alface. Categoria para os dois não funcionaria: "Cereais e derivados" tem arroz cozido (128 kcal, 150 g) e farinha de trigo (360 kcal, 25 g) lado a lado.
- **O solver** faz descida coordenada sobre um custo: a soma dos desvios relativos ao quadrado dos quatro alvos, ponderada. Cada rodada calcula, para cada alimento, a grama que minimiza o custo com os outros parados (fórmula fechada — o custo é quadrático numa variável só) e aplica a de maior ganho, presa à faixa.
- A **grade de servir** (5 g, 10 g, ou 1 g no que cabe todo em 30 g) entra DENTRO da busca. Arredondar depois é cego ao custo: 5 g de azeite são 44 kcal e 18% da meta de gordura de um almoço.

A primeira versão fechava um macro por vez, em sequência, e estava errada: um alvo inalcançável empurrava sua alavanca ao teto e destruía os outros. Num almoço sem fonte de gordura, perseguir 28 g de gordura levava o frango a 250 g e a proteína a +51%. Com custo global, um alvo impossível simplesmente para de render melhora.

**Infeasibilidade é resultado, não erro.** Se a meta não couber nas faixas, o solver entrega o melhor prato possível e o `validador-macros` reporta a diferença. Prato comestível com desvio honesto vale mais que um prato que fecha a planilha e ninguém come.

Duas consequências no resto do código:

- O `dieta-selecao.prompt` passou a **exigir uma fonte de gordura** nas refeições principais. Com a gordura travada em 25% das calorias e nenhum alimento denso no prato, só sobrava volume para fechar a energia — foi metade do problema das 400 g.
- `DietaIaGenerator.exigirCobertura` **recusa** almoço ou jantar sem base de carboidrato ou sem fonte de proteína: a meta seria inalcançável por construção, e o problema é da SELEÇÃO, que precisa ser refeita.

`plan.service.gerar()` orquestra tudo e imprime três blocos no console: o plano calculado, a conferência dos macros e o plano enviado ao app. O plano volta na resposta HTTP e **só é persistido quando o usuário aprova**, num segundo POST (`/api/cadastro`, `user.service`).

### Catálogos (`src/data/`)

- `alimentos.ts` — 284 itens da TACO (NEPA/UNICAMP), macros por 100 g. **Arquivo gerado**: nunca editar à mão, rodar `npx tsx scripts/importar-taco.ts`. O script fica versionado para documentar a procedência dos dados.
- `exercicios.ts` — 100 exercícios escritos à mão. `sessoes` usa os mesmos nomes que `EngineService.SPLIT_POR_DIAS` gera; `articulacoes` casa com os chips de restrição física do app.

Os `id` são estáveis e servirão de chave estrangeira quando as fichas forem persistidas.

### `catalogo.filter.ts` — a restrição é aplicada por código, não por instrução

Filtra os catálogos **antes** de montar o prompt. O modelo não recebe leite para escolher, em vez de receber e ser instruído a não escolher — ele não pode violar uma restrição sobre um alimento que nunca viu.

Regra ao mexer nas listas de exclusão: **falso positivo é aceitável, falso negativo não**. Remover um alimento seguro custa variedade; manter um proibido pode machucar alguém. A exceção `VEGETAIS_COM_NOME_DE_LATICINIO` existe porque "Couve, manteiga" é hortaliça e "Soja, queijo (tofu)" é vegano — sem ela, o filtro de lactose comeria a couve.

### O volume de treino sai pronto do motor, não é dividido pelo LLM

`EngineService` entrega, por sessão, **quantas séries cada grupo muscular recebe naquela sessão** — já dividido pela frequência semanal. O prompt só pede exercícios que somem aquilo.

Antes o motor mandava um total semanal e o prompt dizia "distribua". As duas coisas nunca foram confrontadas e **não fechavam**: em 13 das 15 combinações de dias x nível o orçamento exigia mais exercícios do que o próprio prompt permitia (o Upper de 4 dias/intermediário pedia 14 exercícios num teto de 7). O modelo recebia tarefa impossível e devolvia volume arbitrário — sem ninguém conferir.

Três peças sustentam a correção, todas em `src/data/volume-treino.ts`:

- **`GRUPOS_POR_SESSAO`** — quais grupos cada sessão treina e em que papel. Fica ali, e **não** derivado de `exercicios.ts`: o catálogo diz quais exercícios *cabem* numa sessão, esta tabela diz quais grupos recebem *volume*. Derivar do catálogo faria o filtro de restrição alterar a prescrição sem ninguém pedir.
- **`FRACAO_SECUNDARIO`** — grupos pequenos (bíceps, tríceps, panturrilha) recebem volume direto reduzido. **Precisa de fonte na fundamentação teórica**; o comentário no arquivo diz exatamente quais afirmações.
- **`MAX_SERIES_POR_GRUPO_SESSAO`** — sem ele, um split que treina o grupo 1x/semana empilhava a semana inteira numa sessão (18 séries de peito num treino). A consequência é deliberada: em splits de baixa frequência o total semanal fica **abaixo** do alvo, e o `ValidadorVolume` reporta a diferença.

Os limites de exercícios e séries deixaram de ser frase no prompt e viraram **constantes exportadas**, lidas pelo motor, pelo prompt e pelo validador. Estarem só no texto é exatamente por que a contradição passou despercebida.

A viabilidade é garantida **por construção**: o motor apara o orçamento (secundário primeiro, primário depois) até caber. `tests/services/engine.service.test.ts` cobre as 15 combinações — é a regressão que faltava.

### Os prompts — as três técnicas da fundamentação teórica (4.5.2)

Cada um dos três prompts aplica as mesmas técnicas, com o conteúdo que lhe diz respeito:

1. **System prompt**: contrato de papel. Na seleção, o modelo escolhe e **não calcula**; nas quantidades, dosa e não troca alimento; no treino, distribui séries e não recalcula volume.
2. **Context injection**: valores do `engine.service` + o catálogo pertinente àquela etapa.
3. **Few-shot**: exemplo do JSON de saída, com a palavra "json" — requisito do JSON mode.

**As citações da literatura ficam no prompt a que pertencem**, não repetidas em todos: Pelland 2024 e Schoenfeld 2016 (volume) só no `treino.prompt`. Elas existem para reduzir a tentativa do modelo de "melhorar" o número recebido — a alucinação de fidelidade de Zhang et al. (2024) —, e isso só faz sentido onde o número está. Há teste garantindo que não vazem entre prompts.

As de macros (ISSN/Jäger, Stokes, Kerksick, Mifflin) viviam no `dieta-quantidades.prompt` e saíram junto com ele: o modelo não recebe mais meta numérica de macro nenhuma, então não sobrou número para ele tentar melhorar. Elas continuam citadas onde o número de fato nasce — `engine.service` e `data/limites-seguranca.ts`.

`treino.prompt.ts` tem limites explícitos de volume (4–7 exercícios por sessão, 2–5 séries por exercício) porque **em teste real o modelo leu "18 séries por grupo na semana" como "18 séries deste exercício"** e montou sessões de 15 exercícios. Ao mexer no prompt, não remova esses limites.

### `padrao-refeicoes.ts` — o padrão brasileiro é instrução, não filtro

Descreve o que compõe cada refeição no Brasil (café: pão, ovo, fruta, café — nunca arroz, feijão ou peixe) e entra no system prompt da seleção, só com as refeições que aquele usuário faz.

**Difere de propósito do `catalogo.filter`**, que remove o item do catálogo: uma restrição alimentar violada machuca alguém, um café da manhã estranho só é estranho. Se na prática o modelo continuar ignorando o padrão, o caminho é classificar a TACO por refeição e passar a filtrar — o `catalogo.filter` é o precedente pronto.

As chaves precisam continuar batendo com `DISTRIBUICAO_REFEICOES` (`engine.service`) e `HORARIO_POR_REFEICAO` (`plano.mapper`).

### O retry: viu que errou, pede de novo

Até aqui o desvio era medido, reportado e ignorado — o plano ia para o banco fora da tolerância. `PlanoIaGenerator.gerar` agora laça, até **3 tentativas** (uma mais duas).

O que é regerado é a **SELEÇÃO**, não as porções. Com o `PorcoesSolver` as gramas já são as melhores possíveis para os alimentos escolhidos: o que sobrou de desvio é responsabilidade de QUAIS alimentos entraram, e é a única alavanca que outra chamada pode mover. Pedir as gramas de novo não teria o que melhorar.

**Só a trilha que falhou é refeita** — macros fora pedem outra dieta, volume fora pede outro treino. Refazer as duas gastaria uma chamada à toa e ainda arriscaria estragar a que já estava boa. É essa decisão que faz o retry caber no orçamento de tempo (ver "Latência").

O retorno vai no prompt em **linguagem de comida, não de aritmética** (`generators/ajuste-selecao.ts`): *"Almoço: inclua um carboidrato mais denso — farofa, pão, macarrão ou batata"*, e não "o almoço ficou 18% abaixo no carboidrato". É a mesma razão pela qual o prompt de seleção proíbe o modelo de calcular. Uma instrução por refeição, a do macro **mais** fora: mandar corrigir os quatro de uma vez dá ordens que se contradizem, e o modelo escolhe qual seguir.

O desvio é medido **por refeição** (`ValidadorMacros.validarRefeicao`), e não pelo dia: o total do dia diz que algo está errado, não onde — e o modelo monta uma refeição por vez.

Esgotadas as tentativas, devolve a **melhor** (menor soma dos desvios absolutos, com peso extra por sessão de treino fora do orçamento). Nunca deixa o usuário sem plano; o desvio residual segue na conferência, que é o que o RF22 pede. `ConferenciaDTO.tentativas` sobe até o app de propósito — é o que permite medir a frequência do retry sem ler log de servidor.

### O número final nunca é aceito na palavra do modelo

A validação acontece em camadas, e cada uma é mais estreita que a anterior:

1. **IDs na seleção**: todo `alimentoId` precisa existir no catálogo *filtrado*. Id inexistente é alucinação; e, como o catálogo já passou pelo filtro, isso também barra um item proibido entrando pela porta dos fundos.
2. **Cobertura da refeição**: almoço e jantar precisam de uma base de carboidrato e de uma fonte de proteína. Sem elas a meta é inalcançável por construção.
3. **Nome do catálogo**: o `nome` gravado vem do catálogo, não do que a IA escreveu — o app nunca exibe um nome que não corresponde ao id.
4. **Gramas**: não são mais validadas porque não são mais pedidas ao modelo. O `porcoes.solver` só devolve ids que recebeu, sempre dentro da faixa de `data/porcoes.ts`.
5. **IDs do treino**: mesma regra do catálogo filtrado.
6. **Macros**: `validador-macros` recalcula kcal e macros pela TACO × gramas propostas e mede o desvio contra a meta. `dentroDoLimite` usa 5% de tolerância. A conta é a MESMA para a IA e para o fixture — antes havia uma cópia em cada, e corrigir uma deixava a outra medindo diferente.
7. **Volume de treino**: `validador-volume` soma as séries por grupo a partir dos exercícios escolhidos e compara com o orçamento do motor, tolerando uma série de diferença (arredondamento legítimo). Também acusa grupo treinado fora do orçamento. Era o irmão que faltava — a dieta tinha os números conferidos e o treino não tinha nada.

8. **O desvio chega ao app**: `conferencia.mapper` traduz a saída dos dois validadores no formato da tela, e o `POST /api/onboarding` a devolve junto do plano (RF22). Medir sem mostrar não fechava o requisito — até então os dois validadores rodavam e o resultado ia apenas para o `console.log` do servidor.

Corrigir automaticamente quando o desvio estoura ainda **não** existe — esta etapa MEDE e REPORTA. E o desvio, medido, **está estourando**: ver "Próximos passos".

### `ai.service.ts` e a configuração

`gerarJson(system, user, etapa)` usa `response_format: json_object` e temperatura baixa (a fundamentação 4.2.3 trata a estocasticidade como problema de reprodutibilidade).

O parâmetro **`etapa`** não é enfeite: com mais de uma chamada, sem ele o console imprime blocos idênticos e não dá para saber qual etapa está lenta ou falhou. Os logs saem como `[ia:dieta:seleção]` e `[ia:treino]`, com tempo e tokens de cada uma.

`max_tokens: 8192` — o teto anterior era 32000 por causa dos `reasoning_tokens` da DeepSeek, que contavam dentro do limite. Cada chamada agora produz uma resposta pequena. (Num modelo de raciocínio o problema volta, e por isso o teto dele é maior — ver a tabela abaixo.)

Além do sucesso, **a falha também é registrada**: `[ia:<etapa>] FALHOU em Xs — <erro>`. Sem isso uma chamada que estoura o teto não deixa rastro nenhum, e com dieta e treino em paralelo não dá para saber qual das três morreu sem subtrair tempos na mão.

Configuração em `src/config/ia.ts` (`IA_API_KEY`, `IA_MODEL`, `IA_BASE_URL`, `SIMULAR_IA`). Sem a chave o servidor sobe normal e só as rotas de IA falham — é o motivo de o cliente ser criado por **factory**, e não no boot.

**`IA_BASE_URL` vazio significa OpenAI** (o SDK usa o próprio padrão); preenchido, aponta a qualquer provider compatível com Chat Completions. No código o valor passa por `|| undefined`, e não cru: string vazia quebra a resolução do endpoint no SDK em vez de cair no padrão. Cuidado — é esta variável que decide para onde a chave é enviada.

**O `AiService` não sabe qual modelo está atrás.** Ele recebe cliente, modelo, timeout **e os parâmetros da chamada** por construtor; quem decide os parâmetros é `config/ia.ts`, via `ehModeloDeRaciocinio()`. Colocar essa decisão dentro do service (um regex sobre o nome do modelo) desfaz o que a classe promete e contraria a regra de config ser passada como parâmetro.

| | Modelo de chat | Modelo de raciocínio (`gpt-5*`, `o1`–`o9`) |
|---|---|---|
| Temperatura | `0.2` (fundamentação 4.2.3) | **omitida** — só aceita a padrão |
| Teto de saída | `max_tokens: 8192` | `max_completion_tokens: 24576` — reasoning_tokens contam dentro |
| Esforço | — | `reasoning_effort: "minimal"` |
| Timeout por chamada | 60s | 90s |

O padrão continua sendo chat: além do preço, é nele que a `temperature: 0.2` vale. **Abrir mão dela é o custo real de usar a família de raciocínio** — escolha consciente, não detalhe de configuração.

O timeout é **por chamada**, e o orçamento é ditado pela trilha da dieta: seleção e quantidades rodam em **sequência**, então o pior caso é 2 × o teto (120s no chat, 180s no raciocínio). O treino corre em paralelo e se esconde atrás delas. Os 210s de timeout do axios no app precisam ser maiores que isso, senão o app desiste antes do servidor e o usuário nunca vê o erro. **90s é o máximo seguro por chamada.**

O `AbortSignal` por requisição continua necessário porque o `timeout` do SDK é limpo quando chegam os cabeçalhos, e a geração acontece depois disso. É ele que aparece como **`APIUserAbortError`** quando estoura — o teto do SDK daria `APIConnectionTimeoutError`. Foi assim que o `gpt-5` reprovou na primeira tentativa: a etapa de quantidades cortada em 60s exatos.

**`SIMULAR_IA` decide quem monta o plano** e vem **ligada** por padrão: com ela, `plano-simulado.generator` devolve o fixture de `src/data/plano-simulado.ts` em vez de chamar a IA. A troca é feita na composição da rota (`plan.routes.ts`), atrás da interface `GeradorDePlano`; o `plan.service` não sabe qual dos dois recebeu.

Nos testes o `ai.service` é **sempre** substituído por um fake — chamada real gastaria crédito e deixaria a suíte dependente de rede. O fake responde **por etapa**, e não por ordem de chamada: dieta e treino rodam em `Promise.all`, então a ordem de chegada não é determinística.

### Latência — medida (RNF02)

A chamada única na DeepSeek levava **~2 minutos** e era o motivo de `SIMULAR_IA` existir. A divisão em três atacou exatamente isso, e o número agora foi medido com chave de verdade:

| modelo | wall clock | trilha dieta | trilha treino |
|---|---|---|---|
| `gpt-4o-mini` | **6,6 s** | 6,6 s | 6,2 s |
| `gpt-5` | **22,5 s** | 9,2 s | 22,5 s |

O RNF02 pede 15 s, e essa medição é **de antes do solver e do retry**: ali a geração eram três chamadas, com as quantidades em sequência depois da seleção. Com duas chamadas e o retry medido abaixo, o `gpt-5` passou a caber nos 15 s.

**A escolha atual é `gpt-5`, deliberada** — não é `.env` esquecido. Trocar é editar uma linha do `.env`; nada no código depende do nome do modelo (ver `ehModeloDeRaciocinio()` em `config/ia.ts`, que ajusta os parâmetros sozinho).

Como ler: as trilhas rodam em **paralelo, como em produção**, então `total_ms` é o wall clock que o app veria — `max(dieta, treino)` — e é ele que decide se o modelo cabe. A soma das etapas é maior que o total de propósito: cada etapa responde *onde* o tempo é gasto, não *quanto* o usuário espera.

O resultado contraria a intuição de que a seleção de alimentos seria o gargalo por ser o maior prompt (~17k caracteres): ela é a etapa **mais rápida** (2–3,6 s). Quem domina é o treino, e no `gpt-5` por causa dos tokens de raciocínio. Se o `gpt-5` for necessário por qualidade, é o `treino.prompt` que precisa encolher.

**O retry cabe no orçamento, e isso foi medido.** Com o laço de 3 tentativas, dois perfis reais em `gpt-5`, ambos esgotando as três:

| perfil | total | tentativa 1 | tentativas 2 e 3 |
|---|---|---|---|
| mulher 57 kg | **11,5 s** | 6,5 s | 2,4 s · 2,6 s |
| homem 85 kg | **9,5 s** | 5,5 s | 2,1 s · 2,0 s |

Os dois ficaram **dentro dos 15 s do RNF02 mesmo no pior caso**, e o motivo é a decisão de refazer só a trilha culpada: o volume passou nas duas, então as tentativas 2 e 3 custaram apenas a chamada de seleção (~2,5 s) em vez de uma geração inteira. Refazer as duas trilhas teria custado ~6 s por volta e estourado o requisito.

Com o solver e o retry, o `gpt-5` passou a caber no RNF02 — a tabela acima, de antes deles, media a geração única e não vale mais como veredito do modelo.

Para reproduzir sem mexer no `.env` (o `dotenv` não sobrescreve variável já definida no shell):

```bash
IA_MODEL=gpt-4o-mini npx tsx scripts/bench-modelo.ts
```

O timeout do axios no mobile é de 210s. O teto por chamada é 60s (chat) ou 90s (raciocínio) — ver a tabela em "`ai.service.ts` e a configuração".

## Endpoints

Tudo em `/api`. **Autenticado** = exige `Authorization: Bearer <token>`; o `usuarioId` sai do token, e por isso não aparece em nenhuma URL.

### Público

| Método | Rota | Corpo / Resposta | Erros |
|---|---|---|---|
| `GET` | `/` | → **200** `{ message, commit, iniciadoEm }`. Marca da versão no ar: `commit` vem de `GIT_COMMIT` (exportada pelo `deploy.sh`) e `iniciadoEm` é o boot do processo. É o `curl` que confirma **qual** versão o deploy publicou. | — |
| `POST` | `/api/onboarding` | `{ conta, perfil }` → **200** `{ plano, conferencia }`. Nada é persistido — é o plano que o usuário revisa antes de decidir. `conferencia` traz o desvio medido pelos dois validadores (RF22). `perfil.numeroRefeicoes` (3–6) é obrigatório. | **400** perfil ausente ou inválido; **500** se a IA falhar |
| `POST` | `/api/cadastro` | `{ conta, perfil, plano }` → **201** `{ token, usuario }`. Grava usuário, peso, restrições e as duas fichas numa transação, e **já devolve a sessão aberta**. `conta.aceiteTermos` precisa ser `true` (RF36). | **400** payload inválido ou sem aceite; **409** e-mail já cadastrado |
| `POST` | `/api/login` | `{ email, senha }` → **200** `{ token, usuario }` | **401** credencial inválida (mesma mensagem para e-mail inexistente e senha errada) |
| `GET` | `/api/teste-geracao` | Benchmark **temporário**: chama a IA de verdade com perfil fictício fixo e devolve o tempo de cada trilha e a validação. Ignora `SIMULAR_IA` de propósito. | devolve `success: false` no corpo em vez de lançar |

`/api/login` e `/api/cadastro` têm limite estreito de tentativas por IP — ver `config/seguranca.ts`.

### Plano — autenticado

| Método | Rota | Corpo / Resposta | Erros |
|---|---|---|---|
| `GET` | `/api/plano` | → **200** o plano **em vigor hoje** no formato das telas (Home, Treino, Dieta, Perfil). `planoAgendado` traz o dia em que o plano gerado por último entra em vigor, ou `null`. | **404** usuário sem plano em vigor |
| `POST` | `/api/plano/regenerar` | → **200** `{ plano, conferencia }` — o plano **em vigor** no formato do `GET`, mais o desvio medido pelos validadores (RF22), que antes só o onboarding recebia. O perfil vem do BANCO, não do payload: pedir outro cardápio não é ocasião para o app reenviar sexo, altura e objetivo. O plano novo é gravado na hora, mas só ENTRA EM VIGOR amanhã se o dia já tiver refeição marcada — ver "A ficha nova entra em vigor amanhã". A ficha anterior é desativada, nunca apagada. | **404** usuário sem perfil; **500** se a IA falhar |

### Perfil, peso e conta — autenticado

| Método | Rota | Corpo / Resposta | Erros |
|---|---|---|---|
| `GET` | `/api/perfil` | → **200** o perfil no vocabulário da API (RF10) | **404** usuário inexistente |
| `PATCH` | `/api/perfil` | Só os campos que mudaram → **200** `{ perfil, recalculado, metas, planoDesatualizado }`. Campo ausente é campo NÃO alterado — daí PATCH e não PUT. `recalculado` é `false` quando o usuário mexeu só nas restrições (FA02 do UC06). | **400** campo inválido |
| `POST` | `/api/peso` | `{ pesoKg }` → **201** `{ historico, metas, planoDesatualizado }`. Grava o peso E recalcula TMB, GET, meta calórica, macros e água (RF33 + RF34), na mesma chamada. As metas caem na ficha **agendada** quando existe uma, e só na falta dela na vigente. | **400** pesoKg fora de 25–400 |
| `GET` | `/api/peso` | → **200** mesmo formato, sem gravar nada | **404** usuário inexistente |
| `DELETE` | `/api/conta` | `{ senha }` → **204**. Apaga tudo em cascata (RF35, LGPD). Exige a senha **além** do token: a exclusão é irreversível, e o token sozinho tornaria um aparelho desbloqueado por alguns segundos suficiente para destruir o histórico de alguém. | **401** senha incorreta |

### Registros do dia a dia — autenticado

| Método | Rota | Corpo / Resposta | Erros |
|---|---|---|---|
| `POST` | `/api/hidratacao` | `{ volumeMl }` → **201** `{ dia, totalMl, metaMl, registros }` | **400** volumeMl fora de 1–5000; **404** sem plano ativo |
| `GET` | `/api/hidratacao` | `?dia=AAAA-MM-DD` opcional (default hoje) → **200** mesmo formato | **400** dia mal formatado; **404** sem plano ativo |
| `DELETE` | `/api/hidratacao/:registroId` | Desfaz um registro → **200** mesmo formato | **404** registro inexistente **ou de outro usuário** |
| `POST` | `/api/refeicao` | `{ refeicaoId }` → **201** `{ dia, registros, consumido, metas, totalRefeicoes }`. **Idempotente**. | **400** sem refeicaoId; **404** sem plano ativo, ou refeição de outro usuário |
| `GET` | `/api/refeicao` | `?dia=AAAA-MM-DD` opcional → **200** mesmo formato | **400** dia mal formatado; **404** sem plano ativo |
| `DELETE` | `/api/refeicao/:refeicaoId` | Desmarca a de hoje → **200** mesmo formato | **404** não está marcada hoje **ou é de outro usuário** |
| `POST` | `/api/treino` | `{ sessaoTreinoId }` → **201** o treino aberto. **Idempotente**: reabrir a mesma sessão devolve o que já estava aberto. | **400** sem sessaoTreinoId; **404** sessão de outro usuário |
| `POST` | `/api/treino/:registroTreinoId/concluir` | `{ series: [{ exercicioSessaoId, ordem, repeticoes, pesoKg }] }` → **200** `{ de, ate, treinos }`, a semana inteira. Grava a carga em `CargaExercicio` (RF25). | **400** série malformada; **404** treino ou exercício de outro usuário |
| `GET` | `/api/treino` | Sem parâmetros: a semana corrente (os cards da tela). Com `?de=&ate=` (AAAA-MM-DD, `ate` inclusivo): o histórico (RF27). | **400** período mal formatado |

### Por que o treino é da SEMANA e os outros são do DIA

Água e refeição respondem "o que fiz hoje"; treino responde "o que já fiz nesta semana". A diferença não é estilo: a prescrição de treino é semanal, e a `TreinoScreen` mostra um card por dia da semana com os feitos marcados. `janelaDaSemana` (`config/fuso.ts`) começa na **segunda**, e não no domingo como `Date.getDay()`, porque é assim que `DIAS_POR_QUANTIDADE` distribui o treino — um split de 4 dias cai em Segunda, Terça, Quinta e Sexta, e começar no domingo partiria a semana ao meio.

### Refeição é toggle, hidratação é log

A diferença muda o desenho dos dois recursos:

- **Hidratação** acumula: vários goles por dia, cada toque é uma linha, e desfazer apaga uma linha pelo `registroId`.
- **Refeição** é liga/desliga: no máximo **um** registro por (refeição, dia), e desmarcar apaga pelo `refeicaoId` — que é o identificador que o app tem em mãos vindo do plano.

Esse "um por dia" **não é constraint no banco**. Expressá-lo em SQL exigiria uma coluna `dia` (cópia derivada, recusada) ou um índice por expressão, que espalharia o offset do fuso para fora de `config/fuso.ts`. A garantia é do `RefeicaoService`, que consulta a janela do dia antes de inserir — mesma natureza da regra "só uma ficha ativa por usuário", que também vive no código.

Por isso `POST /api/refeicao` é **idempotente**: marcar de novo devolve o dia como está. Não é refinamento — com a UI otimista do app, reenviar depois de uma falha de rede é rotina, e sem isso o almoço entraria duas vezes na conta de calorias.

### O `consumido` é somado no servidor, e isso não é detalhe

`ResumoRefeicoesDia.consumido` vem do JOIN entre `RegistroRefeicao` e `Refeicao`, não da ficha vigente.

O motivo é o plano regenerado no meio do dia: a refeição marcada de manhã aponta para a `Refeicao` da ficha **antiga**, que continua no banco (desativada, nunca apagada). O backend lê os macros dela pelo FK e a conta do dia continua certa. Se o app somasse — como fazia com a antiga `somarConsumido` —, essas calorias sumiriam, porque o app só tem em mãos a ficha vigente.

Pela mesma lógica, a resposta **não** traz um campo `refeicoesFeitas: string[]`: ele seria derivável de `registros` e as duas cópias poderiam divergir.

### A ficha nova entra em vigor amanhã

Somar pelo FK mantinha a CONTA certa, mas não bastava para a tela. Regenerando às 14h, o que o usuário via era: 1000 kcal consumidas no cabeçalho e **todos os cards desmarcados** — porque `DietaScreen` monta as marcações com `new Set(registros.map(r => r.refeicaoId))`, e esses ids são os da ficha antiga, que não batem com nenhum `refeicoes[].id` da nova. A meta calórica, ainda por cima, mudava depois de a pessoa já ter comido contra a anterior. E remarcar o mesmo almoço na ficha nova **somava duas vezes**, já que `buscarNoDia` casa por `refeicaoId`.

Por isso `FichaTreino` e `FichaAlimentacao` ganharam **`vigenteDe`**, e `ativa` mudou de significado:

- `ativa` = **não substituída**. No máximo DUAS por usuário: a vigente e a agendada.
- **vigente** = `ativa` e `vigenteDe <= agora`, a de maior `vigenteDe` (daí o `orderBy` em toda consulta — sem ele, a de ontem e a que virou à meia-noite empatariam).
- **agendada** = `ativa` e `vigenteDe > agora`.

Quem decide a data é `PlanService.decidirVigencia`: a próxima meia-noite local (`inicioDoProximoDia`, em `config/fuso.ts`), **exceto** quando o dia ainda não tem nenhuma refeição marcada — aí não há conta a bagunçar e o plano vale na hora. Usuário sem ficha vigente também recebe na hora, senão o `GET /api/plano` ficaria em 404 até a meia-noite.

Adia o plano INTEIRO, treino junto: as metas do dia moram na ficha de alimentação, e deixar treino e dieta de gerações diferentes convivendo trocaria os cards da semana no meio dela.

Só refeição decide o dia "sujo". A hidratação também tem meta na ficha, mas `RegistroHidratacao` não aponta para ela — a água registrada não muda de dono quando a meta muda.

Três consequências que saem de graça do filtro de vigência:

- `POST /api/refeicao` **recusa** o id de uma refeição agendada: ele não está entre os da ficha vigente, e cai no mesmo 404 da conferência de posse. A dieta de amanhã não é marcável hoje.
- `atualizarMetasDaProximaFicha` (peso e perfil) escreve na agendada quando ela existe — mexer na de hoje mudaria o denominador contra o qual o usuário já comeu.
- `MeuPlano.planoAgendado` leva ao app só a DATA, não a prescrição de amanhã: a tela precisa explicar por que o cardápio não mudou, não mostrá-lo.

O "no máximo duas ativas" **não é constraint no banco** — exigiria índice parcial em SQL cru. A garantia é de `PlanRepository.gravarFichas`, que na mesma transação desativa tudo o que está ativo exceto o par em vigor (ou tudo, quando a vigência é imediata). Mesma natureza do "um registro de refeição por dia".

### Por que o dia é recortado no servidor (`config/fuso.ts`)

`RegistroHidratacao` e `RegistroRefeicao` guardam só o instante (UTC). O dia a que ele pertence é calculado na leitura, com offset fixo de **America/Sao_Paulo (−3)**.

Isso existe porque o servidor roda em UTC e o usuário não: uma ceia às 22h em Brasília é 01h UTC do **dia seguinte**, então cortar pela data UTC jogaria a água e o jantar da noite no dia errado. O app **não envia data** — a regra é uma só, e fica no servidor.

Não há coluna `dia` de propósito: ela seria derivada de `registradoEm` mais o fuso, e duas cópias do mesmo fato divergem (a mesma razão pela qual o peso atual não é campo em `Usuario`).

Limitação assumida: quem estiver em Manaus (−4), no Acre (−5) ou viajando tem o dia recortado pelo relógio de São Paulo. Consertar exige guardar o fuso de cada usuário.

## Próximos passos

- **A proteína a 1,7 g/kg é o que ainda separa o prato de uma prescrição.** Com a tabela de repartição, o retry e o solver, uma geração real fecha caloria, carboidrato e gordura em torno de 1–7%, mas a proteína teima em **+9%** no perfil feminino: um prato brasileiro com uma porção normal de carne entrega mais proteína do que 1,7 g/kg reparte para o almoço. Medido, **2,0 g/kg** — topo da faixa 1,4–2,0 de Stokes et al. 2018, a mesma fonte já citada — fecha os quatro alvos nos dois perfis E leva a razão arroz:carne de 3,0:1 para 1,67:1. A dose ficou em 1,7 por decisão de produto; subir é uma linha em `PROTEINA_G_POR_KG`.
- **A gordura travada em 25%** (`GORDURA_PERCENTUAL_KCAL`) é a outra metade da mesma conta: o carboidrato é o RESÍDUO, então 25% de gordura o mantém alto e o arroz no teto. Subir para 30% (faixa 20–35%, Jäger et al. 2017) derruba o carboidrato de 398 para 356 g/dia no perfil masculino. Também decisão de nutrição, também deixada em aberto.
- **O retry esgota as três tentativas nos dois perfis medidos.** Isso diz que o desvio residual é da META, não da seleção — nenhuma escolha de alimento fecha o que as duas linhas acima mantêm aberto. Enquanto for assim, o retry está pagando ~5 s e duas chamadas por uma melhora pequena; se as metas forem corrigidas, ele deve passar a disparar raramente. Vale remedir `conferencia.tentativas` depois de qualquer mexida nelas.
- **O fixture não passa pelo solver.** `SIMULAR_IA=true` devolve `data/plano-simulado.ts` com gramas fixas e quatro refeições, independentemente do perfil — limitação já documentada no próprio arquivo, mas que agora significa que o caminho padrão de desenvolvimento não exercita as porções.
- **Remedir o `bench-modelo.ts`.** A tabela dele (`gpt-4o-mini` 6,6 s, `gpt-5` 22,5 s) é de quando a geração eram três chamadas em sequência; medido agora com duas chamadas mais o retry, o `gpt-5` fecha em 9,5–11,5 s. O veredito "gpt-5 não atende o RNF02" **caiu**, mas o script ainda não foi rodado de novo para a comparação entre modelos ficar honesta. O gargalo continua sendo a trilha do TREINO, por causa dos tokens de raciocínio: se sobrar tempo a cortar, é o `treino.prompt` que precisa encolher — não a seleção de alimentos, que é o maior prompt mas a etapa mais rápida.
- **O padrão brasileiro é instrução, não garantia.** Se voltar a aparecer merluza no café da manhã, ver `padrao-refeicoes.ts` — o conserto estrutural é o filtro por refeição.
- **A corrida na marcação de refeição**: entre o `buscarNoDia` e o `criar` há uma janela em que dois pedidos simultâneos criariam duas linhas. Fechá-la exige índice único por expressão no Postgres.
- **Fundamentar as constantes sem citação**: `FRACAO_SECUNDARIO` (`data/volume-treino.ts`), `ML_POR_KG` (`data/hidratacao.ts`) e `KCAL_MIN_ABSOLUTO` (`data/limites-seguranca.ts`). Todas têm o aviso no próprio arquivo. Ver `Fontes_Volume_e_Descanso.md`.
- **Token sem denylist**: o logout descarta o token no cliente, mas ele continua válido até expirar (`JWT_EXPIRES_IN`, 7 dias por padrão). Invalidar de verdade exige uma lista de revogados consultada a cada requisição — decisão consciente de não pagar esse custo agora. Depois da exclusão de conta o token ainda passa pelo middleware, mas toda rota devolve 404.
- **Recuperação de senha (RF03) e busca de alimentos (RF24)** não foram implementadas — precisam sair do documento como evolução futura, junto das notificações (RNF23–27) e da persistência offline (RNF14).
- **Remover `benchmark/` e `scripts/bench-modelo.ts`** quando o desvio dos macros estiver resolvido e o modelo, decidido. Enquanto essas duas perguntas estiverem abertas, é o único instrumento que as mede.

## Cobertura de testes (RNF28)

```bash
npm run test:cobertura
```

Mede só o núcleo determinístico — `engine.service`, o `porcoes.solver` e as tabelas de política em `data/`. Última medição: **97,0% de statements, 90,0% de branches**, com o `engine.service` em 96,3% e o `porcoes.solver` em 95,5%. O requisito pede 80%.

O recorte é proposital: o RNF28 fala do MOTOR DETERMINÍSTICO, e diluir a medição no resto do código (controllers, rotas, mappers) daria um número que não responde ao requisito. O solver entrou no recorte quando as gramas deixaram de ser resposta do LLM e viraram cálculo — é motor tanto quanto o resto.
