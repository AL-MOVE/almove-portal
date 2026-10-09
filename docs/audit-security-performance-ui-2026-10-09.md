# Auditoria de segurança, desempenho e UI/UX — 9 de outubro de 2026

## Âmbito e arquitetura observada

A aplicação não usa React. É composta por três interfaces PWA em HTML, CSS e JavaScript sem framework (`coach-firebase.html`, `coach-mobile.html` e `index.html`), APIs serverless Node.js ES modules na Vercel, Firebase Authentication/Admin SDK, Firestore e integrações com Google Apps Script e Google Calendar.

O pedido não incluiu o erro nem o stack trace prometidos pelo texto (`[Cole o erro/stack trace aqui]`). Por isso, esta auditoria identifica problemas concretos no repositório, mas não atribui uma causa raiz a um erro específico sem essa evidência.

## Estado da correção

Foi preparado um primeiro lote de correções, ainda por publicar em Produção:

- **S1 corrigido:** `@firebase/firestore` passa a usar `@grpc/grpc-js@1.13.6`; `npm audit --omit=dev` devolve zero vulnerabilidades e o bundle Firebase foi reconstruído.
- **S4 corrigido no fluxo atual:** o limite de reenvio de convites é reservado numa transação Firestore e cada assinatura HMAC aceite é consumida atomicamente uma única vez. Os documentos incluem `expiresAt`; a eliminação automática depende de configurar a política TTL da coleção `inviteHmacNonces`.
- **B1 corrigido:** o proxy mede o corpo serializado com `Buffer.byteLength`, sem confiar apenas em `Content-Length`.
- **B2 corrigido:** execução, pós-treino e sessão mínima usam transações Firestore e devolvem sucesso idempotente perante pedidos simultâneos. A execução reserva uma das 500 escritas da transação para o documento da operação.
- **U1/U2 parcialmente corrigidos:** o avatar do perfil passou a botão semântico e os campos do editor de exercícios e da sessão PT têm rótulos associados. Foi acrescentado um contrato automático de acessibilidade.

Depois destas alterações, a suíte completa passou com **46/46 testes**, incluindo isolamento entre alunos, sintaxe, contratos das APIs e smoke test de `portal.almove.pt`.

Continuam a exigir trabalho estrutural separado: retirar `unsafe-inline` e os handlers inline (S2), substituir o armazenamento legado da sessão (S3), uniformizar respostas de erro internas (S5), criar índices/consultas limitadas para eliminar leituras integrais (P1), modularizar os ficheiros monolíticos (P2) e completar a revisão de contraste/semântica em todas as vistas (U1–U4).

## Resultado executivo

Não foi encontrada uma falha crítica que permita a um aluno consultar dados de outro. A associação do Portal deriva o aluno do email Firebase autenticado, exige correspondência única e os testes de isolamento passaram. O Firestore também nega todo o acesso direto pelo browser; as operações passam pelas APIs da Vercel.

Há três trabalhos prioritários:

1. eliminar a dependência transitiva vulnerável `@grpc/grpc-js@1.9.16` do lockfile;
2. retirar gradualmente `unsafe-inline` da Content Security Policy e os 266 handlers HTML inline do CRM;
3. substituir leituras integrais de coleções Firestore por índices e consultas limitadas.

## Achados de segurança

### S1 — Dependência transitiva vulnerável no lockfile — prioridade alta de manutenção

`npm audit --omit=dev` encontrou quatro entradas agregadas, todas originadas por `@firebase/firestore -> @grpc/grpc-js@1.9.16`. A versão é afetada por CVE-2026-101916 (alta) e CVE-2026-101915 (baixa); as versões corrigidas são `1.13.6` e `1.14.5`.

Impacto real atual: reduzido. O backend usa `firebase-admin`, cuja árvore resolve `@grpc/grpc-js@1.14.5`, e o bundle do browser importa apenas `firebase/app` e `firebase/auth`, sem Firestore/gRPC. Mesmo assim, manter código vulnerável instalado aumenta o risco de uso acidental futuro e falha controlos de supply chain.

Correção proposta:

- fixar uma versão corrigida através de `overrides` de npm, preferencialmente apenas dentro de `@firebase/firestore`;
- regenerar `package-lock.json`;
- reconstruir `js/firebase-sdk.js`;
- executar `npm audit --omit=dev`, `npm test` e `npm run verify:production` antes de publicar;
- não aceitar a sugestão automática de downgrade para Firebase 9 sem uma análise de compatibilidade.

Referências: `package.json`, `package-lock.json:736-799`, `js/firebase-sdk-entry.js:1-4`. Advisory: https://github.com/advisories/GHSA-m9gg-hp2v-232j

### S2 — A CSP permite JavaScript e CSS inline — prioridade alta

`vercel.json:26` contém `script-src 'self' 'unsafe-inline'` e `style-src 'self' 'unsafe-inline'`. O CRM tem 266 handlers inline e 23 blocos `<script>`. Isto reduz bastante o valor da CSP perante uma futura injeção HTML: uma string que chegue ao DOM poderá executar código inline.

Não foi encontrada uma exploração XSS direta nas rotas revistas. As saídas usam `escaparHtmlCRM` e os argumentos JavaScript usam `idParaOnclickCRM`; os testes específicos de encoding passaram. O problema é de defesa em profundidade e torna qualquer erro futuro mais grave.

Correção proposta, por fases:

1. trocar `onclick`, `onchange`, `oninput`, `onkeydown` e `onerror` por `addEventListener` e delegação de eventos;
2. mover scripts e estilos para ficheiros versionados;
3. aplicar nonces ou hashes durante a transição;
4. remover `unsafe-inline` de `script-src`, depois de `style-src`;
5. considerar Trusted Types para os pontos que ainda precisem de gerar HTML.

Referências: `vercel.json:22-40`, `coach-firebase.html:7009-7017`, `coach-firebase.html:7812-7828`.

### S3 — Sessão legada e dados sensíveis permanecem em `localStorage` — prioridade média

O Portal ainda lê `ALMOVE_SESSAO_PORTAL` de `localStorage` e mantém caches de bootstrap, métricas, avaliação física e treino. O logout apaga as chaves `ALMOVE_*`, o que é correto, mas `localStorage` continua acessível a qualquer JavaScript executado na origem. A combinação com uma CSP permissiva aumenta o impacto de XSS.

Correção proposta:

- concluir a retirada do token permanente legado assim que todos os alunos estiverem em Firebase Auth;
- preferir sessão `HttpOnly`, `Secure`, `SameSite=Lax/Strict` para credenciais de aplicação;
- guardar no dispositivo apenas rascunhos mínimos e cifrar/expirar dados clínicos ou de avaliação;
- limpar dados também em eventos de revogação e troca de conta, não apenas no botão de logout.

Referências: `index.html:2096-2123`, `index.html:2279-2283`, `index.html:2595-2605`.

### S4 — Limites de convites não são atómicos e o HMAC pode ser repetido durante cinco minutos — prioridade média

O convite moderno limita pedidos por email a um por minuto, mas faz `get()` e só depois grava o novo instante num batch. Dois pedidos concorrentes podem passar a verificação antes de qualquer gravação. O endpoint HMAC legado valida timestamp e assinatura com comparação constante, mas não persiste um nonce; o mesmo pedido assinado pode ser repetido durante a janela de cinco minutos.

Correção proposta:

- executar a leitura/atualização do rate limit numa transação Firestore;
- usar limites por email, UID da equipa e IP, com janelas e tetos distintos;
- incluir `nonce` na assinatura HMAC e consumi-lo uma única vez numa coleção com TTL;
- manter mensagens indistinguíveis para emails existentes e inexistentes nas rotas públicas.

Referências: `server/dev-crm/dev-crm-portal-access.js:84-101`, `api/invite.js:11-27`.

### S5 — Alguns erros internos são devolvidos diretamente ao CRM — prioridade baixa

Vários handlers transformam `erro.message` diretamente no campo `erro`. Como estas rotas exigem papel `coach/admin`, a exposição é limitada, mas mensagens do SDK podem revelar nomes internos, IDs de projeto ou ligações de índices.

Correção proposta: mapear erros para códigos públicos estáveis, incluir apenas `requestId` na resposta e registar o detalhe completo do lado do servidor.

Exemplos: `server/dev-crm/dev-crm-checkins.js:30`, `server/dev-crm/dev-crm-pt-session.js:50`.

## Autenticação e isolamento — controlos que estão corretos

- Firebase ID tokens são verificados com revogação ativa e email confirmado: `api/_firebase.js:38-61`.
- Os papéis `coach/admin` são exigidos em todas as rotas CRM revistas: `api/_crm-development.js:26-29`.
- O Portal deriva o cliente a partir do email autenticado e rejeita associações ambíguas: `api/almove.js:47-71`.
- O registo de séries confirma que a sessão pertence ao cliente e que o exercício pertence ao plano: `api/_firestore.js:85-120`.
- O Firestore nega acesso direto ao browser: `firestore.rules:7-11`.
- APIs e dados autenticados não entram na cache dos service workers: `coach-sw.js:34-53`, `coach-mobile-sw.js:25-34`, `sw.js:55-65`.
- Não existe SQL; logo, injeção SQL não se aplica. Os valores usados nas consultas Firestore são normalizados como strings/números, e não foi encontrada construção dinâmica de nomes de coleção a partir do aluno.

## Bugs lógicos e robustez

### B1 — O limite do corpo depende do cabeçalho `Content-Length`

`api/almove.js:137-144` assume zero quando `Content-Length` não existe. Um pedido chunked ou uma plataforma que remova esse cabeçalho pode contornar o limite de 50 KB da aplicação, ficando apenas sujeito ao limite da Vercel.

Correção proposta: depois do parse, medir `Buffer.byteLength(JSON.stringify(dados), 'utf8')`; idealmente aplicar um parser com limite antes de materializar o corpo em memória.

### B2 — Operações idempotentes têm uma pequena condição de corrida

Em `server/portal-training-records.js:54-64` e `68-76`, a existência é lida antes do `create()`. Dois pedidos simultâneos com o mesmo `eventId` podem fazer com que o segundo devolva erro em vez de `{ repetido: true }`.

Correção proposta: executar verificação e criação numa transação ou capturar `ALREADY_EXISTS` e devolver sucesso idempotente.

### B3 — Não foi encontrado erro de sintaxe atual

Os 22 scripts inline do CRM compilam nos testes e a bateria de 45 testes passou. Não há evidência atual de erro de sintaxe ou de um bug lógico que explique um stack trace, porque nenhum stack trace foi fornecido.

## Desempenho e memória

### P1 — Leituras integrais de coleções vão degradar com o crescimento

Exemplos confirmados:

- cada associação do Portal lê todos os clientes: `api/almove.js:47-57`;
- o plano ativo lê toda a biblioteca de exercícios: `api/almove.js:73-78`;
- a Agenda, dashboard, pagamentos, renovações e centro de comando leem coleções inteiras em vários pedidos;
- o histórico de prontidão e de exercícios lê todo o histórico do aluno e só depois ordena/limita em memória: `server/portal-today.js:91-98`, `server/portal-training-records.js:91-112`.

Com 18 clientes isto funciona; com centenas de clientes e milhares de sessões aumenta a latência, as leituras faturadas e a probabilidade de timeout.

Correção proposta:

- criar índice por hash de email para `crmMigrationClients`, garantindo unicidade em transação;
- consultar por `clientId/idCliente`, `mesAno`, estado e datas, com `orderBy` + `limit`;
- guardar agregados mensais para dashboard e finanças;
- versionar a biblioteca e mantê-la em cache curta do lado do servidor;
- uniformizar `clientId` e `idCliente` durante uma migração de esquema.

### P2 — Ficheiros monolíticos aumentam parse, manutenção e regressões

- `coach-firebase.html`: 701 581 bytes, 11 420 linhas, 2 240 elementos HTML, 23 scripts e 13 estilos;
- `index.html`: 427 149 bytes e 6 075 linhas;
- `coach-mobile.html`: 132 519 bytes.

Correção proposta: dividir por módulos de domínio (`auth`, `clientes`, `pagamentos`, `agenda`, `planos`, `biblioteca`) e carregar vistas secundárias quando forem abertas. O primeiro alvo deve ser `coach-firebase.html`, mantendo uma API de estado pequena para cada módulo.

### P3 — Fugas de memória

Não foi encontrada uma fuga persistente confirmada. Os timers de treino e descanso são limpos. A App Coach mantém um único intervalo de um segundo durante a vida da página (`coach-mobile.html:552`), criado uma vez em `boot`; é consumo contínuo, não crescimento ilimitado. Pode ser suspenso quando `document.hidden` para poupar bateria.

## UI/UX, responsividade e acessibilidade

### U1 — Controlos clicáveis não são controlos semânticos — prioridade alta de acessibilidade

O avatar do perfil é uma `div` com `onclick` e aparece na árvore de acessibilidade apenas como texto “AM”, não como botão. Várias linhas de clientes e pagamentos repetem o padrão sem `tabindex`, teclado ou nome acessível.

Correção proposta: usar `<button type="button">` para avatar, cartões e linhas acionáveis. Quando a linha contiver `select` ou outros botões, deixar de tornar a linha inteira clicável e incluir uma ação explícita “Abrir ficha”. Suportar Enter e Espaço apenas quando não for possível usar `button`.

Referências: `coach-firebase.html:3348`, `coach-firebase.html:7221-7236`, `coach-firebase.html:7251-7262`, `coach-firebase.html:7831-7839`.

### U2 — Muitos labels não estão associados ao respetivo campo

Foram contados 137 `<label>` sem `for` no CRM. Alguns envolvem o campo e são válidos, mas muitos são irmãos do `input/select`, como no editor de exercícios e no modo sessão PT. Um leitor de ecrã pode anunciar apenas “edit text” sem contexto.

Correção proposta: adicionar `for` igual ao `id` de cada controlo ou envolver o controlo dentro do label. Adicionar testes com axe-core para `label`, `aria-dialog-name`, ordem de foco e nomes dos botões.

Referências: `coach-firebase.html:3118-3131`, `coach-firebase.html:3208-3213`.

### U3 — Texto pequeno e contraste insuficiente

Existe muito texto entre 9 e 11 px, sobretudo metadados e labels. A combinação `#64748b` sobre `#07121d/#0b1420` mede aproximadamente 3,9:1, abaixo dos 4,5:1 exigidos para texto normal por WCAG AA.

Correção proposta:

- mínimo prático de 12 px para metadados e 14–16 px para conteúdo operacional;
- elevar `#64748b` para pelo menos uma cor próxima de `#8193a9` nos fundos atuais;
- manter 44 × 44 CSS px para ações táteis principais;
- automatizar contraste e acessibilidade no CI.

### U4 — Responsividade atual é funcional, mas frágil no CRM

A inspeção visual mostrou o CRM desktop, App Coach e login do Portal sem overflow evidente. A App Coach tem navegação inferior adequada e `prefers-reduced-motion`. O risco está na quantidade de regras sobrepostas e estilos inline do CRM; cada nova alteração precisa de várias exceções por altura/largura.

Correção proposta: componentes com container queries, tokens únicos de espaçamento/tipografia e uma matriz mínima de testes a 360×800, 390×844, 768×1024, 1366×768 e 1920×1080. Manter `prefers-reduced-motion` e testar zoom a 200%.

## Verificações executadas

- `npm test`: 45 testes concluídos, incluindo isolamento entre alunos, contratos API, entrega de planos, HMAC/convites, regras diárias, sintaxe inline e smoke test de Produção.
- `npm audit --omit=dev`: quatro registos agregados, todos derivados da cópia vulnerável de `@grpc/grpc-js@1.9.16`.
- verificação visual em browser da pré-visualização autenticada do CRM, App Coach e login do Portal.
- pesquisa de segredos versionados: não foram encontrados private keys nem valores dos segredos HMAC no Git.

## Ordem recomendada de correção

1. Corrigir o lockfile de gRPC e voltar a executar audit/testes.
2. Criar índice único por email e retirar scans integrais do Portal.
3. Tornar o rate limit/nonce de convites atómico.
4. Corrigir semântica, labels e contraste.
5. Extrair handlers/scripts inline e endurecer CSP.
6. Modularizar o CRM por domínio e acrescentar testes automáticos de acessibilidade e performance.
