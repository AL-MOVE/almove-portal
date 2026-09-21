import { obterAdminFirebase, obterIdentidadeFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';
import { exigirEquipa } from './_crm-development.js';

function responder(res, estado, corpo) { res.setHeader('Cache-Control','no-store, max-age=0'); res.setHeader('Content-Type','application/json; charset=utf-8'); res.setHeader('X-Robots-Tag','noindex, nofollow'); return res.status(estado).json(corpo); }
function mesAtual(){const partes=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit'}).formatToParts(new Date());return partes.find(p=>p.type==='year').value+'-'+partes.find(p=>p.type==='month').value}
export default async function handler(req,res){
  if(req.method!=='GET')return responder(res,405,{ok:false});
  try{
    if(obterAdminFirebase().projeto!=='almove-portal-dev')return responder(res,404,{ok:false});
    const identidade=await obterIdentidadeFirebase(req),{db}=obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({db}).getClientContext(identidade.uid));
    const id=String(req.query?.id||'').trim(); if(!id||id.length>128)return responder(res,400,{ok:false,erro:'CLIENTE_INVALIDO'});
    const clienteSnap=await db.collection('crmMigrationClients').doc(id).get(); if(!clienteSnap.exists)return responder(res,404,{ok:false,erro:'CLIENTE_NAO_ENCONTRADO'});
    const [packsSnap,sessoesSnap,checkinsSnap,notasSnap,planosSnap,avaliacoesSnap,sessoesPtSnap,execucoesSnap]=await Promise.all([db.collection('crmMigrationPacks').where('clientId','==',id).get(),db.collection('crmMigrationSessions').where('clientId','==',id).get(),db.collection('crmMigrationCheckins').where('clientId','==',id).get(),db.collection('crmMigrationNotes').where('idCliente','==',id).get(),db.collection('crmMigrationTrainingPlans').where('idCliente','==',id).get(),db.collection('crmMigrationPhysicalAssessments').where('clientId','==',id).get(),db.collection('crmMigrationPersonalTrainingSessions').where('idCliente','==',id).get(),db.collection('crmMigrationTrainingExecutions').where('idCliente','==',id).get()]);
    const sess=sessoesSnap.docs.map(d=>d.data()).sort((a,b)=>String(b.mesAno).localeCompare(String(a.mesAno))||Number(a.numSessao)-Number(b.numSessao)); const ck=checkinsSnap.docs.map(d=>d.data()).sort((a,b)=>String(b.dataHora).localeCompare(String(a.dataHora)))[0]||null;
    const planos=planosSnap.docs.map(d=>d.data()); const notas=notasSnap.docs.map(d=>d.data()).sort((a,b)=>String(b.dataHora).localeCompare(String(a.dataHora))); const avaliacoes=avaliacoesSnap.docs.map(d=>d.data()).sort((a,b)=>String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
    const atividade=new Map(); sessoesPtSnap.docs.map(d=>d.data()).forEach(s=>atividade.set(s.idSessao,{idSessao:s.idSessao,data:s.data,plano:s.nomePlano,treino:s.nomeTreino,tipo:'PT',estado:s.estado,duracaoMin:s.duracaoMin,notaGeral:s.notaGeral,numSeries:0,numExercicios:0,origem:'PT presencial'})); execucoesSnap.docs.map(d=>d.data()).forEach(e=>{const chave=e.idSessao||e.requestId||String(e.fonteLinha);const item=atividade.get(chave)||{idSessao:chave,data:e.data,plano:e.nomePlano,treino:e.nomeTreino,tipo:e.tipoSessao||'AUTONOMO',estado:'REALIZADA',duracaoMin:0,notaGeral:'',numSeries:0,numExercicios:0,origem:'Treino autónomo',_exercicios:{}};item.numSeries+=1;item._exercicios=item._exercicios||{};item._exercicios[e.exercicio]=true;item.numExercicios=Object.keys(item._exercicios).length;atividade.set(chave,item)});
    const cliente={id,...clienteSnap.data(),totalSessoesConfirmadas:sess.filter(s=>s.estado==='Confirmada').length,marcoAtingido:0,streakSemanas:0,proximoMarco:null,numPlanosTreino:new Set(planos.map(p=>p.nomePlano)).size,modoEspecial:clienteSnap.data().modoEspecial||null,ultimoCheckin:ck?{...ck}:null};
    const packAtivo=packsSnap.docs.map(d=>d.data()).find(p=>p.mesAno===mesAtual())||null;
    const execucoes=execucoesSnap.docs.map(d=>d.data());
    return responder(res,200,{ok:true,detalhe:{cliente,packAtivo,sessoes:sess.filter(s=>s.mesAno===mesAtual()),totalPacksAntigos:0},notas,avaliacoes,execucoes,atividade:Array.from(atividade.values()).map(item=>{delete item._exercicios;return item}).sort((a,b)=>String(b.data).localeCompare(String(a.data)))});
  }catch(e){const c=String(e?.code||e?.message||'FALHA');return responder(res,/^FIREBASE_/.test(c)?401:500,{ok:false,erro:c})}
}
