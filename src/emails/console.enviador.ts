import { EnviadorEmail, MensagemEmail } from "../types/email.types";

/**
 * "Envia" imprimindo no log — usado com SIMULAR_EMAIL=true.
 *
 * Imprime o TEXTO inteiro porque é nele que está o link: é o que permite
 * percorrer a redefinição de senha em dev, copiando o link do terminal, sem
 * credencial do SES.
 *
 * Nunca ligar em produção: o link no log é um acesso à conta de alguém.
 */
export default class ConsoleEnviador implements EnviadorEmail {
    async enviar({ para, assunto, texto }: MensagemEmail): Promise<void> {
        console.log(`[email simulado] para: ${para}\nassunto: ${assunto}\n\n${texto}\n`);
    }
}
