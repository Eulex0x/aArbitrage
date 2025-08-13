const WebSocket = require('ws');
const zlib = require('zlib');
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
  const socket = new WebSocket('wss://socket.coinex.com/v2/futures');

  socket.on('open', () => {
    console.log(`✅ [Coinex][${index}] WS connected with ${symbolsChunk.length} symbols`);

    const markets = symbolsChunk.map(sym => sym.toUpperCase());

    socket.send(JSON.stringify({
      method: "state.subscribe",
      params: { market_list: markets },
      id: Date.now()
    }));
  });

  socket.on('message', msg => {
    try {
      const decompressed = zlib.gunzipSync(msg).toString('utf-8');
      const response = JSON.parse(decompressed);
      const message = response.data;

      if (!message?.state_list || !Array.isArray(message.state_list)) return;

      for (const data of message.state_list) {
        if (!data.market || !data.last) continue;

        const symbol = data.market;
        const price = parseFloat(data.last);
        if (!Symbols.includes(symbol)) continue;

        const normalized = normalizeSymbol('binance', symbol, symbolMap);
        if (!normalized || !Symbols.includes(normalized)) return;
        let entry = state.prices.get(normalized) || { exchanges: {} };
        entry.exchanges.coinex = price;
        state.prices.set(normalized, entry);

        debounceScan();
      }
    } catch (err) {
      console.error(`❌ [Coinex][${index}] WS parse error:`, err.message);
    }
  });

  socket.on('error', err => {
    console.error(`❌ [Coinex][${index}] WS error:`, err.message);
  });

  socket.on('close', () => {
    console.warn(`🔌 [Coinex][${index}] WS closed. Reconnecting in 1s...`);
    setTimeout(() => connectWebSocketChunk(symbolsChunk, index), 1000);
  });
}

function connectCoinex() {
  const chunks = chunkArray(Symbols, SymbolsPCunks);
  console.log(`🔧 Splitting ${Symbols.length} Coinex symbols into ${chunks.length} WS connections`);
  chunks.forEach((chunk, index) => connectWebSocketChunk(chunk, index));
}

module.exports = { connectCoinex };
