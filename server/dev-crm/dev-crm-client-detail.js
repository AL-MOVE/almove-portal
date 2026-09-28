import { obterIdentidadeFirebase } from '../../api/_firebase.js';
import { crmFirebasePermitido } from '../../api/_crm-environment.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from '../../api/_firestore.js';
import { exigirEquipa } from '../../api/_crm-development.js';
import { consolidarPacksMensais } from './payment-status.js';
import { buildTrainingHistory } from './training-history.js';

function responder(res, estado, corpo) { res.setHeader('Cache-Control','no-store, max-age=0'); res.setHeader('Content-Type','application/json; charset=utf-8'); res.setHeader('X-Robots-Tag','noindex, nofollow'); return res.status(estado).json(corpo); }
function mesAtual(){const partes=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit'}).formatToParts(new Date());return partes.find(p=>p.type==='year').value+'-'+partes.find(p=>p.type==='month').value}
export default async function handler(req,res){
  if(req.method!=='GET')return responder(res,405,{ok:false});
  try{
    if(!crmFirebasePermitido())return responder(res,404,{ok:false});
    const identidade=await obterIdentidadeFirebase(req),{db}=obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({db}).getClientContext(identidade.uid));
    const id=String(req.query?.id||'').trim(); if(!id||id.length>128)return responder(res,400,{ok:false,erro:'CLIENTE_INVALIDO'});
    const clienteSnap=await db.collection('crmMigrationClients').doc(id).get(); if(!clienteSnap.exists)return responder(res,404,{ok:false,erro:'CLIENTE_NAO_ENCONTRADO'});
    const [packsSnap,sessoesSnap,checkinsSnap,notasSnap,planosSnap,avaliacoesSnap,sessoesPtSnap,execucoesSnap]=await Promise.all([db.collection('crmMigrationPacks').where('clientId','==',id).get(),db.collection('crmMigrationSessions').where('clientId','==',id).get(),db.collection('crmMigrationCheckins').where('clientId','==',id).get(),db.collection('crmMigrationNotes').where('idCliente','==',id).get(),db.collection('crmMigrationTrainingPlans').where('idCliente','==',id).get(),db.collection('crmMigrationPhysicalAssessments').where('clientId','==',id).get(),db.collection('crmMigrationPersonalTrainingSessions').where('idCliente','==',id).get(),db.collection('crmMigrationTrainingExecutions').where('idCliente','==',id).get()]);
    const sess=sessoesSnap.docs.map(d=>d.data()).sort((a,b)=>String(b.mesAno).localeCompare(String(a.mesAno))||Number(a.numSessao)-Number(b.numSessao)); const ck=checkinsSnap.docs.map(d=>d.data()).sort((a,b)=>String(b.dataHora).localeCompare(String(a.dataHora)))[0]||null;
    const planos=planosSnap.docs.map(d=>d.data()); const notas=notasSnap.docs.map(d=>d.data()).sort((a,b)=>String(b.dataHora).localeCompare(String(a.dataHora))); const avaliacoes=avaliacoesSnap.docs.map(d=>d.data()).sort((a,b)=>String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
    const sessoesPt=sessoesPtSnap.docs.map(d=>d.data()); const execucoes=execucoesSnap.docs.map(d=>d.data()); const atividade=buildTrainingHistory({sessions:sessoesPt,executions:execucoes});
    const cliente={id,...clienteSnap.data(),totalSessoesConfirmadas:sess.filter(s=>s.estado==='Confirmada').length,marcoAtingido:0,streakSemanas:0,proximoMarco:null,numPlanosTreino:new Set(planos.map(p=>p.nomePlano)).size,modoEspecial:clienteSnap.data().modoEspecial||null,ultimoCheckin:ck?{...ck}:null};
    const packAtivo=consolidarPacksMensais(packsSnap.docs.map(d=>({id:d.id,...d.data()}))).find(p=>p.mesAno===mesAtual())||null;
    return responder(res,200,{ok:true,detalhe:{cliente,packAtivo,sessoes:sess.filter(s=>s.mesAno===mesAtual()),totalPacksAntigos:0},notas,avaliacoes,execucoes,atividade});
  }catch(e){const c=String(e?.code||e?.message||'FALHA');return responder(res,/^FIREBASE_/.test(c)?401:500,{ok:false,erro:c})}
}
