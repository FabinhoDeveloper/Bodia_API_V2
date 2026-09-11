import { SENHA_MIN } from "../config/auth";

/**
 * A página que o link do e-mail abre (RF03) — a única coisa que esta API serve
 * que não é JSON.
 *
 * Existe porque o app não tem deep link: o e-mail precisa abrir em algum lugar
 * que funcione em qualquer cliente de e-mail, no Expo Go e no APK, sem build
 * nova. Uma página do próprio backend cobre os três.
 *
 * É string num módulo TS, e não um `.html` solto, porque o `tsc` só copia `.ts`
 * para `dist/` — um arquivo HTML ficaria para trás no deploy.
 *
 * O token chega no FRAGMENTO (`#token=…`), lido pelo JS da página: o navegador
 * não manda o fragmento ao servidor, então ele não fica no access log do nginx.
 * O script inteiro evita `${}` de template literal para não se confundir com a
 * interpolação deste arquivo — o único valor interpolado é o `SENHA_MIN`.
 *
 * As cores são as de `mobile/src/constants/theme.js`, para a página parecer o
 * app de onde o usuário veio.
 */
export const PAGINA_REDEFINIR_SENHA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>BodIA — Redefinir senha</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: #0B0B0D; color: #F5F5F7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { width: 100%; max-width: 420px; background: #16161A; border-radius: 18px; padding: 28px 24px; }
  h1 { margin: 0 0 6px; font-size: 22px; }
  p.sub { margin: 0 0 24px; color: #9A9AA5; font-size: 14px; line-height: 20px; }
  label { display: block; font-size: 14px; color: #9A9AA5; margin-bottom: 8px; }
  input {
    width: 100%; height: 54px; border-radius: 14px; border: 1.5px solid transparent;
    background: #0B0B0D; color: #F5F5F7; font-size: 16px; padding: 0 16px; margin-bottom: 18px; outline: none;
  }
  input:focus { border-color: #C8F135; }
  button {
    width: 100%; height: 54px; border: 0; border-radius: 14px; background: #C8F135; color: #0B0B0D;
    font-size: 16px; font-weight: 600; cursor: pointer;
  }
  button:disabled { opacity: 0.5; cursor: default; }
  .ajuda { margin: -10px 0 18px; font-size: 13px; color: #9A9AA5; }
  #msg { margin-top: 18px; font-size: 14px; line-height: 20px; }
  #msg.erro { color: #FF6B6B; }
  #msg.ok { color: #C8F135; }
</style>
</head>
<body>
<main>
  <h1>Redefinir senha</h1>
  <p class="sub">Escolha uma senha nova para a sua conta no BodIA.</p>
  <form id="form" method="post" novalidate>
    <label for="nova">Nova senha</label>
    <input id="nova" type="password" autocomplete="new-password" required>
    <p class="ajuda">Mínimo de ${SENHA_MIN} caracteres</p>
    <label for="confirmacao">Repita a nova senha</label>
    <input id="confirmacao" type="password" autocomplete="new-password" required>
    <button id="botao" type="submit">Salvar nova senha</button>
  </form>
  <p id="msg" role="status"></p>
</main>
<script>
(function () {
  var MIN = ${SENHA_MIN};
  var form = document.getElementById("form");
  var botao = document.getElementById("botao");
  var msg = document.getElementById("msg");
  var token = new URLSearchParams(window.location.hash.slice(1)).get("token");

  function mostrar(texto, tipo) {
    msg.textContent = texto;
    msg.className = tipo;
  }

  if (!token) {
    form.hidden = true;
    mostrar("Este link está incompleto ou já foi usado. Peça um novo pelo app, em \\"Esqueci minha senha\\".", "erro");
    return;
  }

  form.addEventListener("submit", function (evento) {
    evento.preventDefault();

    var nova = document.getElementById("nova").value;
    var confirmacao = document.getElementById("confirmacao").value;

    if (nova.length < MIN) {
      mostrar("A nova senha deve ter pelo menos " + MIN + " caracteres.", "erro");
      return;
    }

    if (nova !== confirmacao) {
      mostrar("As senhas não conferem.", "erro");
      return;
    }

    botao.disabled = true;
    botao.textContent = "Salvando…";
    mostrar("", "");

    fetch("/api/senha/redefinir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token, novaSenha: nova, confirmacao: confirmacao })
    })
      .then(function (resposta) {
        if (resposta.ok) {
          // O link não serve mais: tirar o token da barra de endereço evita que
          // ele fique no histórico parecendo utilizável.
          window.history.replaceState(null, "", window.location.pathname);
          form.hidden = true;
          mostrar("Senha alterada! Volte ao app e entre com a nova senha.", "ok");
          return;
        }

        return resposta.json().then(
          function (corpo) { throw new Error((corpo && corpo.message) || "Não foi possível redefinir a senha."); },
          function () { throw new Error("Não foi possível redefinir a senha."); }
        );
      })
      .catch(function (erro) {
        var texto = erro instanceof TypeError ? "Sem conexão com o servidor. Tente de novo." : erro.message;
        mostrar(texto, "erro");
        botao.disabled = false;
        botao.textContent = "Salvar nova senha";
      });
  });
})();
</script>
</body>
</html>
`;
