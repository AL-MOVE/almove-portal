# Fundação CRM PostgreSQL

## Decisão

O AL MOVE passa a usar PostgreSQL como registo principal de clientes, planos,
treinos e auditoria. Firebase Auth continua responsável pela identidade. O
browser comunica apenas com o backend AL MOVE; nunca recebe credenciais da base
de dados nem uma ligação PostgreSQL. O destino de produção é Cloud Run + Cloud
SQL, no mesmo projeto Google Cloud do Firebase.

```text
Aluno: portal.almove.pt ─┐
                           ├─ Firebase Auth ── Cloud Run ── Cloud SQL PostgreSQL
PT: coach.almove.pt ──────┘                              └── Storage privado
```

O backend verifica cada ID token Firebase, encontra o utilizador por
`firebase_uid`, obtém o papel e valida a relação PT/cliente antes de executar
uma operação. O email é um atributo de contacto; não é uma autorização.

## Regras que não se negociam

1. `portal.almove.pt` só pode ler ou alterar o seu próprio cliente.
2. `coach.almove.pt` só pode trabalhar com clientes da sua carteira ativa.
3. `admin` é atribuído manualmente e nunca por um campo enviado pelo browser.
4. Séries são eventos imutáveis, identificados por `request_id`; editar cria um
   novo evento, não substitui silenciosamente o anterior.
5. Contratos e fotografias ficam privados. A app recebe links temporários, não
   links Drive públicos.
6. Toda a escrita relevante deixa rasto em `audit_log`.
7. A base não tem IP público para a app. Só o serviço Cloud Run acede ao
   PostgreSQL através de credenciais privadas e identidade de serviço.

## Separação de papéis

| Papel | Pode fazer |
| --- | --- |
| `client` | Perfil próprio, treino prescrito, registo de séries, avaliações e pedidos próprios |
| `coach` | Clientes atribuídos, planos, agenda, feedback e avaliações da sua carteira |
| `admin` | Equipa, atribuições, convites, configurações e auditoria |

Uma pessoa pode ter mais de um papel. A tabela `user_roles` evita tratar o
email como distinção entre cliente e profissional.

## Ordem de migração

1. Criar a instância Cloud SQL PostgreSQL em `europe-southwest1` (Madrid), no
   mesmo projeto Google Cloud do Firebase, e aplicar `db/migrations/001_core.sql`.
2. Criar a API privada Cloud Run. A instância Cloud SQL não recebe IP público;
   só a conta de serviço do Cloud Run pode ligar-se à base.
3. Implementar o módulo de dados no backend com duas interfaces pequenas:
   `getClientContext(firebaseUid)` e `recordWorkoutSet(context, input)`.
4. Importar uma cópia de Sheets para tabelas de transição e produzir um relatório
   de diferenças. Nada no portal lê a nova base nesta fase.
5. Mover primeiro os novos treinos e séries. Cada evento escreve no PostgreSQL
   e entra numa fila de reconciliação para Sheets enquanto o CRM antigo existir.
6. Migrar clientes, planos, agenda, avaliações e contratos por grupos pequenos.
7. Só após reconciliação e backup restaurável se desliga a escrita no Apps Script.

## Fora do primeiro corte

Pagamentos, notificações Push, anexos clínicos e fotografias de progresso não
entram na primeira migração. Cada um requer uma política de retenção, acesso e
remoção antes de receber dados reais.

## Operação mínima antes de dados reais

- Backup diário e teste de restauro.
- Registo de erros sem dados pessoais.
- Base em Frankfurt e acordo de processamento de dados revisto.
- Um utilizador de base de dados exclusivo para produção.
- Testes de autorização: cliente A não lê cliente B; PT A não lê cliente fora
  da carteira; conta sem papel não lê nada.
