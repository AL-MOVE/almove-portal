# Passagem para produção — CRM e App Coach

## Estado atual

O portal do cliente em `portal.almove.pt` já é produção e não faz parte desta passagem.

O CRM e a App Coach publicados hoje são exclusivamente **Development**. A API recusa outros projetos Firebase de propósito: os endpoints de CRM verificam que `FIREBASE_PROJECT_ID` é `almove-portal-dev`. Por isso, não se devem associar ainda `crm.almove.pt` nem `coach.almove.pt` ao deployment de Development.

## Objetivo

Publicar duas entradas independentes, mas com a mesma conta de equipa e os mesmos dados operacionais:

| Superfície | Domínio | Página |
| --- | --- | --- |
| Portal do cliente | `portal.almove.pt` | `/` |
| CRM completo | `crm.almove.pt` | `/coach-firebase.html` |
| App Coach móvel | `coach.almove.pt` | `/coach-mobile.html` |

## Pré-requisitos obrigatórios

1. Concluir a checklist em `docs/qa-coach-mobile.md` numa conta de equipa e num cliente de teste.
2. Escolher o projeto Firebase de produção que guardará os dados do CRM/Coach. Não reutilizar dados Development sem cópia validada e paridade confirmada.
3. Criar uma cópia de segurança exportável dos dados de produção antes de qualquer migração.
4. Criar uma conta de equipa de teste no Firebase de produção e confirmar que não tem função de cliente.
5. Configurar no ambiente **Production** da Vercel, exclusivamente pelos Secrets, estes valores do projeto Firebase escolhido:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `FIREBASE_WEB_CONFIG_JSON`
   - `PORTAL_APPS_SCRIPT_HMAC_SECRET`, caso os fluxos ligados ao portal o exijam

Nunca colocar estes valores no repositório, no JavaScript do browser ou numa captura de ecrã.

## Alteração de código antes de ligar domínios

Os bloqueios que hoje comparam diretamente `almove-portal-dev` devem passar a ler uma configuração explícita de ambiente no servidor. A alteração deve manter dois modos estritamente separados:

- **Development:** aceita apenas o projeto Development atual.
- **Production:** aceita apenas o projeto Firebase de produção escolhido.

A verificação deve continuar no servidor em todos os endpoints. O browser não pode escolher o ambiente nem enviar um identificador que altere essa decisão.

Também é necessário substituir o tratamento especial atual de `portal.almove.pt` em `js/firebase-config.js` por uma lista de origens de produção aprovada, que inclua apenas `portal.almove.pt`, `crm.almove.pt` e `coach.almove.pt` quando os domínios forem ativados.

## Sequência de publicação

1. Implementar e testar a separação de ambiente no branch Development.
2. Executar os testes automáticos e a checklist de telemóvel.
3. Fazer uma cópia de teste para o Firebase de produção e confirmar a paridade de clientes, packs, sessões, planos, pagamentos e despesas.
4. Fazer login com a conta de equipa de teste e validar CRM, App Coach, confirmação/cancelamento de sessões PT e gravação de uma sessão de teste.
5. Autorizar no Firebase Authentication os domínios `crm.almove.pt` e `coach.almove.pt`.
6. Adicionar os dois domínios em **Vercel → Settings → Domains**, ambos no ambiente Production. Não criar um Custom Environment pago para isto.
7. Fazer o DNS indicado pela Vercel para cada subdomínio e confirmar HTTPS.
8. Repetir os testes com os domínios finais, incluindo instalação PWA da App Coach.

## Critérios para abrir ao uso diário

- CRM abre em `crm.almove.pt` e só uma conta de equipa autorizada entra.
- App Coach abre em `coach.almove.pt`, instala como PWA e mantém sessão de forma segura.
- Os dados apresentados vêm apenas do Firebase de produção.
- Uma sessão PT confirmada, cancelada ou abandonada produz o estado esperado.
- O portal do cliente continua operacional em `portal.almove.pt` sem alterações de dados nem autenticação.

## Reversão

Se falhar uma validação, remover o domínio novo da Vercel ou repor o DNS anterior; isto interrompe a entrada nova sem tocar no portal do cliente. Não apagar dados nem alterar o Firebase de produção durante a reversão. Corrigir e repetir a validação num cliente de teste antes de voltar a expor o domínio.
