const express = require("express");
const cors = require("cors");
const { answerQuestion } = require("./ai-backend-engine");

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * CORS
 * En dev on autorise tout.
 * Si un jour tu déploies, tu pourras restreindre ici.
 */
app.use(cors());

/**
 * JSON body parser
 */
app.use(express.json({ limit: "5mb" }));

/**
 * Petit logger simple
 */
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.url}`);
  next();
});

/**
 * Helpers
 */
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safePortfolio(input) {
  if (!isObject(input)) {
    return {
      cash: 0,
      holdings: {}
    };
  }

  return {
    cash: Number(input.cash || 0),
    holdings: isObject(input.holdings) ? input.holdings : {}
  };
}

function safeCompanyData(input) {
  return isObject(input) ? input : {};
}

function buildErrorResponse(error, fallbackMessage = "Erreur interne du serveur.") {
  return {
    ok: false,
    error: error?.message || fallbackMessage
  };
}

/**
 * Route santé
 */
app.get("/", (req, res) => {
  res.status(200).send("Backend IA TradeEverything actif.");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tradeeverything-ai-backend",
    status: "up",
    timestamp: new Date().toISOString()
  });
});

/**
 * Route principale IA
 */
app.post("/ask-ai", async (req, res) => {
  try {
    const body = req.body || {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const portfolio = safePortfolio(body.portfolio);
    const companyData = safeCompanyData(body.companyData);

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "Message invalide ou vide."
      });
    }

    const answer = await answerQuestion(message, portfolio, companyData);

    return res.status(200).json({
      ok: true,
      source: "ai_generated",
      answer,
      meta: {
        receivedMessageLength: message.length,
        holdingsCount: Object.keys(portfolio.holdings).length,
        companiesCount: Object.keys(companyData).length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Erreur /ask-ai :", error);
    return res.status(500).json(buildErrorResponse(error));
  }
});

/**
 * Route debug optionnelle
 * Permet de vérifier rapidement ce que reçoit le backend.
 */
app.post("/debug-ai-payload", (req, res) => {
  try {
    const body = req.body || {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const portfolio = safePortfolio(body.portfolio);
    const companyData = safeCompanyData(body.companyData);

    return res.status(200).json({
      ok: true,
      debug: {
        message,
        holdingsKeys: Object.keys(portfolio.holdings),
        companyKeys: Object.keys(companyData),
        cash: portfolio.cash
      }
    });
  } catch (error) {
    console.error("Erreur /debug-ai-payload :", error);
    return res.status(500).json(buildErrorResponse(error));
  }
});

/**
 * 404
 */
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route introuvable."
  });
});

/**
 * Error handler global
 */
app.use((error, req, res, next) => {
  console.error("Erreur non gérée :", error);
  res.status(500).json(buildErrorResponse(error));
});

app.listen(PORT, () => {
  console.log(`✅ Serveur IA lancé sur http://localhost:${PORT}`);
});
