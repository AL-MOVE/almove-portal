import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const coach = await readFile(new URL('../coach-firebase.html', import.meta.url), 'utf8');

assert.match(
  coach,
  /<button type="button" class="avatar" id="avatarBtn"[^>]+aria-label="Abrir o meu perfil"/,
  'O acesso ao perfil deve ser um botão identificável por tecnologias de apoio'
);

for (const campo of [
  'inputExercicioPersonalizadoNome',
  'inputExercicioGrupoMuscular',
  'inputExercicioPadraoMovimento',
  'inputExercicioEquipamento',
  'inputExercicioClassificacao',
  'inputExercicioMetrica',
  'inputExercicioMusculosPrincipais',
  'inputExercicioMusculosSecundarios',
  'inputExercicioInstrucoes',
  'inputExercicioContraindicacoes',
  'inputExercicioImagemInicial',
  'inputExercicioImagemFinal',
  'inputExercicioVideo'
]) {
  assert.match(coach, new RegExp(`<label for="${campo}">`), `${campo} deve ter um rótulo associado`);
}

console.log('Contratos essenciais de acessibilidade validados.');
