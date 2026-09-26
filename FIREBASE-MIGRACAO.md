# Migração para Firebase Auth — AL MOVE

Esta preparação não altera o login atual. O portal continua com link temporário por email até uma conta Firebase de teste estar validada.

## O que fica no Firebase

- Email e palavra-passe, confirmação de email, recuperação de palavra-passe e sessões persistentes.
- A revogação de sessões do Firebase passa a ser confirmada pela Vercel em cada pedido autenticado.
- No piloto, uma conta Firebase confirmada é ligada ao único cliente CRM com o mesmo email; emails duplicados ou cancelados são recusados.

O Apps Script não recebe palavras-passe, nem chaves Firebase, nem ID tokens. Recebe uma autorização HMAC de cinco minutos emitida pela Vercel depois de validar o token Firebase.

## Configuração única

1. Criar o projeto **almove-portal** no Firebase Console.
2. Em **Authentication > Sign-in method**, ativar **Email/Password** e confirmação de email.
   Em **Authentication > Settings > Authorized domains**, manter `portal.almove.pt`.
   Quando CRM/Coach usarem o mesmo projeto, manter também `crm.almove.pt` e
   `coach.almove.pt`. Estes domínios são necessários para links de recuperação
   e confirmação que regressam à aplicação.
3. Em **Project settings > Your apps**, criar a app Web `portal.almove.pt`.
4. Em **Service accounts**, criar uma chave para a Vercel. Guardar o JSON apenas nos Environment Variables da Vercel como `FIREBASE_SERVICE_ACCOUNT_JSON`.
5. Na Vercel criar:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `PORTAL_APPS_SCRIPT_HMAC_SECRET` (um segredo aleatório com pelo menos 32 caracteres)
6. No Apps Script, em **Project Settings > Script properties**, criar `PORTAL_APPS_SCRIPT_HMAC_SECRET` com exatamente o mesmo valor.
7. Para o piloto, criar a conta Firebase com o mesmo email que está na ficha única e ativa do cliente no CRM. A aplicação exige confirmação desse email.

No deployment de produção, `FIREBASE_PROJECT_ID` e o `project_id` da conta de
serviço têm de ser ambos `almove-portal`; a variável
`ALMOVE_CRM_PROJECT_ID` tem de usar o mesmo valor quando `ALMOVE_CRM_ENV` é
`production`. O `PORTAL_APPS_SCRIPT_HMAC_SECRET` da Vercel e do Apps Script
tem de continuar idêntico. Uma divergência aqui permite o login no browser,
mas faz o portal rejeitar a sessão na primeira leitura.

Nunca colocar a chave de serviço, o segredo HMAC ou palavras-passe no GitHub, no HTML ou numa folha de cálculo.

## Piloto

Criar uma conta Firebase de teste ligada a um único ID de cliente do CRM. Validar: login, fechar/reabrir PWA, recuperação de palavra-passe, revogar sessão, leitura de treinos e gravação de check-in. Só depois ligamos a interface Firebase no `index.html` e desativamos o link temporário.
