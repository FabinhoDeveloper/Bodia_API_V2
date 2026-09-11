/** Tipos do envio de e-mail. */

/**
 * Um e-mail pronto para sair. Vai sempre com as duas versões: há cliente de
 * e-mail que só mostra texto, e o texto também pesa a favor nos filtros de spam.
 */
export interface MensagemEmail {
    para: string;
    assunto: string;
    texto: string;
    html: string;
}

/**
 * Quem entrega o e-mail. Interface, e não a classe SMTP direto, pelo mesmo
 * motivo do `GeradorDePlano`: em dev (SIMULAR_EMAIL) e nos testes, quem
 * "envia" só imprime ou registra — e o AuthService não precisa saber qual.
 */
export interface EnviadorEmail {
    enviar(mensagem: MensagemEmail): Promise<void>;
}
