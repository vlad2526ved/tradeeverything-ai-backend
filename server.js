const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const KNOWLEDGE_BASE = [
  {
    keywords: ["momentum"],
    answer: `Le momentum mesure la force du mouvement actuel d’une action.

Quand une action a un momentum élevé, cela veut dire qu’elle est en train de bouger fortement sur le marché, souvent à la hausse ou à la baisse.

En trading, le momentum sert surtout à voir si un mouvement paraît puissant ou en train de s’essouffler.`
  },
  {
    keywords: ["volatilité", "volatilite", "volatile"],
    answer: `La volatilité mesure l’amplitude des variations du prix d’une action.

Une action très volatile peut monter ou descendre rapidement. Cela peut offrir des opportunités, mais cela augmente aussi le risque.

Une action peu volatile est souvent plus stable et plus facile à tenir psychologiquement.`
  },
  {
    keywords: ["p/e", "pe", "price earnings", "price-to-earnings"],
    answer: `Le P/E compare le prix de l’action aux bénéfices de l’entreprise.

Il sert à estimer si le marché paie cher ou non les résultats de l’entreprise.

En général, un P/E élevé peut signaler une action très valorisée.`
  },
  {
    keywords: ["eps", "bénéfice par action", "benefice par action"],
    answer: `L’EPS signifie bénéfice par action.

Il indique combien l’entreprise gagne pour chaque action existante.

Plus l’EPS est élevé, plus la rentabilité ressort bien dans une lecture fondamentale simple.`
  },
  {
    keywords: ["optimiste"],
    answer: `Le scénario optimiste est le scénario le plus favorable dans une projection.

Il représente une hypothèse où les conditions restent bonnes et où l’action évolue dans le bon sens.

Ce n’est donc pas une certitude.`
  },
  {
    keywords: ["prudent"],
    answer: `Le scénario prudent est le scénario le plus défensif.

Il sert à imaginer ce qui pourrait se passer si le marché évolue moins bien que prévu, ou si le dossier devient plus fragile.

C’est une hypothèse conservatrice.`
  },
  {
    keywords: ["neutre"],
    answer: `Le scénario neutre est le scénario central.

Il ne suppose ni forte accélération, ni forte dégradation.

C’est souvent l’hypothèse la plus équilibrée.`
  },
  {
    keywords: ["support"],
    answer: `Un support est une zone de prix où une action a tendance à moins baisser, car des acheteurs peuvent revenir.

Ce n’est pas une barrière magique, mais plutôt un niveau surveillé par le marché.`
  },
  {
    keywords: ["résistance", "resistance"],
    answer: `Une résistance est une zone de prix où une action a tendance à avoir plus de mal à monter.

Souvent, des vendeurs ou des prises de bénéfices apparaissent autour de ce niveau.`
  },
  {
    keywords: ["rsi"],
    answer: `Le RSI est un indicateur technique qui mesure la vitesse et l’intensité des mouvements de prix.

Il est souvent utilisé pour repérer si une action semble trop montée ou trop baissée à court terme.`
  },
  {
    keywords: ["dividende"],
    answer: `Un dividende est une partie des bénéfices versée aux actionnaires.

C’est une forme de revenu régulier pour l’investisseur.`
  },
  {
    keywords: ["croissance"],
    answer: `Une action de croissance est une entreprise qui augmente fortement ses revenus et ses bénéfices.

Elle réinvestit souvent ses profits au lieu de verser des dividendes.`
  },
  {
    keywords: ["marché", "marche"],
    answer: `Le marché représente l’ensemble des échanges d’actions.

Il est influencé par l’économie, les taux d’intérêt et la confiance des investisseurs.`
  },
  {
    keywords: ["variation"],
    answer: `La variation correspond à l’évolution du prix d’une action sur une période donnée.

Sur une séance, elle indique combien le titre a monté ou baissé en valeur et en pourcentage.`
  },
  {
    keywords: ["volume"],
    answer: `Le volume correspond au nombre d’actions échangées pendant une période donnée.

Un volume élevé montre généralement qu’il y a beaucoup d’activité sur le titre.`
  },
  {
    keywords: ["capitalisation", "market cap"],
    answer: `La capitalisation boursière correspond à la valeur totale de l’entreprise en bourse.

Elle se calcule en gros avec le prix de l’action multiplié par le nombre d’actions existantes.`
  }
];

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function detectIntent(message) {
  const text = normalizeText(message);

  if (
    text.includes("quoi") ||
    text.includes("cest quoi") ||
    text.includes("que veut dire") ||
    text.includes("definition") ||
    text.includes("explique") ||
    text.includes("signifie")
  ) {
    return "definition";
  }

  if (text.includes("acheter") || text.includes("investir")) {
    return "buy";
  }

  if (text.includes("vendre")) {
    return "sell";
  }

  if (text.includes("risque")) {
    return "risk";
  }

  if (text.includes("compar")) {
    return "compare";
  }

  return "general";
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

function enrichAnswer(baseAnswer, intent, sourceLabel = "base locale") {
  if (!baseAnswer) return null;

  let summary = "";
  let conclusion = "";

  if (intent === "definition") {
    summary = "C’est une notion utile pour mieux comprendre le trading et lire une action.";
    conclusion = "C’est un bon point de départ avant de passer à une vraie analyse.";
  } else if (intent === "buy") {
    summary = "Cette notion peut t’aider à repérer un meilleur contexte d’achat.";
    conclusion = "Avant d’acheter, il faut toujours croiser qualité, valorisation et risque.";
  } else if (intent === "sell") {
    summary = "Cette notion peut aussi aider à voir quand il faut être plus prudent.";
    conclusion = "Une vente se décide mieux quand on comprend le contexte, pas juste l’émotion.";
  } else if (intent === "risk") {
    summary = "Le risque dépend à la fois du marché, de l’entreprise et du comportement du titre.";
    conclusion = "Plus le risque est élevé, plus il faut adapter la taille de position et la prudence.";
  } else {
    summary = "La réponse doit toujours être lue dans le bon contexte de marché.";
    conclusion = "Une notion seule ne suffit pas : il faut la relier à une analyse globale.";
  }

  return `Bonne question.

${baseAnswer}

👉 Ce qu’il faut retenir :
${summary}

👉 Source :
${sourceLabel}

👉 Conclusion :
${conclusion}`;
}

async function searchWikipediaTitle(query) {
  const url =
    `https://fr.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json&origin=*`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[1]) || !data[1].length) {
    return null;
  }

  return data[1][0];
}

async function getWikipediaSummary(title) {
  const url =
    `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "TradeEverythingAI/1.0"
    }
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.extract) return null;

  return {
    title: data.title || title,
    extract: data.extract,
    content_urls: data.content_urls || null
  };
}

async function buildWebAnswer(message) {
  const cleaned = String(message || "").trim();
  if (!cleaned) return null;

  const title = await searchWikipediaTitle(cleaned);
  if (!title) return null;

  const summary = await getWikipediaSummary(title);
  if (!summary) return null;

  return {
    source: "web_search",
    answer: enrichAnswer(summary.extract, detectIntent(message), `recherche web documentaire : ${summary.title}`)
  };
}

async function buildStructuredFallback(message) {
  const intent = detectIntent(message);
  const localAnswer = findKnowledgeAnswer(message);

  if (localAnswer) {
    return {
      source: "knowledge_base",
      answer: enrichAnswer(localAnswer, intent, "base locale trading")
    };
  }

  const webAnswer = await buildWebAnswer(message);
  if (webAnswer) {
    return webAnswer;
  }

  return {
    source: "ai_generated",
    answer: `Je n’ai pas trouvé de réponse assez fiable pour cette question.

👉 Ce que j’ai compris :
Tu poses une question liée au trading, à l’investissement ou à une notion financière.

👉 Ce que tu peux faire :
- reformuler avec un mot plus précis
- demander une définition
- demander une analyse d’action
- comparer deux actions

👉 Conclusion :
Pose-moi par exemple une question comme “c’est quoi le RSI ?”, “explique la variation”, ou “compare Apple et Nvidia”.`
  };
}

app.post("/ask-ai", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Message invalide."
      });
    }

    const result = await buildStructuredFallback(message);

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
