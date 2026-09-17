# Portal AL MOVE v53

Publica **todo o conteúdo desta pasta** no repositório `AL-MOVE/almove-portal`, preservando as mesmas pastas. Não publiques apenas os ficheiros da raiz: as pastas `js` e `api` são obrigatórias.

- `index.html`
- `sw.js`
- `vercel.json`
- `manifest.json`
- `al-move-mark.png`
- `api/almove.js`
- `api/health.js`
- `js/avatar-studio.js`
- `js/activity-heatmap.js`

Antes de confirmar no GitHub, confirma que aparecem no repositório estes dois caminhos:

- `js/avatar-studio.js`
- `js/activity-heatmap.js`

Se algum deles faltar, o Avatar e o Mapa AL MOVE abrem sem conteúdo.

O `index.html` abre em **Início** e inclui a página de entrada por email. No Perfil, “Os meus dados” envia alterações para aprovação, “O teu plano” mostra o saldo do pack num painel gráfico e passam a existir avatar, Mapa AL MOVE e Passaporte Técnico. O treino usa RIR por definição, a Sessão Mínima entra no registo único de eventos e a conclusão de um treino só avança depois de o servidor confirmar a prescrição e o registo. Links antigos com `?portal=` ou `?token=` continuam bloqueados. O `api/almove.js` e os dois ficheiros da pasta `js` são obrigatórios.

Esta versão corrige o aviso de atualização que ficava preso, evita mostrar “a sincronizar” enquanto a sessão por email está a ser validada, evita guardar uma cópia antiga da página no service worker e apresenta uma animação discreta no estado de carregamento. O backend passa a validar o formato do email antes de o mostrar no perfil.

Depois do deploy da Vercel, abre `https://portal.almove.pt/`, introduz um email de teste associado a um cliente e confirma que o email recebe um link válido durante 15 minutos.

Usa um email exclusivo: se o mesmo email estiver associado a dois clientes ativos, o login é bloqueado para evitar abrir o perfil errado.

O código Apps Script já está publicado na implementação `251`. Publica os ficheiros de frontend acima no GitHub para colocar esta mudança no domínio `portal.almove.pt`.
