const WebSocket = require('ws');
const state = require('../../state');
const {Symbols, SymbolsPCunks, deadSymbolsPerExchange} = require('../../config');
const { debounceScan } = require('../../trade/arbitrage');


function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function connectWebSocketChunk(symbolsChunk, index) {
  const socket = new WebSocket('wss://fapi.bitunix.com/public/');

  socket.on('open', () => {
    console.log(`✅ [bitunix][${index}] WS connected with ${symbolsChunk.length} symbols`);
    const args = symbolsChunk.map(symbol => ({ symbol, ch: 'tickers' }));
    socket.send(JSON.stringify({ op: 'subscribe', args }));

    setInterval(() => {
      socket.send(JSON.stringify({ op: 'ping', ping: Date.now() }));
    }, 5000);
  });

  socket.on('message', msg => {
    try {
      const data = JSON.parse(msg);

      if (Array.isArray(data.data)) {
        for (const item of data.data) {
          const symbol = item.s;
          const lastPrice = parseFloat(item.la);
          if (!symbol || isNaN(lastPrice)) continue;
          if (deadSymbolsPerExchange.bitunix.includes(symbol)) continue;
          let entry = state.prices.get(symbol) || { exchanges: {} };
          entry.exchanges.bitunix = lastPrice;
          entry.VolumeB = parseFloat(item.q);
          state.prices.set(symbol, entry);
        }
        debounceScan();
      }
    } catch (err) {
      console.error(`❌ [bitunix][${index}] Failed to parse message:`, err.message);
    }
  });

  socket.on('error', err => {
    console.error(`❌ [bitunix][${index}] WS error:`, err.message);
  });

  socket.on('close', () => {
    console.warn(`⚠️ [bitunix][${index}] WS closed. Reconnecting...`);
    setTimeout(() => connectWebSocketChunk(symbolsChunk, index), 3000);
  });
}

function connectBitunix() {
  const chunks = chunkArray(Symbols, SymbolsPCunks);
  chunks.forEach((chunk, i) => connectWebSocketChunk(chunk, i));
}

module.exports = {
  connectBitunix,
};
