const WebSocket = require('ws');
const state = require('../../state');
const { Symbols, SymbolsPCunks , symbolMap } = require('../../config');
const { debounceScan } = require('../../trade/arbitrage');
const { normalizeSymbol } = require('../../utils/normalize');

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function connectWebSocketChunk(symbolsChunk, index) {
  const socket = new WebSocket('wss://fstream.binance.com/stream');

  let pingInterval;

  socket.on('open', () => {
    console.log(`✅ [binance][${index}] WS connected with ${symbolsChunk.length} symbols`);

    // Subscribe to each symbol's aggTrade stream individually
    const paramss =[]
    for (const sym of symbolsChunk) {
      paramss.push(`${sym.toLowerCase()}@aggTrade`);
    }

    socket.send(JSON.stringify({
      method: 'SUBSCRIBE',
      params: paramss,
      id: Date.now()
    }));

  });

  socket.on('message', msg => {
    try {
      const message = JSON.parse(msg);
      if (!message.data || !message.data.e) return;
      const data = message.data;
      if (data.e === 'aggTrade' && data.s && data.p) {
        const rawSymbol = data.s; 
        const price = parseFloat(data.p);
        if (!Symbols.includes(rawSymbol)) return;
        const normalized = normalizeSymbol('binance', rawSymbol, symbolMap);
        if (!normalized || !Symbols.includes(normalized)) return;
        let entry = state.prices.get(normalized) || { exchanges: {} };
        entry.exchanges.binance = price;
        state.prices.set(normalized, entry);

        debounceScan();
      }

      if (data.method === 'PING') {
        socket.send(JSON.stringify({ method: 'PONG', id: Date.now() }));
      }
    } catch (err) {
      console.error(`❌ [binance][${index}] WS parse error:`, err.message);
    }
  });

  socket.on('error', err => {
    console.error(`❌ [binance][${index}] WS error:`, err.message);
  });

  socket.on('close', () => {
    console.warn(`🔌 [binance][${index}] WS closed. Reconnecting in 1s...`);
    clearInterval(pingInterval);
    setTimeout(() => connectWebSocketChunk(symbolsChunk, index), 1000);
  });
}

function connectBinance() {
  const chunks = chunkArray(Symbols, SymbolsPCunks);
  console.log(`🔧 Splitting ${Symbols.length} Binance symbols into ${chunks.length} WS connections`);

  chunks.forEach((chunk, index) => connectWebSocketChunk(chunk, index));
}

module.exports = { connectBinance };
