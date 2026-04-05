const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";

app.use(cors());
app.use(express.json());

const COMPANY_SYMBOLS = {
  apple: "AAPL",
  amazon: "AMZN",
  google: "GOOGL",
  alphabet: "GOOGL",
  meta: "META",
  facebook: "META",
  nvidia: "NVDA",
  tesla: "TSLA",
  microsoft: "MSFT",
  aapl: "AAPL",
  amzn: "AMZN",
  googl: "GOOGL",
  nvda: "NVDA",
  tsla: "TSLA",
  msft: "MSFT"
};

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function extractSymbolFromMessage(message) {
  const text = normalizeText(message);

  for (const key of Object.keys(COMPANY_SYMBOLS)) {
    if (text.includes(key)) {
      return COMPANY_SYMBOLS[key];
    }
  }

  return null;
}

function localDefinitionAnswer(message) {
  const text = normalizeText(message);

  const defs = [
    {
      keys: ["momentum"],
      answer: `Le momentum mesure la force du mouvement actuel d’une action.

Conclusion :
plus le momentum est élevé, plus le mouvement du titre paraît puissant.`
    },
    {
      keys: ["variation"],
      answer: `La variation indique de combien une action a monté ou baissé sur une période donnée, souvent la séance du jour.

Conclusion :
elle permet de voir rapidement si le marché est positif ou négatif sur le titre.`
    },
    {
      keys: ["volatilite", "volatile"],
      answer: `La volatilité mesure à quel point le prix d’une action bouge fortement.

Conclusion :
plus la volatilité est élevée, plus l’action est nerveuse.`
    },
    {
      keys: ["rsi"],
      answer: `Le RSI est un indicateur technique utilisé pour voir si un titre semble trop monté ou trop baissé à court terme.

Conclusion :
c’est un outil de lecture, pas une vérité absolue.`
    },
    {
      keys: ["support"],
      answer: `Un support est une zone de prix où une action peut avoir tendance à moins baisser.

Conclusion :
c’est un niveau surveillé par beaucoup d’investisseurs.`
    },
    {
      keys: ["resistance"],
      answer: `Une résistance est une zone de prix où une action a tendance à avoir plus de mal à monter.

Conclusion :
c’est souvent une zone de frein pour la hausse.`
    },
    {
      keys: ["dividende"],
      answer: `Un dividende est une partie des bénéfices versée aux actionnaires.

Conclusion :
une action à dividende peut générer un revenu régulier.`
    }
  ];

  for (const item of defs) {
    if (item.keys.some(key => text.includes(key))) {
      return item.answer;
    }
  }

  return null;
}

async function alphaVantageQuery(params) {
  if (!ALPHA_VANTAGE_API_KEY) {
    throw new Error("Clé Alpha Vantage manquante.");
  }

  const url = new URL("https://www.alphavantage.co/query");

  Object.entries({
    ...params,
    apikey: ALPHA_VANTAGE_API_KEY
  }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "TradeEverythingAI/1.0"
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("Erreur réseau Alpha Vantage.");
  }

  if (data["Error Message"]) {
    throw new Error(data["Error Message"]);
  }

  if (data["Information"]) {
    throw new Error(data["Information"]);
  }

  return data;
}

async function getQuote(symbol) {
  const data = await alphaVantageQuery({
    function: "GLOBAL_QUOTE",
    symbol
  });

  const quote = data["Global Quote"];

  if (!quote || !quote["01. symbol"]) {
    throw new Error(`Quote introuvable pour ${symbol}.`);
  }

  return {
    symbol: quote["01. symbol"],
    price: Number(quote["05. price"]),
    change: Number(quote["09. change"]),
    changePercent: Number(String(quote["10. change percent"]).replace("%", "")),
    volume: Number(quote["06. volume"])
  };
}

async function getSMA(symbol) {
  const data = await alphaVantageQuery({
    function: "SMA",
    symbol,
    interval: "daily",
    time_period: "20",
    series_type: "close"
  });

  const block = data["Technical Analysis: SMA"];
  if (!block) {
    return null;
  }

  const firstDate = Object.keys(block)[0];
  if (!firstDate) {
    return null;
  }

  return Number(block[firstDate]["SMA"]);
}

async function getNews(symbol) {
  const data = await alphaVantageQuery({
    function: "NEWS_SENTIMENT",
    tickers: symbol,
    limit: "3"
  });

  const feed = Array.isArray(data.feed) ? data.feed : [];

  return feed.slice(0, 3).map(item => ({
    title: item.title,
    source: item.source,
    sentimentLabel: item.overall_sentiment_label || "non précisé",
    sentimentScore: Number(item.overall_sentiment_score || 0)
  }));
}

function computeAIScore(quote, sma, news) {
  let score = 50;

  if (quote.changePercent > 1.5) score += 10;
  if (quote.changePercent < -1.5) score -= 10;

  if (sma !== null) {
    if (quote.price > sma) score += 12;
    if (quote.price < sma) score -= 12;
  }

  const validSentiments = news
    .map(n => n.sentimentScore)
    .filter(n => !Number.isNaN(n));

  const avgSentiment = validSentiments.length
    ? validSentiments.reduce((a, b) => a + b, 0) / validSentiments.length
    : 0;

  if (avgSentiment > 0.15) score += 12;
  if (avgSentiment < -0.15) score -= 12;

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    avgSentiment
  };
}

function detectOpportunity(score) {
  if (score >= 75) return "Acheter / surveiller fortement";
  if (score >= 60) return "Surveiller à l’achat";
  if (score >= 45) return "Attendre";
  if (score >= 30) return "Surveiller à la baisse";
  return "Éviter ou alléger";
}

function buildPrediction(quote, sma, score) {
  if (sma !== null && quote.price > sma && score >= 65) {
    return "Scénario probable : biais haussier modéré tant que le prix reste au-dessus de la moyenne mobile.";
  }

  if (sma !== null && quote.price < sma && score <= 40) {
    return "Scénario probable : biais baissier ou fragile tant que le prix reste sous la moyenne mobile.";
  }

  return "Scénario probable : phase d’hésitation, sans avantage directionnel très net pour le moment.";
}

function formatNews(news) {
  if (!news.length) {
    return "Aucune news exploitable trouvée pour l’instant.";
  }

  return news.map((item, index) => {
    return `- News ${index + 1} : ${item.title} (${item.source}) — sentiment ${item.sentimentLabel}`;
  }).join("\n");
}

function buildStockAnswer(symbol, quote, sma, news) {
  const { score, avgSentiment } = computeAIScore(quote, sma, news);
  const opportunity = detectOpportunity(score);
  const prediction = buildPrediction(quote, sma, score);

  return `Bonne question.

Analyse temps réel sur ${symbol} :

👉 Données boursières
- Prix actuel : ${quote.price.toFixed(2)} $
- Variation : ${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)} $ (${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%)
- Volume : ${quote.volume.toLocaleString("fr-FR")}
- SMA 20 jours : ${sma !== null ? sma.toFixed(2) + " $" : "indisponible"}

👉 News récentes
${formatNews(news)}

👉 Lecture IA
- Prix vs SMA20 : ${sma !== null ? (quote.price > sma ? "au-dessus" : "en dessous") : "indisponible"}
- Sentiment moyen news : ${avgSentiment.toFixed(2)}
- Score IA : ${score}/100
- Opportunité détectée : ${opportunity}

👉 Projection
${prediction}

👉 Conclusion
Cette réponse s’appuie sur des données de marché réelles et des news récentes, mais ce n’est pas une certitude absolue.`;
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

    const localAnswer = localDefinitionAnswer(message);
    if (localAnswer) {
      return res.json({
        ok: true,
        source: "knowledge_base",
        answer: localAnswer
      });
    }

    const symbol = extractSymbolFromMessage(message);

    if (!symbol) {
      return res.json({
        ok: true,
        source: "ai_generated",
        answer: `Je peux mieux t’aider si tu me donnes une action précise.

Exemples :
- Analyse Apple
- Analyse Nvidia
- News Tesla
- Opportunité Microsoft

Conclusion :
pour les vraies données boursières et les news, j’ai besoin d’un nom d’entreprise précis.`
      });
    }

    const [quote, sma, news] = await Promise.all([
      getQuote(symbol),
      getSMA(symbol),
      getNews(symbol)
    ]);

    return res.json({
      ok: true,
      source: "web_search",
      answer: buildStockAnswer(symbol, quote, sma, news)
    });
  } catch (error) {
    console.error("Erreur /ask-ai :", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Erreur interne du serveur."
    });
  }
});

app.get("/", (req, res) => {
  res.send("Backend IA TradeEverything actif.");
});

app.listen(PORT, () => {
  console.log(`Serveur IA lancé sur http://localhost:${PORT}`);
});
