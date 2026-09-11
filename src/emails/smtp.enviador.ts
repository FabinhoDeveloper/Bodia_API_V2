import { Transporter } from "nodemailer";

import { EnviadorEmail, MensagemEmail } from "../types/email.types";

/**
 * Entrega por SMTP (hoje, o do Gmail — ver `config/email.ts`).
 *
 * Recebe a FACTORY do transportador, e não o transportador pronto: assim a
 * composição no arquivo de rota não dispara a validação das credenciais no
 * boot — só o primeiro envio a dispara (ver `config/email.ts`).
 */
export default class SmtpEnviador implements EnviadorEmail {
    private readonly transportador;
    private readonly remetente;

    constructor(transportador: () => Transporter, remetente: string) {
        this.transportador = transportador;
        this.remetente = remetente;
    }

    async enviar({ para, assunto, texto, html }: MensagemEmail): Promise<void> {
        await this.transportador().sendMail({
            from: this.remetente,
            to: para,
            subject: assunto,
            text: texto,
            html,
        });
    }
}
