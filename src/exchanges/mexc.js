const WebSocket = require('ws');
const state = require('../../state');
const { Symbols, SymbolsPCunks , symbolMap} = require('../../config');
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
  const socket = new WebSocket('wss://contract.mexc.com/edge');

  let pingInterval;

  socket.on('message', msg => {
    try {
      const data = JSON.parse(msg);

      if (data.channel === 'push.ticker' && data.data?.symbol && data.data?.lastPrice) {
        const rawSymbol = data.data.symbol; // e.g. btc_usdt
        const symbol = rawSymbol.replace(/_/g, '').toUpperCase(); // BTCUSDT

        if (!Symbols.includes(symbol)) return;
        const normalized = normalizeSymbol('mexc', symbol, symbolMap);
        if (!normalized || !Symbols.includes(normalized)) return;
        let entry = state.prices.get(normalized) || { exchanges: {} };
        entry.exchanges.mexc = parseFloat(data.data.lastPrice);

        state.prices.set(normalized, entry);
        debounceScan();
      }

      if (data.method === 'server.ping') {
        socket.send(JSON.stringify({ method: 'server.pong', params: [], id: Date.now() }));
      }
    } catch (err) {
      console.error(`❌ [mexc][${index}] WS parse error:`, err.message);
    }
  });

  socket.on('open', () => {
    console.log(`✅ [mexc][${index}] WS connected with ${symbolsChunk.length} symbols`);

    // Subscribe to each symbol individually
    for (const sym of symbolsChunk) {
      const pair = `${sym.slice(0, -4)}_USDT`.toUpperCase();

      socket.send(JSON.stringify({
        method: 'sub.ticker',
        param: { symbol: pair }
      }));
    }

    // Ping every 5 seconds
    pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ method: 'ping' }));
      }
    }, 5000);
  });

  socket.on('error', err => {
    console.error(`❌ [mexc][${index}] WS error:`, err.message);
  });

  socket.on('close', () => {
    console.warn(`🔌 [mexc][${index}] WS closed. Reconnecting in 1s...`);
    clearInterval(pingInterval);
    setTimeout(() => connectWebSocketChunk(symbolsChunk, index), 1000);
  });
}

function connectMexc() {
  const chunks = chunkArray(Symbols, SymbolsPCunks);
  console.log(`🔧 Splitting ${Symbols.length} MEXC symbols into ${chunks.length} WS connections`);

  chunks.forEach((chunk, index) => connectWebSocketChunk(chunk, index));
}

module.exports = { connectMexc };
