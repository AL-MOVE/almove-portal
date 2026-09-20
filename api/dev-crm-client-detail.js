import { obterAdminFirebase, obterIdentidadeFirebase } from './_firebase.js';
import { criarAdaptadorFirestore, obterFirestoreAlmove } from './_firestore.js';
import { exigirEquipa } from './_crm-development.js';

function responder(res, estado, corpo) { res.setHeader('Cache-Control','no-store, max-age=0'); res.setHeader('Content-Type','application/json; charset=utf-8'); res.setHeader('X-Robots-Tag','noindex, nofollow'); return res.status(estado).json(corpo); }
function mesAtual(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7)}
export default async function handler(req,res){
  if(req.method!=='GET')return responder(res,405,{ok:false});
  try{
    if(obterAdminFirebase().projeto!=='almove-portal-dev')return responder(res,404,{ok:false});
    const identidade=await obterIdentidadeFirebase(req),{db}=obterFirestoreAlmove(); exigirEquipa(await criarAdaptadorFirestore({db}).getClientContext(identidade.uid));
    const id=String(req.query?.id||'').trim(); if(!id||id.length>128)return responder(res,400,{ok:false,erro:'CLIENTE_INVALIDO'});
    const clienteSnap=await db.collection('crmMigrationClients').doc(id).get(); if(!clienteSnap.exists)return responder(res,404,{ok:false,erro:'CLIENTE_NAO_ENCONTRADO'});
    const [packsSnap,sessoesSnap,checkinsSnap]=await Promise.all([db.collection('crmMigrationPacks').where('clientId','==',id).get(),db.collection('crmMigrationSessions').where('clientId','==',id).get(),db.collection('crmMigrationCheckins').where('clientId','==',id).get()]);
    const sess=sessoesSnap.docs.map(d=>d.data()).sort((a,b)=>String(b.mesAno).localeCompare(String(a.mesAno))||Number(a.numSessao)-Number(b.numSessao)); const ck=checkinsSnap.docs.map(d=>d.data()).sort((a,b)=>String(b.dataHora).localeCompare(String(a.dataHora)))[0]||null;
    const cliente={id,...clienteSnap.data(),totalSessoesConfirmadas:sess.filter(s=>s.estado==='Confirmada').length,marcoAtingido:0,streakSemanas:0,proximoMarco:null,numPlanosTreino:0,modoEspecial:null,ultimoCheckin:ck?{...ck}:null};
    const packAtivo=packsSnap.docs.map(d=>d.data()).find(p=>p.mesAno===mesAtual())||null;
    return responder(res,200,{ok:true,detalhe:{cliente,packAtivo,sessoes:sess.filter(s=>s.mesAno===mesAtual()),historico:[]}});
  }catch(e){const c=String(e?.code||e?.message||'FALHA');return responder(res,/^FIREBASE_/.test(c)?401:500,{ok:false,erro:c})}
}
