const WebSocket = require('ws');
const state = require('../../state');
const { Symbols , SymbolsPCunks } = require('../../config');
const { debounceScan } = require('../../trade/arbitrage');
const { config } = require('dotenv');


function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function connectWebSocketChunk(symbolsChunk, index) {
  const socket = new WebSocket('wss://stream.bybit.com/v5/public/linear');

  socket.on('open', () => {
    console.log(`✅ [bybit][${index}] WS connected with ${symbolsChunk.length} symbols`);
    const args = symbolsChunk.map(sym => `tickers.${sym}`);
    socket.send(JSON.stringify({ op: 'subscribe', args }));
  });

  const pingInterval = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ op: 'ping', ping: Date.now() }));
    }
  }, 5000);

  socket.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      const symbol = data.data?.symbol;
      const lastPrice = parseFloat(data.data?.lastPrice);
      const bid = parseFloat(data.data?.bid1Price);
      const ask = parseFloat(data.data?.ask1Price);
      if (!symbol || isNaN(lastPrice)) return;

      let entry = state.prices.get(symbol) || { exchanges: {} };
      entry.bidBybit = bid;
      entry.askBybit = ask;
      entry.exchanges.bybit = lastPrice;

      if (data.data.turnover24h) {
        entry.VolumeBybit = parseFloat(data.data.turnover24h);
      }

      state.prices.set(symbol, entry);
      debounceScan();
    } catch (err) {
      console.error(`❌ [bybit][${index}] Parse error:`, err.message);
    }
  });

  socket.on('error', err => {
    console.error(`❌ [bybit][${index}] WS error:`, err.message);
  });

  socket.on('close', () => {
    console.warn(`🔌 [bybit][${index}] WS closed. Reconnecting...`);
    clearInterval(pingInterval);
    setTimeout(() => connectWebSocketChunk(symbolsChunk, index), 1000);
  });
}

function connectBybit() {
  const chunks = chunkArray(Symbols,SymbolsPCunks);
  console.log(`🔧 Splitting ${Symbols.length} Bybit symbols into ${chunks.length} WS connections`);

  chunks.forEach((chunk, index) => connectWebSocketChunk(chunk, index));
}

module.exports = {
  connectBybit
};
