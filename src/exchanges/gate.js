const WebSocket = require('ws');
const axios = require('axios');
const state = require('../../state');
const { Symbols, SymbolsPCunks, symbolMap } = require('../../config');
const { debounceScan } = require('../../trade/arbitrage');
const { normalizeSymbol } = require('../../utils/normalize');

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

async function getValidGateSpotSymbols() {
  try {
    const res = await axios.get('https://api.gateio.ws/api/v4/spot/currency_pairs');
    const validSymbols = res.data.map(pair => pair.id.replace('_', '').toUpperCase());
    return new Set(validSymbols); // faster lookup
  } catch (err) {
    console.error('❌ Failed to fetch Gate.io spot pairs:', err.message);
    return new Set();
  }
}

async function connectGate() {
  const validSpotSymbols = await getValidGateSpotSymbols();
  const filteredSymbols = Symbols.filter(sym => validSpotSymbols.has(sym));

  const chunks = chunkArray(filteredSymbols, SymbolsPCunks);
  console.log(`🔧 Using ${filteredSymbols.length}/${Symbols.length} valid spot symbols. Splitting into ${chunks.length} chunks.`);

  chunks.forEach((chunk, index) => connectWebSocketChunk(chunk, index));
}

function connectWebSocketChunk(symbolsChunk, index) {
  const socketSpot = new WebSocket('wss://api.gateio.ws/ws/v4/');
  const socketFutures = new WebSocket('wss://fx-ws.gateio.ws/v4/ws/usdt');

  let pingInterval;

  socketSpot.on('open', () => {
    const pairs = symbolsChunk.map(sym => `${sym.slice(0, -4)}_USDT`.toUpperCase());

    socketSpot.send(JSON.stringify({
      time: Date.now(),
      channel: 'spot.tickers',
      event: 'subscribe',
      payload: pairs
    }));

    pingInterval = setInterval(() => {
      if (socketSpot.readyState === WebSocket.OPEN) {
        socketSpot.send(JSON.stringify({ method: 'ping' }));
      }
    }, 5000);

    console.log(`✅ [Gate Spot][${index}] Connected with ${pairs.length} symbols`);
  });

  socketSpot.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      if(data.channel === 'spot.tickers' && data.event === 'update'){
        const { currency_pair, highest_bid, lowest_ask } = data.result;

        const rawSymbol = currency_pair;
        const bid = parseFloat(highest_bid);
        const ask = parseFloat(lowest_ask);

        const symbol = rawSymbol.replace(/_/g, '').toUpperCase();
        if (!Symbols.includes(symbol)) return;

        const normalized = normalizeSymbol('gate', symbol, symbolMap);
        if (!normalized) return;

        let entry = state.prices.get(normalized) || { exchanges: {} };
        entry.bidGate = bid;
        entry.askGate = ask;
        state.prices.set(normalized, entry);
      }
    } catch (err) {
      console.error(`❌ [Gate Spot][${index}] WS parse error:`, err.message);
    }
  });

  socketFutures.on('open', () => {
    const pairs = symbolsChunk.map(sym => `${sym.slice(0, -4)}_USDT`.toUpperCase());

    socketFutures.send(JSON.stringify({
      time: Date.now(),
      channel: 'futures.tickers',
      event: 'subscribe',
      payload: pairs
    }));

    pingInterval = setInterval(() => {
      if (socketFutures.readyState === WebSocket.OPEN) {
        socketFutures.send(JSON.stringify({ method: 'ping' }));
      }
    }, 5000);

    console.log(`✅ [Gate Futures][${index}] Connected with ${pairs.length} symbols`);
  });

  socketFutures.on('message', msg => {
    try {
      const message = JSON.parse(msg);
      if (Array.isArray(message?.result)) {
        for (const data of message.result) {
          const rawSymbol = data.contract;
          const fundingRate = data.funding_rate;

          if (!rawSymbol || !fundingRate || fundingRate === '0') continue;
          const symbol = rawSymbol.replace(/_/g, '').toUpperCase();
          if (!Symbols.includes(symbol)) continue;

          const normalized = normalizeSymbol('gate', symbol, symbolMap);
          if (!normalized) continue;

          let entry = state.prices.get(normalized) || { exchanges: {} };
          entry.exchanges.gate = parseFloat(data.mark_price);
          entry.Gate_funding_rate = parseFloat(fundingRate);
          state.prices.set(normalized, entry);

          debounceScan();
        }
      }
    } catch (err) {
      console.error(`❌ [Gate Futures][${index}] WS parse error:`, err.message);
    }
  });

  socketSpot.on('error', err => {
    console.error(`❌ [Gate Spot][${index}] WS error:`, err.message);
  });

  socketFutures.on('error', err => {
    console.error(`❌ [Gate Futures][${index}] WS error:`, err.message);
  });

  socketSpot.on('close', () => {
    console.warn(`🔌 [Gate Spot][${index}] closed. Reconnecting in 1s...`);
    clearInterval(pingInterval);
    setTimeout(() => connectWebSocketChunk(symbolsChunk, index), 1000);
  });

  socketFutures.on('close', () => {
    console.warn(`🔌 [Gate Futures][${index}] closed. Reconnecting in 1s...`);
    clearInterval(pingInterval);
    setTimeout(() => connectWebSocketChunk(symbolsChunk, index), 1000);
  });
}

module.exports = { connectGate };
