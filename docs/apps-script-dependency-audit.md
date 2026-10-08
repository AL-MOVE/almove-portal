# Auditoria de dependências do Apps Script

## Fonte atual no Firestore

Os fluxos críticos de treino do Portal deixam de depender da folha antiga:

- consulta dos planos autónomos e dos exercícios;
- check-in diário, com uma única submissão por aluno e dia;
- teste de prontidão, com duas tentativas no máximo por aluno e dia;
- conclusão do treino autónomo e respetivas séries, cargas e intensidade;
- feedback pós-treino;
- sessão mínima;
- histórico recente por exercício.

O CRM já lê estas coleções do Firestore. A gravação direta elimina a situação em que o Portal confirmava uma operação na folha e o CRM continuava sem a ver.

Durante a transição, um check-in já concluído no Apps Script no próprio dia é importado uma única vez para o bloqueio diário do Firestore. A importação é idempotente e não altera os valores.

## Dependências que permanecem no Apps Script

O Portal ainda usa o Apps Script para dados que não fazem parte da prescrição ou execução do treino:

- bootstrap geral, agenda, notificações e resumo inicial;
- dados pessoais e pedidos de alteração/privacidade;
- avaliações físicas, peso, passos e métricas de atividade;
- mapa de atividade, passaporte técnico e resumos de progresso;
- criação/validação do código antigo e terminação dessa sessão.

Estes pedidos continuam protegidos pela identidade Firebase validada na Vercel e por uma asserção HMAC curta. Nenhum token Firebase é enviado ao Apps Script.

## Riscos e próxima migração

Os resumos de progresso, mapa e passaporte ainda podem demorar a refletir um treino acabado de gravar no Firestore, porque continuam calculados na folha antiga. O treino fica imediatamente disponível no histórico do CRM e no histórico do exercício do Portal. A próxima migração deve mover os agregados de progresso para leituras Firestore antes de remover a cópia antiga do frontend no Apps Script.

O CRM usa os endpoints Firestore para as funcionalidades implementadas. Chamadas legadas ainda não convertidas falham de forma explícita, em vez de gravarem silenciosamente na folha e criarem duas fontes divergentes.
