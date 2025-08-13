const {
  Symbols,
  includedSymbols,
  coinsVolume,
  deadSymbolsPerExchange,
  symbolMap
} = require('./config');
const axios = require('axios');

async function fetchSymbols() {
  try {
    // Fetch all data
    const resBitunix = await axios.get('https://fapi.bitunix.com/api/v1/futures/market/tickers');
    const resBybit = await axios.get('https://api.bybit.com/v5/market/tickers', {
      params: { category: 'linear' }
    });
    const resMexc = await axios.get('https://contract.mexc.com/api/v1/contract/ticker');
    const resGate = await axios.get('https://api.gateio.ws/api/v4/futures/usdt/contracts');

    // Helper to normalize and filter symbols for each exchange
    function processSymbols(rawSymbols, exchangeName) {
      const map = symbolMap[exchangeName];
      const dead = deadSymbolsPerExchange[exchangeName] || [];
      return rawSymbols
        .map(sym => sym.replace('_', '').toUpperCase())
        .map(sym => map[sym] || sym) // normalize symbol if mapping exists
        .filter(sym => !dead.includes(sym))
    }

    // BYBIT
    let symbols_bybit = resBybit.data.result.list
      .filter(t => parseFloat(t.turnover24h) >= coinsVolume)
      .map(t => t.symbol);
    symbols_bybit = processSymbols(symbols_bybit, 'bybit');

    // BITUNIX
    let symbols_bitunix = resBitunix.data.data
      .filter(t => parseFloat(t.quoteVol) >= coinsVolume)
      .map(t => t.symbol);
    symbols_bitunix = processSymbols(symbols_bitunix, 'bitunix');

    // MEXC
    let symbols_mexc = resMexc.data.data
      .filter(t => parseFloat(t.volume24) >= coinsVolume)
      .map(t => t.symbol);
    symbols_mexc = processSymbols(symbols_mexc, 'mexc');
    // GATE
    let symbols_gate = resGate.data
      .filter(t => t.status === 'trading')
      .filter(t => parseFloat(t.trade_size) >= coinsVolume)
      .map(t => t.name);
    symbols_gate = processSymbols(symbols_gate, 'gate');

    // Count how many exchanges each symbol appears on
    const symbolCounts = {};
    const allSymbols = [...symbols_bybit, ...symbols_bitunix, ...symbols_mexc, ...symbols_gate];
    for (const sym of allSymbols) {
      symbolCounts[sym] = (symbolCounts[sym] || 0) + 1;
    }

    // Keep symbols that appear on at least 2 exchanges (adjust threshold here if needed)
    let symbols = Object.entries(symbolCounts)
      .filter(([_, count]) => count >= 2)
      .map(([symbol]) => symbol);

    // Inclusion/exclusion filters globally
    if (includedSymbols.length > 0) {
      symbols = symbols.filter(symbol => includedSymbols.includes(symbol));
    }

    // Update global Symbols array
    for (const sym of symbols) {
      if (!Symbols.includes(sym)) {
        Symbols.push(sym);
      }
    }

    // Refresh every 5 minutes
    setTimeout(fetchSymbols, 300000);

  } catch (err) {
    console.error('❌ fetchSymbols error:', err.message);
  }
}

module.exports = { fetchSymbols };
