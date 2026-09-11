/**
 * O e-mail com o link de redefinição de senha (RF03).
 *
 * Função pura, no mesmo papel dos `prompts/`: só monta o texto. Quem decide
 * para quem, quando e se envia é o AuthService; quem entrega é o `EnviadorEmail`.
 */

interface DadosEmailRedefinicao {
    nome: string;
    link: string;
    validadeMin: number;
}

interface EmailMontado {
    assunto: string;
    texto: string;
    html: string;
}

/**
 * O nome vem do cadastro, digitado pelo usuário — sem escapar, um nome com `<`
 * viraria marcação dentro do e-mail.
 */
function escaparHtml(valor: string): string {
    return valor
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function montarEmailRedefinicao({ nome, link, validadeMin }: DadosEmailRedefinicao): EmailMontado {
    const assunto = "BodIA — redefinição de senha";

    const texto = [
        `Olá, ${nome}!`,
        "",
        "Recebemos um pedido para redefinir a senha da sua conta no BodIA.",
        "Para escolher uma senha nova, abra o link abaixo:",
        "",
        link,
        "",
        `O link vale por ${validadeMin} minutos e só pode ser usado uma vez.`,
        "",
        "Se não foi você quem pediu, ignore este e-mail: sua senha continua a mesma.",
    ].join("\n");

    const nomeHtml = escaparHtml(nome);
    const linkHtml = escaparHtml(link);

    // Estilo inline e em tabela, não em <style>: boa parte dos clientes de
    // e-mail (Gmail incluso) descarta folha de estilo e ignora flex/grid.
    const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#0B0B0D;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0B0D;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#16161A;border-radius:18px;padding:28px;font-family:Arial,Helvetica,sans-serif;color:#F5F5F7;">
            <tr><td style="font-size:22px;font-weight:bold;padding-bottom:16px;">BodIA</td></tr>
            <tr><td style="font-size:15px;line-height:22px;padding-bottom:12px;">Olá, ${nomeHtml}!</td></tr>
            <tr><td style="font-size:15px;line-height:22px;color:#9A9AA5;padding-bottom:24px;">
              Recebemos um pedido para redefinir a senha da sua conta. Toque no botão para escolher uma senha nova.
            </td></tr>
            <tr><td style="padding-bottom:24px;">
              <a href="${linkHtml}" style="display:inline-block;background:#C8F135;color:#0B0B0D;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 24px;border-radius:14px;">Redefinir senha</a>
            </td></tr>
            <tr><td style="font-size:13px;line-height:19px;color:#9A9AA5;padding-bottom:12px;">
              O link vale por ${validadeMin} minutos e só pode ser usado uma vez.
              Se o botão não abrir, copie este endereço no navegador:<br>
              <span style="color:#C4B5FD;word-break:break-all;">${linkHtml}</span>
            </td></tr>
            <tr><td style="font-size:13px;line-height:19px;color:#9A9AA5;">
              Se não foi você quem pediu, ignore este e-mail: sua senha continua a mesma.
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    return { assunto, texto, html };
}
