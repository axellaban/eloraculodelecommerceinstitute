// api/normalize.js - Vercel Serverless Function for Capa 0 Normalizer
// Bypasses CORS and fetches deterministic stock/crypto data from Yahoo Finance

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { ticker } = req.query;
    if (!ticker) {
        return res.status(400).json({ error: "Missing ticker parameter" });
    }

    let symbol = ticker.trim().toUpperCase();
    
    // Ticker translations for common assets
    if (symbol === 'BTC') symbol = 'BTC-USD';
    if (symbol === 'ETH') symbol = 'ETH-USD';
    if (symbol === 'YPF') symbol = 'YPFD.BA'; // Default to Argentine local ticker or YPF ADR (YPF)
    
    try {
        // Fetch historical weekly data for the last 10 years from Yahoo Finance
        const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=10y&interval=1wk`;
        const response = await fetch(yfUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Yahoo Finance responded with status ${response.status}`);
        }
        
        const data = await response.json();
        const result = data.chart?.result?.[0];
        
        if (!result) {
            throw new Error("No chart result found for symbol " + symbol);
        }
        
        const meta = result.meta;
        const prices = result.indicators?.quote?.[0]?.close || [];
        const validPrices = prices.filter(p => p !== null && p !== undefined);
        
        if (validPrices.length === 0) {
            throw new Error("No valid price history found for symbol " + symbol);
        }
        
        const currentPrice = meta.regularMarketPrice || validPrices[validPrices.length - 1];
        
        // Calculate ATH and Max Peak-to-Trough Drawdown
        let ath = 0;
        let runningMax = 0;
        let maxDrawdown = 0;
        
        validPrices.forEach(price => {
            if (price > ath) {
                ath = price;
            }
            if (price > runningMax) {
                runningMax = price;
            }
            const drawdown = ((runningMax - price) / runningMax) * 100;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        });
        
        // Current drawdown
        const currentDrawdown = ((ath - currentPrice) / ath) * 100;
        
        // Define regime based on drawdown and asset class
        let regime = "Estable";
        if (symbol.includes('-USD')) {
            regime = "Especulativa (Cripto)";
        } else if (maxDrawdown > 50) {
            regime = "Cíclica / Reestructuración (Alta Volatilidad)";
        } else if (currentDrawdown < 15) {
            regime = "Crecimiento Estable (Bajo Drawdown)";
        } else {
            regime = "Crecimiento rápido (En Corrección)";
        }
        
        const state = {
            asset: ticker.toUpperCase(),
            price: `$${currentPrice.toFixed(2)} USD`,
            date: new Date().toLocaleDateString('es-ES'),
            ath: `$${ath.toFixed(2)} USD`,
            drawdown_actual: `${currentDrawdown.toFixed(2)}%`,
            drawdown_historico_max: `${maxDrawdown.toFixed(2)}%`,
            regime: regime,
            portfolio_context: "Capa 0 determinística"
        };
        
        return res.status(200).json(state);
        
    } catch (error) {
        console.error(`Error normalizing ${symbol}:`, error);
        return res.status(500).json({ 
            error: "Failed to normalize financial data", 
            details: error.message 
        });
    }
}
