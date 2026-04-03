const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/*
  -----------------------------
  Base documentaire simple V6
  -----------------------------
  Cette base sert quand la réponse n'est pas trouvée
  dans le moteur local du front.
*/

const KNOWLEDGE_BASE = [
  {
    keywords: ["momentum"],
    answer: `Le momentum mesure la force du mouvement actuel d’une action.

Quand une action a un momentum élevé, cela veut dire qu’elle est en train de bouger fortement sur le marché, souvent à la hausse ou à la baisse.

En trading, le momentum sert surtout à voir si un mouvement paraît puissant ou en train de s’essouffler.

Conclusion : le momentum aide à comprendre si le titre est en phase d’accélération ou non.`
  },
  {
    keywords: ["volatilité", "volatilite", "volatile"],
    answer: `La volatilité mesure l’amplitude des variations du prix d’une action.

Une action très volatile peut monter ou descendre rapidement. Cela peut offrir des opportunités, mais cela augmente aussi le risque.

Une action peu volatile est souvent plus stable et plus facile à tenir psychologiquement.

Conclusion : plus la volatilité est élevée, plus il faut accepter des mouvements brusques.`
  },
  {
    keywords: ["p/e", "pe", "price earnings", "price-to-earnings"],
    answer: `Le P/E compare le prix de l’action aux bénéfices de l’entreprise.

Il sert à estimer si le marché paie cher ou non les résultats de l’entreprise.

En général :
- un P/E élevé peut signaler une action très valorisée
- un P/E plus bas peut signaler une action moins chère, mais il faut aussi regarder la qualité de l’entreprise

Conclusion : le P/E aide à juger si le prix paraît tendu ou raisonnable par rapport aux bénéfices.`
  },
  {
    keywords: ["eps", "bénéfice par action", "benefice par action"],
    answer: `L’EPS signifie bénéfice par action.

Il indique combien l’entreprise gagne pour chaque action existante.

Plus l’EPS est élevé, plus la rentabilité ressort bien dans une lecture fondamentale simple.

Conclusion : l’EPS aide à mesurer la capacité de l’entreprise à générer du bénéfice.`
  },
  {
    keywords: ["optimiste"],
    answer: `Le scénario optimiste est le scénario le plus favorable dans une projection.

Il ne dit pas que cela va forcément arriver. Il représente simplement une hypothèse où les conditions restent bonnes et où l’action évolue dans le bon sens.

C’est donc une vision haute, mais pas une certitude.

Conclusion : “optimiste” veut dire “dans le cas favorable”, pas “garanti”.`
  },
  {
    keywords: ["prudent"],
    answer: `Le scénario prudent est le scénario le plus défensif.

Il sert à imaginer ce qui pourrait se passer si le marché évolue moins bien que prévu, ou si le dossier devient plus fragile.

Ce n’est pas un scénario catastrophe : c’est surtout une hypothèse conservatrice.

Conclusion : “prudent” veut dire qu’on raisonne avec plus de sécurité et moins d’enthousiasme.`
  },
  {
    keywords: ["neutre"],
    answer: `Le scénario neutre est le scénario central.

Il ne suppose ni forte accélération, ni forte dégradation. C’est souvent le scénario le plus équilibré dans une analyse simple.

Conclusion : “neutre” correspond à une hypothèse intermédiaire, sans excès d’optimisme ni de pessimisme.`
  },
  {
    keywords: ["support"],
    answer: `Un support est une zone de prix où une action a tendance à moins baisser, car des acheteurs peuvent revenir.

Ce n’est pas une barrière magique, mais plutôt un niveau surveillé par le marché.

Si le support casse nettement, cela peut être un signal de faiblesse.

Conclusion : le support est une zone où le prix peut tenter de se stabiliser.`
  },
  {
    keywords: ["résistance", "resistance"],
    answer: `Une résistance est une zone de prix où une action a tendance à avoir plus de mal à monter.

Souvent, des vendeurs ou des prises de bénéfices apparaissent autour de ce niveau.

Si la résistance est franchie franchement, cela peut être un signal de force.

Conclusion : la résistance est une zone où la hausse peut ralentir ou buter.`
  },
  {
    keywords: ["rsi"],
    answer: `Le RSI est un indicateur technique qui mesure la vitesse et l’intensité des mouvements de prix.

Il est souvent utilisé pour repérer si une action semble trop montée ou trop baissée à court terme.

On le lit surtout comme un outil d’aide, pas comme une vérité absolue.

Conclusion : le RSI sert à estimer si le marché paraît tendu ou détendu à court terme.`
  },
  {
    keywords: ["long terme"],
    answer: `Quand on parle de long terme, on parle d’une logique d’investissement où l’on accepte de garder une action pendant longtemps.

Dans cette approche, on regarde souvent davantage :
- la qualité de l’entreprise
- la rentabilité
- la valorisation
- la stabilité du modèle

Conclusion : le long terme demande surtout de choisir des dossiers solides et supportables dans le temps.`
  }
];

/*
  --------------------------------------
  Détection de questions "éducatives"
  --------------------------------------
*/

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function findKnowledgeAnswer(message) {
  const text = normalizeText(message);

  for (const item of KNOWLEDGE_BASE) {
    for (const keyword of item.keywords) {
      if (text.includes(normalizeText(keyword))) {
        return item.answer;
      }
    }
  }

  return null;
}

function buildStructuredFallback(message) {
  const answer = findKnowledgeAnswer(message);

  if (answer) {
    return {
      source: "knowledge_base",
      answer
    };
  }

  return {
    source: "fallback",
    answer: `Je n’ai pas encore de réponse spécialisée assez solide pour cette question.

Ce que j’ai compris :
- tu poses une question liée au trading ou à l’investissement
- mais elle n’est pas encore couverte dans ma base documentaire actuelle

Pour améliorer ça, il faudra m’ajouter :
- une vraie recherche web côté serveur
- ou une base documentaire plus large

Conclusion : pour l’instant, reformule ta question avec un mot-clé plus précis, par exemple “momentum”, “volatilité”, “P/E”, “EPS”, “support” ou “RSI”.`
  };
}

/*
  -------------------------------------------------------
  Route backend : /ask-ai
  -------------------------------------------------------
  Cette route est pensée pour :
  1. recevoir la question du front
  2. plus tard recevoir aussi le portefeuille
  3. d’abord laisser le front gérer le local
  4. sinon servir de moteur documentaire/web
*/

app.post("/ask-ai", (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Message invalide."
      });
    }

    const result = buildStructuredFallback(message);

    return res.json({
      ok: true,
      mode: "documented_answer",
      source: result.source,
      answer: result.answer
    });
  } catch (error) {
    console.error("Erreur /ask-ai :", error);

    return res.status(500).json({
      ok: false,
      error: "Erreur interne du serveur."
    });
  }
});

app.get("/", (req, res) => {
  res.send("Backend IA TradeEverything actif.");
});

app.listen(PORT, () => {
  console.log(`Serveur IA lancé sur http://localhost:${PORT}`);
});