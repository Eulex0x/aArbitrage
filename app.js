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

async function start() {
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
  app.get('/prices', (req, res) => {
    // Convert Map to object for JSON response
    const obj = Object.fromEntries(state.prices.entries());
    res.json(obj);
  });

  app.listen(3000, '0.0.0.0', () => {
    console.log('🚀 Server listening on http://localhost:3000');
  });
}

start().catch(console.error);
