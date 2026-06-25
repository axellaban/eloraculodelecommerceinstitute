// api/deliberate.js - Vercel Serverless Function
// Core orchestrator for the "El Oráculo de los 7" value investing agentic pipeline

import fs from 'fs';
import path from 'path';

// --- CONFIG & FALLBACKS ---
const DEFAULT_ORCHESTRATOR_PROMPT = `Eres el Orquestador del "Council of 7 Investors". Tu trabajo es tomar un activo financiero o cartera, analizar la información unificada de la Capa 0 (datos de mercado y perfil) junto con los veredictos individuales de 7 inversores expertos, y generar una síntesis consolidada, analítica y accionable.

Sigue rigurosamente estas pautas para la Síntesis:
1. Identifica el nivel de convergencia (ej. "5 de 7 coinciden en comprar").
2. Nombra y profundiza en las discrepancias reales y argumentadas entre expertos (por qué tensionan sus modelos, ej. Graham vs. Marks).
3. Declara los puntos ciegos que ningún framework cubre para el activo analizado.
4. Genera un veredicto consolidado claro con sugerencia de posicionamiento o rebalanceo.
Utiliza formato Markdown impecable, con tablas comparativas y un tono profesional y analítico.`;

const INVESTORS_LIST = [
    {
        id: 'fisher',
        name: 'Philip Fisher',
        skillPath: 'skills/book-fisher-common-stocks-and-uncommon-profits/SKILL.md',
        fallbackPrompt: `Actúa como Philip Fisher. Evalúa la calidad cualitativa (Scuttlebutt, las 4 Dimensiones de Inversión Conservadora, excelencia de management, pricing power). 
Si el activo es una criptomoneda, commodity o activo especulativo sin flujo de caja o management corporativo, debes dictaminar "applicable: false" con veredicto "No aplica" y justificarlo.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": false,
  "verdict": "No aplica",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'graham',
        name: 'Benjamin Graham',
        skillPath: 'skills/book-graham-el-inversor-inteligente/SKILL.md',
        fallbackPrompt: `Actúa como Benjamin Graham. Evalúa bajo el concepto de Inversión vs Especulación (análisis exhaustivo, seguridad del principal y rendimiento adecuado). Determina si el precio de hoy representa a Mr. Market en pánico o euforia.
Si el activo no tiene activos tangibles o flujos históricos predecibles (como criptomonedas), determina "applicable: false" o califícalo claramente como Especulación Pura con veredicto "No comprar" indicando que no califica como inversión.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": true,
  "verdict": "Comprar" | "No comprar" | "Esperar",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'dodd',
        name: 'Graham & Dodd',
        skillPath: 'skills/book-graham-security-analysis/SKILL.md',
        fallbackPrompt: `Actúa como Graham & Dodd. Evalúa el Valor Intrínseco Contable (valor de liquidación net-net, earnings power normalizado).
Si el activo no tiene balance contable (ej. Bitcoin, oro), debes dictaminar "applicable: false" con veredicto "No aplica" indicando que el balance contable es inexistente.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": false,
  "verdict": "No aplica",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'klarman',
        name: 'Seth Klarman',
        skillPath: 'skills/book-klarman-margin-of-safety/SKILL.md',
        fallbackPrompt: `Actúa como Seth Klarman. Evalúa el margen de seguridad absoluto y el nivel de efectivo (cash) de la cartera. Prioriza la preservación del capital nominal por encima de vencer al índice.
Si la cartera está 100% invertida sin efectivo, sé directo y critícalo.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": true,
  "verdict": "Comprar" | "No comprar" | "Esperar" | "Reducir",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'lynch',
        name: 'Peter Lynch',
        skillPath: 'skills/book-lynch-un-paso-por-delante-de-wall-street/SKILL.md',
        fallbackPrompt: `Actúa como Peter Lynch. Clasifica el activo en una de las 6 categorías (Slow Grower, Stalwart, Fast Grower, Cyclical, Turnaround, Asset Play) o categoría especulativa. Evalúa el PEG (Crecimiento vs PER) y deuda neta.
Si el activo no tiene beneficios (PER) o crecimiento medible (como BTC), clasifícalo como Especulativo y detalla por qué no se puede calcular un PEG.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": true,
  "verdict": "Comprar" | "No comprar" | "Esperar",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'marks',
        name: 'Howard Marks',
        skillPath: 'skills/book-marks-the-most-important-thing/SKILL.md',
        fallbackPrompt: `Actúa como Howard Marks. Aplica Pensamiento de Segundo Nivel y evalúa en qué punto del ciclo de mercado y péndulo de riesgo nos encontramos. Evalúa qué cree el consenso y cuál es la apuesta contraria racional.
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": true,
  "verdict": "Comprar" | "No comprar" | "Esperar" | "Reducir",
  "rationale": "...",
  "watch_metric": "..."
}`
    },
    {
        id: 'thorndike',
        name: 'William Thorndike',
        skillPath: 'skills/book-thorndike-the-outsiders/SKILL.md',
        fallbackPrompt: `Actúa como William Thorndike. Evalúa desde la Asignación Racional de Capital. Analiza el costo de oportunidad de destinar capital marginal a este activo frente a otras opciones (como cash o activos existentes).
Debes devolver estrictamente un objeto JSON con este formato:
{
  "applicable": true,
  "verdict": "Comprar" | "No comprar" | "Esperar" | "Reducir",
  "rationale": "...",
  "watch_metric": "..."
}`
    }
];

// --- MAIN HANDLER ---
export default async function handler(req, res) {
    // CORS configuration
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
    }

    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: "Missing 'query' parameter in request body." });
    }

    try {
        // --- 1. DETECT TICKER ---
        const ticker = extractTicker(query);
        const portfolio = extractPortfolioContext(query);

        // --- 2. CAPA 0 (Normalizador + Serper + Firecrawl) ---
        console.log(`[Capa 0] Iniciando normalización para ticker: ${ticker}`);
        const capa0State = await runCapa0Normalizer(ticker, portfolio);

        // --- 3. LOAD SKILLS FROM LOCAL SYSTEM ---
        console.log(`[Skills] Cargando archivos de skill del sistema de archivos...`);
        const skills = {};
        INVESTORS_LIST.forEach(inv => {
            try {
                const fullPath = path.join(process.cwd(), inv.skillPath);
                if (fs.existsSync(fullPath)) {
                    skills[inv.id] = fs.readFileSync(fullPath, 'utf-8');
                } else {
                    skills[inv.id] = inv.fallbackPrompt;
                }
            } catch (err) {
                console.warn(`Error leyendo skill para ${inv.name}: ${err.message}`);
                skills[inv.id] = inv.fallbackPrompt;
            }
        });

        let orquestadoraSkill = DEFAULT_ORCHESTRATOR_PROMPT;
        try {
            const orqPath = path.join(process.cwd(), 'skills/council-of-7-investors/SKILL.md');
            if (fs.existsSync(orqPath)) {
                orquestadoraSkill = fs.readFileSync(orqPath, 'utf-8');
            }
        } catch (err) {
            console.warn(`Error leyendo skill orquestadora: ${err.message}`);
        }

        // --- 4. FAN-OUT (7 subagents in parallel) ---
        console.log(`[Fan-out] Ejecutando 7 subagentes en paralelo...`);
        const subagentPromises = INVESTORS_LIST.map(async (inv) => {
            const systemPrompt = `Tu instrucción base de rol es:\n${skills[inv.id]}\n\nREGLA DE SALIDA IMPERATIVA:
Debes evaluar la Capa 0 e ingresar tu veredicto en formato JSON válido. No escribas prosa antes ni después del JSON. Devuelve exactamente este esquema:
{
  "applicable": true/false,
  "verdict": "Comprar" | "No comprar" | "Esperar" | "Reducir" | "No aplica",
  "rationale": "Análisis resumido en 3-4 líneas aplicando exactamente tu framework y fórmulas",
  "watch_metric": "La métrica específica de tu modelo mental que monitorearías"
}`;
            const userPrompt = `Evalúa el siguiente estado de Capa 0:\n${JSON.stringify(capa0State, null, 2)}`;
            
            try {
                const textResponse = await callLLMWithFallback(systemPrompt, userPrompt);
                const cleanText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                return { id: inv.id, result: JSON.parse(cleanText) };
            } catch (err) {
                console.error(`Error en subagente ${inv.name}:`, err);
                return { 
                    id: inv.id, 
                    result: { 
                        applicable: false, 
                        verdict: "Error", 
                        rationale: `Error de LLM: ${err.message}`, 
                        watch_metric: "Conexión" 
                    } 
                };
            }
        });

        const subagentResultsArray = await Promise.all(subagentPromises);
        const subagentsResults = {};
        subagentResultsArray.forEach(item => {
            subagentsResults[item.id] = item.result;
        });

        // --- 5. FAN-IN (Synthesis) ---
        console.log(`[Fan-in] Generando síntesis consolidada...`);
        const pipelineData = {
            capa0: capa0State,
            subagents: subagentsResults
        };

        const userPromptSynthesis = `El usuario realiza la consulta: "${query}"
        
Aquí están los datos consolidados del pipeline:
${JSON.stringify(pipelineData, null, 2)}`;

        const synthesisContent = await callLLMWithFallback(orquestadoraSkill, userPromptSynthesis);

        // --- 6. RETURN COMPLETE PIPELINE JSON ---
        return res.status(200).json({
            synthesis: synthesisContent,
            capa0: capa0State,
            subagents: subagentsResults
        });

    } catch (error) {
        console.error("Pipeline failure:", error);
        return res.status(500).json({ 
            error: "Hubo un fallo en la ejecución del pipeline agéntico.",
            details: error.message 
        });
    }
}

// --- LLM CALL WITH FALLBACK (Claude Sonnet -> Gemini 2.5 Flash) ---
async function callLLMWithFallback(systemInstruction, userPrompt) {
    // 1. Try Claude Sonnet (Primary)
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'claude-3-5-sonnet-20241022', // Sonnet 3.5/4.6 Equivalent
                    max_tokens: 4000,
                    system: systemInstruction,
                    messages: [
                        { role: 'user', content: userPrompt }
                    ]
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.content[0].text;
            } else {
                const errText = await response.text();
                console.warn(`Claude Sonnet API error (status ${response.status}): ${errText}. Falling back to Gemini.`);
            }
        } catch (err) {
            console.warn(`Failed call to Claude Sonnet: ${err.message}. Falling back to Gemini.`);
        }
    }

    // 2. Try Gemini 2.5 Flash (Fallback)
    if (process.env.GEMINI_API_KEY) {
        try {
            const payload = {
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] }
            };
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json();
                return data.candidates?.[0]?.content?.parts?.[0]?.text;
            } else {
                const errText = await response.text();
                throw new Error(`Gemini 2.5 Flash API error: ${errText}`);
            }
        } catch (err) {
            throw new Error(`Failed fallback LLM call: ${err.message}`);
        }
    }

    throw new Error("No API keys found. Please configure ANTHROPIC_API_KEY or GEMINI_API_KEY.");
}

// --- CAPA 0 DATA RETRIEVAL (Serper + optional Firecrawl + Extraction) ---
async function runCapa0Normalizer(ticker, portfolio) {
    let rawSearchText = "";
    let fetchedUrl = null;

    // 1. Serper Search
    if (process.env.SERPER_API_KEY) {
        try {
            const searchQuery = `${ticker} stock price price actual all time high drawdown news 2026`;
            const response = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: {
                    'X-API-KEY': process.env.SERPER_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ q: searchQuery, num: 6 })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.answerBox) {
                    rawSearchText += `Respuesta Directa de Google (AnswerBox): ${JSON.stringify(data.answerBox)}\n\n`;
                }
                if (data.organic) {
                    rawSearchText += "Resultados Orgánicos de Google:\n";
                    data.organic.forEach((item, idx) => {
                        rawSearchText += `[${idx+1}] ${item.title}\nLink: ${item.link}\nResumen: ${item.snippet}\n\n`;
                    });
                    
                    // Grab the first organic link to scrape if we have Firecrawl
                    if (data.organic.length > 0) {
                        fetchedUrl = data.organic[0].link;
                    }
                }
            } else {
                console.warn(`Serper API responded with status ${response.status}`);
            }
        } catch (err) {
            console.error(`Serper API Error: ${err.message}`);
        }
    }

    // 2. Firecrawl Scrape (If Serper gave us a link, and we have Firecrawl key)
    if (process.env.FIRECRAWL_API_KEY && fetchedUrl) {
        // Only scrape if it is a major financial info domain (e.g., yahoo, bloomberg, investing, marketwatch)
        const isFinDomain = /yahoo|bloomberg|investing|marketwatch|coingecko|coinmarketcap/i.test(fetchedUrl);
        if (isFinDomain) {
            try {
                console.log(`[Firecrawl] Raspando página profunda con Firecrawl: ${fetchedUrl}`);
                const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url: fetchedUrl, formats: ['markdown'] })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.data?.markdown) {
                        // Append first 5000 characters of scraped page
                        rawSearchText += `\n--- CONTENIDO COMPLETO DE LA PÁGINA (${fetchedUrl}) ---\n`;
                        rawSearchText += data.data.markdown.substring(0, 5000);
                        rawSearchText += `\n--- FIN CONTENIDO PÁGINA ---\n`;
                    }
                } else {
                    console.warn(`Firecrawl scrape failed with status ${response.status}`);
                }
            } catch (err) {
                console.error(`Firecrawl Error: ${err.message}`);
            }
        }
    }

    // If search text is empty (no APIs configured or both failed), fallback to generic prompt grounding
    if (!rawSearchText) {
        rawSearchText = "No Google search results available. Fetch estimates from LLM internal knowledge.";
    }

    // 3. Extract JSON using fast LLM call
    const systemPrompt = `Actúas como el extractor y normalizador de la Capa 0. Tu misión es analizar la información textual recopilada de búsquedas en internet y estructurar un objeto JSON inmutable con datos financieros.
Debes devolver estrictamente un JSON válido. No escribas nada de prosa antes o después. Formato:
{
  "asset": "${ticker}",
  "price": "precio_actual_en_usd (ej: $154.20 USD o $67300 USD)",
  "date": "${new Date().toLocaleDateString('es-ES')}",
  "ath": "maximo_historico_en_usd",
  "drawdown_actual": "%_caida_actual_desde_ath (ej: 12.35%)",
  "drawdown_historico_max": "%_maxima_caida_historica_registrada (estimado o real)",
  "regime": "Crecimiento rápido / Estable / Cíclica / Especulativa / Reestructuración (según volatilidad y drawdown)",
  "portfolio_context": "${portfolio}"
}`;

    const userPrompt = `Aquí está la información de mercado recopilada de internet:\n${rawSearchText}\n\nExtrae los números para ${ticker}.`;

    try {
        const textResponse = await callLLMWithFallback(systemPrompt, userPrompt);
        const cleanText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
    } catch (err) {
        console.error("Capa 0 Extraction failed:", err);
        // Direct fallback JSON
        return {
            asset: ticker,
            price: "Desconocido (error en búsqueda)",
            date: new Date().toLocaleDateString('es-ES'),
            ath: "Desconocido",
            drawdown_actual: "0%",
            drawdown_historico_max: "0%",
            regime: "Especulativa",
            portfolio_context: portfolio
        };
    }
}

// --- HELPERS ---
function extractTicker(query) {
    const cleaned = query.toUpperCase();
    const commonTickers = ['AAPL', 'MSFT', 'TSLA', 'AMZN', 'YPF', 'BTC', 'ETH', 'KO', 'PEP', 'GGAL', 'ALUA', 'MELI', 'BABA', 'NVDA', 'SPY', 'QQQ'];
    
    for (const tick of commonTickers) {
        if (cleaned.includes(tick)) return tick;
    }
    
    const matches = query.match(/[A-Z]{2,5}/g);
    if (matches && matches.length > 0) return matches[0];
    
    return "ACTIVO INDIVIDUAL";
}

function extractPortfolioContext(query) {
    if (query.toLowerCase().includes("cartera") || query.toLowerCase().includes("portafolio")) {
        return query;
    }
    return "No especificado (analizando activo de forma aislada).";
}
