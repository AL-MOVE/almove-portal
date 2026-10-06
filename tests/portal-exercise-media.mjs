import assert from 'node:assert/strict';
import { enrichPortalPlans } from '../server/portal-exercise-enrichment.js';

const payload = {
  ok: true,
  planosCliente: [{
    nome: 'Plano de teste',
    treinos: [{
      nome: 'Treino A',
      exercicios: [
        { exercicio: 'Elevação Lateral a 45° na Polia (Cable Lateral Raise 45°)', notas: '' },
        { exercicio: 'Exercício Visual Próprio' },
        { exercicio: 'Exercício sem correspondência', notas: 'Nota do treinador' },
        { exercicio: 'Nome histórico do exercício' }
      ]
    }]
  }]
};

const enriched = enrichPortalPlans(payload, [{
  id: 'custom-visual',
  nome: 'Exercício Visual Próprio',
  grupoMuscular: 'Costas',
  equipamento: 'Polia',
  instrucoes: 'Executar de forma controlada.',
  urlImagemInicial: 'https://media.almove.pt/inicio.jpg',
  urlImagemFinal: 'https://media.almove.pt/fim.jpg',
  urlVideo: 'https://media.almove.pt/exercicio.mp4'
}, {
  id: 'custom-renamed',
  nome: 'Nome atual do exercício',
  substituiNome: 'Nome histórico do exercício',
  urlImagemInicial: 'https://media.almove.pt/renomeado.jpg'
}]);

const [catalogue, custom, unknown, renamed] = enriched.planosCliente[0].treinos[0].exercicios;
assert.match(catalogue.instrucoes, /Polia baixa/i, 'O Portal deve receber as instruções do catálogo AL MOVE.');
assert.equal(catalogue.grupoMuscular, 'Ombro');
assert.equal(custom.imagemUrl, 'https://media.almove.pt/inicio.jpg');
assert.equal(custom.imagemInicioUrl, 'https://media.almove.pt/inicio.jpg');
assert.equal(custom.imagemFinalUrl, 'https://media.almove.pt/fim.jpg');
assert.equal(custom.linkVideo, 'https://media.almove.pt/exercicio.mp4');
assert.equal(custom.instrucoes, 'Executar de forma controlada.');
assert.equal(unknown.notas, 'Nota do treinador');
assert.equal(unknown.instrucoes, undefined, 'Exercícios desconhecidos não devem receber conteúdo incorreto.');
assert.equal(renamed.imagemInicioUrl, 'https://media.almove.pt/renomeado.jpg', 'Planos históricos devem resolver media após renomear o exercício.');
assert.equal(payload.planosCliente[0].treinos[0].exercicios[0].instrucoes, undefined, 'A resposta original não deve ser alterada.');

console.log('Enriquecimento visual e técnico do Portal validado.');
