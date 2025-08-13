const WebSocket = require('ws');
const express = require('express');
const { fetchBitunixSymbols, fetchBybitSymbols } = require('./utils');

const CHUNK_SIZE = 300;
const prices = {};

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function connectWebSocket(exchange, symbolsChunk, index) {
  const url = exchange === 'bitunix'
    ? 'wss://fapi.bitunix.com/public/'
    : 'wss://stream.bybit.com/v5/public/linear';

  const socket = new WebSocket(url);

  socket.on('open', () => {
    console.log(`✅ [${exchange}] WS ${index + 1} connected`);

    const args = exchange === 'bitunix'
      ? symbolsChunk.map(sym => ({
          symbol: sym,
          ch: 'market_kline_1min'
        }))
      : symbolsChunk.map(sym => `tickers.${sym}`); // for Bybit

    const payload = exchange === 'bitunix'
      ? { op: 'subscribe', args }
      : { op: 'subscribe', args }; // same structure

    socket.send(JSON.stringify(payload));
  });

  socket.on('message', msg => {
    try {
      const data = JSON.parse(msg);

      if (exchange === 'bitunix') {
        if (data.data?.c && data.symbol) {
          prices[data.symbol] = {
            ...(prices[data.symbol] || {}),
            bitunix: parseFloat(data.data.c)
          };
        }
      }

      if (exchange === 'bybit') {
        if (data.topic?.startsWith('tickers.') && data.data?.symbol && data.data?.lastPrice) {
          const symbol = data.data.symbol.replace('_', '').replace('/USDT', ''); // clean
          prices[symbol] = {
            ...(prices[symbol] || {}),
            bybit: parseFloat(data.data.lastPrice)
          };
        }
      }
    } catch (err) {
      console.error(`❌ Parse error on ${exchange}:`, err.message);
    }
  });

  socket.on('error', err => {
    console.error(`❌ WS error on ${exchange} ${index + 1}:`, err.message);
  });

  socket.on('close', () => {
    console.log(`❌ ${exchange} WS ${index + 1} closed`);
    setTimeout(() => connectWebSocket(exchange, symbolsChunk, index), 5000);
  });
}

async function start() {
  const [bitunixSymbols, bybitSymbols] = await Promise.all([
    fetchBitunixSymbols(),
    fetchBybitSymbols(),
  ]);
  chunkArray(bitunixSymbols, CHUNK_SIZE).forEach((chunk, index) => {
    connectWebSocket('bitunix', chunk, index);
  });

  chunkArray(bybitSymbols, CHUNK_SIZE).forEach((chunk, index) => {
    connectWebSocket('bybit', chunk, index);
  });
}

start();

// Serve prices via HTTP
const app = express();
app.get('/prices', (req, res) => {
  res.json(prices);
});
app.listen(3000, () => console.log(`🌐 Price server: http://localhost:3000/prices`));
