import nodemailer, { Transporter } from "nodemailer";

/**
 * Envio de e-mail — hoje pelo SMTP do Gmail, com uma senha de app da conta do
 * projeto.
 *
 * O arquivo se chama `email.ts`, e não `gmail.ts`, pelo mesmo motivo de `ia.ts`:
 * SMTP é protocolo, não provider. O Gmail é só o host em `SMTP_HOST`, e trocar
 * por outro serviço (Amazon SES, ou um Mailtrap em dev) é editar o `.env`.
 *
 * Por que Gmail, e não o SES: o projeto não tem domínio próprio, e o DuckDNS não
 * aceita os registros de DNS com que o SES verifica um domínio. Pelo SES, um
 * remetente @gmail.com sairia sem a assinatura do Gmail e tenderia a cair no
 * spam; pelo SMTP do próprio Gmail ele sai assinado. De quebra, sem sandbox:
 * envia para qualquer endereço desde o primeiro dia (limite de ~500/dia).
 *
 * Porta 587 com STARTTLS, e não a 25: na EC2 a AWS limita a saída pela porta 25.
 * A senha é uma SENHA DE APP (myaccount.google.com/apppasswords, exige
 * verificação em duas etapas), nunca a senha da conta Google.
 */

let transportador: Transporter | null = null;

/**
 * Lê a variável sem os espaços das pontas. Um espaço colado no `.env`
 * (`SMTP_HOST=" smtp..."`) não dá erro de configuração: vira um host que o DNS
 * não resolve, e o sintoma aparece longe da causa.
 */
function ler(nome: string): string {
    return (process.env[nome] ?? "").trim();
}

/**
 * Quando true, o e-mail não sai: o conteúdo (com o link) é impresso no log.
 * Serve para exercitar a redefinição em dev sem credencial de SMTP.
 *
 * FALSE por padrão, ao contrário do SIMULAR_IA. A rota de "esqueci a senha"
 * responde 202 para qualquer e-mail, de propósito — então um padrão true em
 * produção faria o servidor dizer "enviamos" e nunca enviar, sem nada acusar.
 */
export const simularEmail = (ler("SIMULAR_EMAIL") || "false").toLowerCase() === "true";

/**
 * Remetente dos e-mails. No Gmail, precisa ser a própria conta do `SMTP_USER`
 * (ou um alias verificado nela): qualquer outro endereço o Gmail reescreve.
 */
export const emailRemetente = ler("EMAIL_REMETENTE");

/**
 * Endereço público do backend, sem barra no fim — é a base do link que vai no
 * e-mail (`<url>/redefinir-senha#token=…`).
 *
 * O padrão só serve a dev. Em produção o envio real EXIGE a variável (ver
 * `getTransportadorEmail`): um link para localhost chegaria na caixa do
 * usuário parecendo certo e não abriria nada.
 */
export const urlPublica = (
    ler("URL_PUBLICA") || `http://localhost:${ler("PORT") || 3333}`
).replace(/\/+$/, "");

/**
 * O cliente SMTP, criado na primeira chamada.
 *
 * Factory, e não o cliente pronto, pela mesma razão do `getIaClient`: sem
 * credencial o servidor sobe, e só o envio falha — com uma mensagem que diz o
 * que configurar.
 */
export function getTransportadorEmail(): Transporter {
    if (!transportador) {
        const faltando = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_REMETENTE", "URL_PUBLICA"].filter(
            (nome) => !ler(nome),
        );

        if (faltando.length > 0) {
            throw new Error(
                `E-mail não configurado — defina ${faltando.join(", ")} no .env (ver .env.example), ` +
                    "ou SIMULAR_EMAIL=true para só imprimir no log",
            );
        }

        const porta = Number(ler("SMTP_PORT") || 587);

        transportador = nodemailer.createTransport({
            host: ler("SMTP_HOST"),
            port: porta,
            // 465 é TLS desde o primeiro byte; 587 começa em texto e sobe para
            // TLS com STARTTLS — e o `requireTLS` recusa seguir se o servidor
            // não oferecer, em vez de mandar a credencial em claro.
            secure: porta === 465,
            requireTLS: porta !== 465,
            auth: {
                user: ler("SMTP_USER"),
                pass: ler("SMTP_PASS"),
            },
        });
    }

    return transportador;
}
