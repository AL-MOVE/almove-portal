/*
 * Catálogo visual local do Portal AL MOVE.
 *
 * As imagens vivem no próprio deployment. O CRM pode continuar a fornecer
 * `imagemUrl` por exercício; essa imagem tem prioridade sobre este catálogo.
 * Fonte inicial: RepDB Free Tier. Uso comercial dentro da app permitido com
 * atribuição; ficheiros guardados localmente em /images/exercises, sem pedidos
 * a serviços de terceiros.
 */
(function () {
  "use strict";

  const imagens = {
    "chest-press-na-maquina": "chest-press-machine.webp",
    "chest-press-maquina": "chest-press-machine.webp",
    "press-de-peito-na-maquina": "chest-press-machine.webp",
    "supino-na-maquina": "chest-press-machine.webp",
    "remada-alta-na-polia": "upright-cable-row.webp",
    "remada-alta-polia": "upright-cable-row.webp",
    "upright-cable-row": "upright-cable-row.webp",
    "fly-na-maquina": "pec-deck-fly.webp",
    "pec-deck": "pec-deck-fly.webp",
    "butterfly": "pec-deck-fly.webp",
    "crucifixo-na-maquina": "pec-deck-fly.webp",
    "lat-pulldown-aberto": "wide-grip-lat-pulldown.webp",
    "puxada-aberta": "wide-grip-lat-pulldown.webp",
    "puxada-frontal-aberta": "wide-grip-lat-pulldown.webp",
    "wide-grip-lat-pulldown": "wide-grip-lat-pulldown.webp",
    "biceps-curl-alternado-com-halteres": "dumbbell-alternate-bicep-curl.webp",
    "curl-alternado-com-halteres": "dumbbell-alternate-bicep-curl.webp",
    "curl-biceps-alternado": "dumbbell-alternate-bicep-curl.webp",
    "dumbbell-alternate-bicep-curl": "dumbbell-alternate-bicep-curl.webp",
    "triceps-pushdown-com-corda": "triceps-pushdown-rope.webp",
    "triceps-pushdown-corda": "triceps-pushdown-rope.webp",
    "triceps-na-polia-com-corda": "triceps-pushdown-rope.webp",
    "triceps-pushdown-rope": "triceps-pushdown-rope.webp",
    "agachamento-com-barra": "barbell-squat.webp",
    "agachamento-barra": "barbell-squat.webp",
    "barbell-squat": "barbell-squat.webp",
    "peso-morto-romeno": "romanian-deadlift.webp",
    "romanian-deadlift": "romanian-deadlift.webp",
    "remada-sentada-na-polia": "seated-cable-row.webp",
    "remada-baixa-na-polia": "seated-cable-row.webp",
    "seated-cable-row": "seated-cable-row.webp",
    "leg-press": "leg-press.webp",
    "prensa": "leg-press.webp",
    "extensao-de-perna": "leg-extension.webp",
    "extensao-de-pernas": "leg-extension.webp",
    "leg-extension": "leg-extension.webp",
    "flexao-de-perna-deitado": "lying-leg-curl.webp",
    "flexao-de-pernas-deitado": "lying-leg-curl.webp",
    "lying-leg-curl": "lying-leg-curl.webp",
    "prancha": "plank.webp",
    "plank": "plank.webp",
    "afundo-com-halteres": "dumbbell-lunge.webp",
    "lunge-com-halteres": "dumbbell-lunge.webp",
    "dumbbell-lunge": "dumbbell-lunge.webp"
  };

  window.ALMOVE_EXERCISE_MEDIA = Object.freeze({
    versao: 1,
    pasta: "/images/exercises/",
    imagens: Object.freeze(imagens),
    atribuicao: Object.freeze({
      nome: "RepDB",
      repositorio: "https://github.com/RepDB/exercise-dataset",
      licenca: "RepDB Free Tier License"
    })
  });
}());
