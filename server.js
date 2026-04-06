const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

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

async function alphaVantageQuery(params) {
  if (!ALPHA_VANTAGE_API_KEY) throw new Error("Clé Alpha Vantage manquante.");

  const url = new URL("https://www.alphavantage.co/query");
  Object.entries({ ...params, apikey: ALPHA_VANTAGE_API_KEY }).forEach(([k, v]) => {
    url.searchParams.set(k, v);
  });

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "TradeEverythingAI/1.0" }
  });

  const data = await response.json();
  if (!response.ok) throw new Error("Erreur réseau Alpha Vantage.");
  if (data["Error Message"]) throw new Error(data["Error Message"]);
  if (data["Information"]) throw new Error(data["Information"]);
  return data;
}

async function getQuote(symbol) {
  const data = await alphaVantageQuery({ function: "GLOBAL_QUOTE", symbol });
  const quote = data["Global Quote"];
  if (!quote || !quote["01. symbol"]) throw new Error(`Quote introuvable pour ${symbol}.`);
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
    function: "SMA", symbol, interval: "daily", time_period: "20", series_type: "close"
  });
  const block = data["Technical Analysis: SMA"];
  if (!block) return null;
  const firstDate = Object.keys(block)[0];
  if (!firstDate) return null;
  return Number(block[firstDate]["SMA"]);
}

async function getNews(symbol) {
  const data = await alphaVantageQuery({
    function: "NEWS_SENTIMENT", tickers: symbol, limit: "3"
  });
  const feed = Array.isArray(data.feed) ? data.feed : [];
  return feed.slice(0, 3).map(item => ({
    title: item.title,
    source: item.source,
    sentimentLabel: item.overall_sentiment_label || "non précisé",
    sentimentScore: Number(item.overall_sentiment_score || 0)
  }));
}

// ✅ Réponse Claude pour toute question générale
async function askClaude(userMessage, stockContext = null) {
  if (!ANTHROPIC_API_KEY) throw new Error("Clé Anthropic manquante.");

  const systemPrompt = `Tu es un assistant boursier expert intégré dans une application de trading appelée TradeEverything.
Tu réponds en français, de façon claire, directe et pédagogique.
Tu peux répondre à des questions générales sur la bourse, les actions, les stratégies d'investissement, les indicateurs financiers, les actualités du marché, et les conseils pour débutants.
Tes réponses doivent être concises (max 200 mots), bien structurées, et toujours se terminer par une "Conclusion :" en une phrase.
Tu es bienveillant et encourageant avec les débutants.
Ne dis jamais que tu ne peux pas répondre à une question de finance ou trading — essaie toujours d'apporter une réponse utile.`;

  const userContent = stockContext
    ? `Voici les données de marché actuelles pour contexte :\n${stockContext}\n\nQuestion de l'utilisateur : ${userMessage}`
    : userMessage;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Erreur API Claude.");
  return data.content[0].text;
}

app.post("/ask-ai", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ ok: false, error: "Message invalide." });
    }

    const symbol = extractSymbolFromMessage(message);

    // Si une action est mentionnée → données réelles + Claude
    if (symbol) {
      try {
        const [quote, sma, news] = await Promise.all([
          getQuote(symbol),
          getSMA(symbol),
          getNews(symbol)
        ]);

        const stockContext = `
Symbole: ${symbol}
Prix actuel: ${quote.price.toFixed(2)} $
Variation: ${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)} $ (${quote.changePercent.toFixed(2)}%)
Volume: ${quote.volume.toLocaleString("fr-FR")}
SMA 20 jours: ${sma !== null ? sma.toFixed(2) + " $" : "indisponible"}
News récentes: ${news.map(n => `${n.title} (${n.sentimentLabel})`).join(" | ")}
        `.trim();

        const answer = await askClaude(message, stockContext);
        return res.json({ ok: true, source: "web_search", answer });
      } catch (stockError) {
        // Si les données boursières échouent, Claude répond quand même
        const answer = await askClaude(message);
        return res.json({ ok: true, source: "ai_generated", answer });
      }
    }

    // Sinon → Claude répond directement
    const answer = await askClaude(message);
    return res.json({ ok: true, source: "ai_generated", answer });

  } catch (error) {
    console.error("Erreur /ask-ai :", error);
    return res.status(500).json({ ok: false, error: error.message || "Erreur interne." });
  }
});

app.get("/", (req, res) => {
  res.send("Backend IA TradeEverything actif.");
});

app.listen(PORT, () => {
  console.log(`Serveur IA lancé sur http://localhost:${PORT}`);
});
