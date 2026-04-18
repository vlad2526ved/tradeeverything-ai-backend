const express = require("express");
const cors = require("cors");
const { answerQuestion } = require("./ai-backend-engine");

const app = express();
const PORT = process.env.PORT || 3000;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

app.use(cors());
app.use(express.json());

// ─── Mémoire utilisateur (par session) ───────────────────────────────────────
const userMemory = {
  portfolio: {},
  favoriteStocks: [],
  recentQuestions: [],
  tradingStyle: "inconnu"
};

const COMPANY_SYMBOLS = {
  apple: "AAPL", amazon: "AMZN", google: "GOOGL", alphabet: "GOOGL",
  meta: "META", facebook: "META", nvidia: "NVDA", tesla: "TSLA",
  microsoft: "MSFT", aapl: "AAPL", amzn: "AMZN", googl: "GOOGL",
  nvda: "NVDA", tsla: "TSLA", msft: "MSFT"
};

function normalizeText(text) {
  return String(text || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim();
}

function extractSymbolFromMessage(message) {
  const text = normalizeText(message);
  for (const key of Object.keys(COMPANY_SYMBOLS)) {
    if (text.includes(key)) return COMPANY_SYMBOLS[key];
  }
  return null;
}

function updateMemory(message, symbol) {
  userMemory.recentQuestions.push(message);
  if (userMemory.recentQuestions.length > 10) userMemory.recentQuestions.shift();

  if (symbol && !userMemory.favoriteStocks.includes(symbol)) {
    const count = userMemory.recentQuestions.filter(q =>
      normalizeText(q).includes(normalizeText(symbol))
    ).length;
    if (count >= 2) userMemory.favoriteStocks.push(symbol);
  }

  const text = normalizeText(message);
  if (text.includes("achet") || text.includes("invest")) userMemory.tradingStyle = "acheteur actif";
  if (text.includes("vend") || text.includes("profit")) userMemory.tradingStyle = "profit taker";
  if (text.includes("risque") || text.includes("prudent")) userMemory.tradingStyle = "prudent";
}

function buildMemoryContext() {
  const parts = [];
  if (userMemory.favoriteStocks.length > 0) {
    parts.push(`Actions favorites : ${userMemory.favoriteStocks.join(", ")}`);
  }
  if (userMemory.tradingStyle !== "inconnu") {
    parts.push(`Style de trading : ${userMemory.tradingStyle}`);
  }
  if (userMemory.recentQuestions.length > 0) {
    parts.push(`Questions récentes : ${userMemory.recentQuestions.slice(-3).join(" | ")}`);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

// ─── Alpha Vantage ────────────────────────────────────────────────────────────
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
  return firstDate ? Number(block[firstDate]["SMA"]) : null;
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

// ─── Groq IA ──────────────────────────────────────────────────────────────────
async function askGroq(userMessage, stockContext = null, memoryContext = null) {
  if (!GROQ_API_KEY) throw new Error("Clé Groq manquante.");

  const systemPrompt = `Tu es TradeAI, un assistant boursier expert et personnalisé intégré dans l'application TradeEverything.
Tu réponds toujours en français, de façon claire, directe et pédagogique.
Tu peux répondre à n'importe quelle question sur : la bourse, les actions, les stratégies d'investissement, les indicateurs financiers, l'économie, les cryptos, les ETF, les dividendes, la gestion de portefeuille, et les conseils pour débutants.
Tu adaptes ton niveau d'explication selon le style de l'utilisateur.
Tes réponses sont structurées, max 250 mots, et se terminent toujours par "Conclusion :" en une phrase.
Tu es bienveillant, encourageant, et jamais condescendant.
Tu ne refuses jamais de répondre à une question financière.`;

  const contextParts = [];
  if (memoryContext) contextParts.push(`Profil utilisateur :\n${memoryContext}`);
  if (stockContext) contextParts.push(`Données de marché en temps réel :\n${stockContext}`);

  const fullMessage = contextParts.length > 0
    ? `${contextParts.join("\n\n")}\n\nQuestion : ${userMessage}`
    : userMessage;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 512,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: fullMessage }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Erreur API Groq.");
  return data.choices[0].message.content;
}

// ─── Route principale ─────────────────────────────────────────────────────────
app.post("/ask-ai", async (req, res) => {
  try {
    const { message, portfolio } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ ok: false, error: "Message invalide." });
    }

    const symbol = extractSymbolFromMessage(message);
    updateMemory(message, symbol);

    if (portfolio) userMemory.portfolio = portfolio;

    const memoryContext = buildMemoryContext();

    // ─── IA LOCALE EN PRIORITÉ ────────────────────────────────────────────────
    // Si un portfolio est fourni, on utilise l'IA locale qui connaît les holdings
    if (portfolio && typeof portfolio.holdings === "object") {
      try {
        const companyData = {};
        for (const [sym, name] of Object.entries(COMPANY_SYMBOLS)) {
          if (!companyData[name] && sym === name.toLowerCase()) {
            try {
              const quote = await getQuote(name);
              companyData[name] = {
                name: name.toUpperCase(),
                symbol: name,
                stock: {
                  currentPrice: quote.price,
                  changeValue: quote.change,
                  changePercent: quote.changePercent,
                  dayHigh: quote.price * 1.02,
                  dayLow: quote.price * 0.98,
                  volume: quote.volume,
                  pe: 25,
                  eps: 5,
                  marketCap: 1_000_000_000_000
                }
              };
            } catch {}
          }
        }
        const answer = await answerQuestion(message, portfolio, companyData);
        if (answer && !answer.includes("Je n'ai pas trouvé")) {
          return res.json({ ok: true, source: "knowledge_base", answer });
        }
      } catch (err) {
        console.log("IA locale échouée, fallback Groq:", err.message);
      }
    }

    // ─── FALLBACK GROQ ────────────────────────────────────────────────────────
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
News: ${news.map(n => `${n.title} (${n.sentimentLabel})`).join(" | ")}
        `.trim();

        const answer = await askGroq(message, stockContext, memoryContext);
        return res.json({ ok: true, source: "web_search", answer });
      } catch {
        const answer = await askGroq(message, null, memoryContext);
        return res.json({ ok: true, source: "ai_generated", answer });
      }
    }

    const answer = await askGroq(message, null, memoryContext);
    return res.json({ ok: true, source: "ai_generated", answer });

  } catch (error) {
    console.error("Erreur /ask-ai :", error);
    return res.status(500).json({ ok: false, error: error.message || "Erreur interne." });
  }
});

app.get("/", (req, res) => {
  res.send("TradeAI backend actif 🚀");
});

app.listen(PORT, () => {
  console.log(`Serveur TradeAI lancé sur http://localhost:${PORT}`);
});
