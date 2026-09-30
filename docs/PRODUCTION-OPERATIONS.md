# Operação das três aplicações AL MOVE

## Verificação diária

Executar `npm run verify:production`. O comando é só de leitura e confirma:

- `portal.almove.pt`, `crm.almove.pt` e `coach.almove.pt` respondem no respetivo domínio;
- CSP, HSTS e bloqueio de incorporação estão ativos;
- endpoints de equipa, dados do aluno e convites recusam pedidos anónimos;
- os três domínios constam da configuração autorizada do Firebase Authentication.

O workflow `.github/workflows/portal-smoke.yml` repete estes testes todos os dias e em cada alteração integrada em `main`.

## HMAC Portal ↔ Apps Script

As duas plataformas têm de usar exatamente o mesmo `PORTAL_APPS_SCRIPT_HMAC_SECRET`. Um utilizador autenticado com papel `admin` ou `coach` pode abrir `/api/dev-crm-ops?clientEmail=EMAIL_DE_TESTE` no domínio do CRM ou Coach. A rota usa os segredos dentro da Vercel, devolve apenas estados booleanos e nunca devolve o segredo nem dados do aluno.

O diagnóstico aceita o aluno conhecido e confirma que um email inexistente não recebe dados. Não descarregar variáveis de Produção para executar esta verificação.

## Recuperação de palavra-passe

Usar apenas contas de teste ou da equipa. Verificar a mensagem neutra em cada aplicação e confirmar a receção do email:

- CRM: `https://crm.almove.pt/dev-crm.html`;
- Coach: `https://coach.almove.pt/`;
- Portal: `https://portal.almove.pt/`.

O Firebase deve manter autorizados `portal.almove.pt`, `crm.almove.pt` e `coach.almove.pt`.

## Papéis e isolamento

- `admin` e `coach` podem abrir endpoints CRM/Coach.
- `client` precisa de um `clientId` ativo e não pode entrar no CRM.
- Todas as leituras e gravações do browser passam pela API Vercel.
- As regras Firestore negam acesso direto do browser.
- Uma sessão de treino só aceita gravações do `clientId` a que pertence.

O teste `tests/access-isolation.mjs` valida estes limites sem usar dados reais.

## Backups Firestore

Os backups geridos exigem faturação ativa e uma função com `roles/datastore.backupSchedulesAdmin` ou `roles/datastore.owner`. A mesma rota protegida `/api/dev-crm-ops?clientEmail=EMAIL_DE_TESTE` indica se a API está acessível e se existe uma agenda diária.

Depois de confirmar faturação e permissões, executar o utilitário num ambiente administrativo seguro que já tenha `FIREBASE_SERVICE_ACCOUNT_JSON` disponível para criar uma agenda diária com retenção de sete dias:

```powershell
node scripts/firestore-backups.mjs create-daily
```

Alterar `FIRESTORE_BACKUP_RETENTION` para outro período entre um dia e 14 semanas. O restauro deve ser ensaiado para uma base de dados nova, nunca por cima de Produção. Confirmar contagens e uma amostra de alunos, planos, sessões e pagamentos antes de promover dados restaurados.

Referências oficiais: [backups Firestore](https://cloud.google.com/firestore/docs/backups) e [recuperação de desastre](https://firebase.google.com/docs/firestore/disaster-recovery).

## Publicação

1. Executar `npm test`.
2. Criar o deployment com `npx vercel deploy --prod --yes --skip-domain`.
3. Validar o URL imutável com `npm run verify:production` ou sondas equivalentes.
4. Associar apenas os domínios necessários.
5. Repetir os testes de produção.
6. Integrar em `main` apenas quando as três aplicações estiverem estáveis.
