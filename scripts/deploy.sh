#!/usr/bin/env bash
#
# Roteiro de deploy executado NA EC2, enviado por stdin pelo GitHub Actions
# (`ssh ... "bash -s" < scripts/deploy.sh`). Por isso o script fica versionado:
# a maquina executa a versao que veio junto do commit sendo publicado, entao
# mudar o processo de deploy e um commit revisavel como qualquer outro.
#
# Variaveis esperadas do ambiente (o workflow passa as duas na linha do ssh):
#   APP_DIR  caminho do clone na EC2   (ex.: /home/ubuntu/Bodia_API_V2)
#   PM2_APP  nome do processo no PM2   (ex.: bodia-api)
#
# Para rodar na mao, fora do CI:
#   ssh <user>@<host> "APP_DIR=... PM2_APP=... bash -s" < scripts/deploy.sh

# -e aborta no primeiro comando que falhar, -u trata variavel nao definida como
# erro e pipefail impede que uma falha no meio de um pipe passe batido. E o que
# torna o deploy seguro: se `migrate deploy` falhar, o `pm2 reload` NAO acontece
# e o PM2 segue servindo o codigo antigo, que combina com o banco antigo.
set -euo pipefail

: "${APP_DIR:?APP_DIR nao definido}"
: "${PM2_APP:?PM2_APP nao definido}"

cd "$APP_DIR"

echo "==> Atualizando o codigo em $APP_DIR"
git fetch --prune origin master
# `reset --hard` em vez de `pull`: se a arvore do servidor tiver divergido, o
# pull abriria um conflito e o deploy travaria esperando um input que nao existe
# numa sessao nao interativa. O .env nao e afetado — esta no .gitignore, entao e
# arquivo nao rastreado e o reset nao encosta nele.
git reset --hard origin/master
echo "==> Commit publicado: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"

echo "==> Instalando dependencias"
npm ci

# O client precisa existir antes do tsc: src/config/prisma.ts e os repositories
# importam @prisma/client, e sem o client gerado a compilacao nao acha os tipos.
echo "==> Gerando o Prisma Client"
npx prisma generate

echo "==> Compilando"
npm run build

# `migrate deploy`, nunca `migrate dev`: so aplica as migrations pendentes, nao
# gera migration nova nem reseta o banco.
echo "==> Aplicando migrations"
npx prisma migrate deploy

# Vira a marca de versao exposta pela rota `/` (src/config/versao.ts). Precisa
# ser exportada ANTES do bloco do PM2: e o `--update-env` do reload que faz o
# processo reler o ambiente, e o `start` do primeiro deploy herda daqui.
GIT_COMMIT="$(git rev-parse --short HEAD)"
export GIT_COMMIT

echo "==> Recarregando o PM2"
if pm2 describe "$PM2_APP" > /dev/null 2>&1; then
    # --update-env faz o PM2 reler o .env no reload; sem isso, mudar uma
    # variavel na maquina so teria efeito num restart completo.
    pm2 reload "$PM2_APP" --update-env
else
    # Primeiro deploy numa maquina onde o processo ainda nao foi registrado.
    pm2 start dist/server.js --name "$PM2_APP"
fi
pm2 save

echo "==> Deploy concluido"
