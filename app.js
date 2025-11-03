const { connectBitunix } = require('./src/exchanges/bitunix');
const { connectBybit } = require('./src/exchanges/bybit');
const { connectBinance } = require('./src/exchanges/binance');
const { connectMexc } = require('./src/exchanges/mexc');
const { addChatId} = require('./trade/arbitrage');
const { syncOpenPositions } = require('./trade/SyncPositions');
const state = require('./state');
const { fetchSymbols } = require('./Symbols.js');
const { connectCoinex } = require('./src/exchanges/coinex.js');
const { connectGate } = require('./src/exchanges/gate.js');
const config = require('./config');
const axios = require('axios');
const { getStats } = require('./trade/arbitrage_stats');

async function start() {
  console.log(`🤖 Auto-trade is ${config.autoTrade ? 'ENABLED' : 'DISABLED'}`);
  
  if (config.autoTrade) {
    await syncOpenPositions();
    let syncInProgress = false;
    setInterval(async () => {
      if (syncInProgress) return;
      syncInProgress = true;
      try {
        await syncOpenPositions();
      } catch (err) {
        console.error('❌ Sync failed:', err);
      } finally {
        syncInProgress = false;
      }
    }, 5000);
  } else {
    console.log('⚠️  Skipping position sync - auto-trade disabled');
  }
  await fetchSymbols();
  connectBitunix();
  connectBybit();
  connectMexc();
  connectBinance();
  connectCoinex();
  connectGate();
  addChatId(5174987515);
  const express = require('express');
  const path = require('path');
  const app = express();

  app.use(express.static(path.join(__dirname, 'public')));

  // Prices (current state snapshot)
  app.get('/prices', (req, res) => {
    const obj = Object.fromEntries(state.prices.entries());
    res.json(obj);
  });

  // Aggregated arbitrage stats (1h/4h/12h/24h)
  app.get('/arbitrage-stats', (req, res) => {
    try {
      const stats = getStats();
      res.json(stats);
    } catch (e) {
      console.error('❌ /arbitrage-stats error:', e.message);
      res.status(500).json({ error: 'failed_to_load_stats' });
    }
  });

  // Funding-rate arbitrage aggregation
  app.get('/funding', (req, res) => {
    try {
      const minEdgePct = isNaN(parseFloat(req.query.minEdgePct)) ? 0.02 : parseFloat(req.query.minEdgePct);
      const limit = isNaN(parseInt(req.query.limit)) ? 100 : parseInt(req.query.limit);
      const allowed = (req.query.exchanges || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

      const results = [];

      for (const [symbol, obj] of state.prices.entries()) {
        const rates = {};
        const nextTimes = {};

        if (typeof obj.Bybit_funding_rate === 'number') {
          rates.bybit = obj.Bybit_funding_rate; // decimal (e.g., 0.0001)
          if (obj.Bybit_nextFundingTime) nextTimes.bybit = obj.Bybit_nextFundingTime;
        }
        if (typeof obj.Binance_funding_rate === 'number') {
          rates.binance = obj.Binance_funding_rate; // decimal
          if (obj.Binance_nextFundingTime) nextTimes.binance = obj.Binance_nextFundingTime;
        }
        if (typeof obj.Gate_funding_rate === 'number') {
          rates.gate = obj.Gate_funding_rate; // decimal
          if (obj.Gate_nextFundingTime) nextTimes.gate = obj.Gate_nextFundingTime;
        }
        if (typeof obj.Mexc_funding_rate === 'number') {
          rates.mexc = obj.Mexc_funding_rate;
          if (obj.Mexc_nextFundingTime) nextTimes.mexc = obj.Mexc_nextFundingTime;
        }
        if (typeof obj.Coinex_funding_rate === 'number') {
          rates.coinex = obj.Coinex_funding_rate;
          if (obj.Coinex_nextFundingTime) nextTimes.coinex = obj.Coinex_nextFundingTime;
        }
        if (typeof obj.Bitunix_funding_rate === 'number') {
          rates.bitunix = obj.Bitunix_funding_rate;
          if (obj.Bitunix_nextFundingTime) nextTimes.bitunix = obj.Bitunix_nextFundingTime;
        }

        const exchanges = Object.keys(rates);
        if (exchanges.length < 2) continue;

        let best = null;
        for (let i = 0; i < exchanges.length; i++) {
          for (let j = 0; j < exchanges.length; j++) {
            if (i === j) continue;
            const longEx = exchanges[i];
            const shortEx = exchanges[j];
            if (allowed.length > 0 && (!allowed.includes(longEx) || !allowed.includes(shortEx))) continue;

            const longRateDec = rates[longEx];
            const shortRateDec = rates[shortEx];
            if (typeof longRateDec !== 'number' || typeof shortRateDec !== 'number') continue;

            // Net carry per period: short receives - long pays (approx)
            const netEdgePct = (shortRateDec - longRateDec) * 100; // percent
            if (!best || netEdgePct > best.netEdgePct) {
              best = {
                symbol,
                longEx,
                shortEx,
                longRatePct: longRateDec * 100,
                shortRatePct: shortRateDec * 100,
                netEdgePct,
                longNext: nextTimes[longEx] || null,
                shortNext: nextTimes[shortEx] || null,
                longPrice: obj.exchanges?.[longEx],
                shortPrice: obj.exchanges?.[shortEx],
              };
            }
          }
        }

        if (best && best.netEdgePct >= minEdgePct) {
          results.push(best);
        }
      }

      results.sort((a, b) => b.netEdgePct - a.netEdgePct);
      res.json(results.slice(0, limit));
    } catch (e) {
      console.error('❌ /funding error:', e.message);
      res.status(500).json({ error: 'failed_to_compute_funding' });
    }
  });

  // Periodic funding collectors (Bybit + Binance); Gate arrives via WS
  async function refreshBinanceFunding() {
    try {
      const url = 'https://fapi.binance.com/fapi/v1/premiumIndex';
      const { data } = await axios.get(url);
      if (!Array.isArray(data)) return;
      for (const item of data) {
        const symbol = item.symbol;
        if (!symbol) continue;
        const rate = parseFloat(item.lastFundingRate);
        const nextTime = parseInt(item.nextFundingTime);
        if (isNaN(rate)) continue;
        let entry = state.prices.get(symbol) || { exchanges: {} };
        entry.Binance_funding_rate = rate; // decimal
        if (!isNaN(nextTime)) entry.Binance_nextFundingTime = nextTime;
        state.prices.set(symbol, entry);
      }
    } catch (err) {
      console.error('❌ refreshBinanceFunding error:', err.message);
    }
  }

  async function refreshBybitFunding() {
    try {
      const url = 'https://api.bybit.com/v5/market/funding/prev-funding-rate';
      const { data } = await axios.get(url, { params: { category: 'linear' } });
      const list = data?.result?.list;
      if (!Array.isArray(list)) return;
      for (const item of list) {
        const symbol = item.symbol;
        if (!symbol) continue;
        const rate = parseFloat(item.fundingRate ?? item.funding_rate ?? item.funding);
        const ts = parseInt(item.fundingRateTimestamp ?? item.fundingTime ?? 0);
        if (isNaN(rate)) continue;
        let entry = state.prices.get(symbol) || { exchanges: {} };
        entry.Bybit_funding_rate = rate; // decimal
        if (!isNaN(ts)) entry.Bybit_nextFundingTime = ts;
        state.prices.set(symbol, entry);
      }
    } catch (err) {
      console.error('❌ refreshBybitFunding error:', err.message);
    }
  }

  // kick off and schedule
  refreshBinanceFunding();
  refreshBybitFunding();
  setInterval(refreshBinanceFunding, 60_000);
  setInterval(refreshBybitFunding, 120_000);

  app.listen(3000, '0.0.0.0', () => {
    console.log('🚀 Server listening on http://localhost:3000');
  });
}

start().catch(console.error);
