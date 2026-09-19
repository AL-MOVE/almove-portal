# Firestore sem custo — primeira fase

## Decisão atual

Enquanto o AL MOVE estiver a validar o portal e a crescer, a base de dados é
Cloud Firestore no plano Firebase Spark. Não é necessário cartão, Cloud Run ou
Cloud SQL. O PostgreSQL preparado em `db/migrations/` continua como caminho de
migração quando a operação justificar custo recorrente.

```text
portal.almove.pt / coach.almove.pt
             ↓ Firebase Auth
             ↓ API Vercel
          Cloud Firestore
```

O browser não recebe acesso direto ao Firestore. `firestore.rules` nega todas
as leituras e escritas; a API Vercel usa Firebase Admin, valida o token e aplica
autorização no adaptador `api/_firestore.js`.

## Coleções iniciais

| Coleção | Finalidade |
| --- | --- |
| `userAccess/{firebaseUid}` | Papel, estado e ligação ao cliente ou PT |
| `clients/{clientId}` | Dados de cliente migrados de forma mínima |
| `trainingPlans/{planId}/exercises/{exerciseId}` | Exercícios prescritos e limites por série |
| `workoutSessions/{sessionId}` | Sessão ativa, plano e cliente dono |
| `workoutSetEvents/{requestId}` | Evento imutável e idempotente de cada série |
| `auditLogs/{id}` | Rasto de ações sensíveis |

## Limites e proteção

1. Primeiro Firestore do projeto: quota sem custo Firebase Spark.
2. Sem TTL, PITR, clones ou backups Firestore pagos nesta fase.
3. Antes de dados reais, exportar uma cópia de Sheets e definir reconciliação.
4. Cada série recebe `requestId`; repetir a mesma chamada devolve o mesmo evento.
5. O portal atual continua a usar Apps Script até a rota Firestore e os testes
   de autorização estarem ligados.

## Quando migrar para PostgreSQL

Migramos quando uma destas condições se verificar: aproximação dos limites,
vários PTs a usar o CRM, necessidade de relatórios relacionais complexos,
backups restauráveis automáticos ou receita que suporte custo operacional.
