const state = require('../state');
const { getOpenPositions } = require('./exchange');

async function syncOpenPositions() {
  const exchanges = ['bitunix', 'bybit'];
  const currentlyOpenSymbols = new Set();

  // Temporarily collect trades before merging into state.openTrades
  const perSymbol = new Map();

  for (const ex of exchanges) {
    try {
      const positions = await getOpenPositions(ex);

      for (const p of positions) {
        const symbol = p.symbol;
        const isBuy = p.side.toUpperCase() === 'BUY';
        currentlyOpenSymbols.add(symbol);

        if (!perSymbol.has(symbol)) {
          perSymbol.set(symbol, {
            isOpen: true,
            qty: p.qty,
            timestamp: Date.now(),
            lastAction: Date.now(),
          });
        }

        const entry = perSymbol.get(symbol);

        if (isBuy) {
          entry.longExchange = ex;
          entry.longPrice = p.avgPrice;
        } else {
          entry.shortExchange = ex;
          entry.shortPrice = p.avgPrice;
        }
      }
    } catch (err) {
      console.error(`❌ Failed to sync positions from ${ex}:`, err.message);
    }
  }

  // Set merged entries into state.openTrades (Map)
  for (const [symbol, trade] of perSymbol) {
    state.openTrades.set(symbol, trade);
  }

  // Remove any symbol not currently open
  for (const [symbol] of state.openTrades) {
    if (!currentlyOpenSymbols.has(symbol)) {
      state.openTrades.delete(symbol);
    }
  }

  //console.log('✅ Synced open positions:', Array.from(state.openTrades.keys()));
}

module.exports = { syncOpenPositions };
