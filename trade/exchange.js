const OpenApiHttpFuturePrivate = require('../utils/OpenApiHttpFuturePrivate');
const config_Bitunix = require('../config.json');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const state = require('../state');
require('dotenv').config();

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

const bitunixClient = new OpenApiHttpFuturePrivate(config_Bitunix);

// Bybit Instruments and adjust qty
let bybitInstruments = {};

async function loadBybitInstruments() {
  try {
    const res = await axios.get('https://api.bybit.com/v5/market/instruments-info', {
      params: { category: 'linear' },
      httpsAgent,
    });
    for (const item of res.data.result.list) {
      bybitInstruments[item.symbol] = {
        qtyStep: parseFloat(item.lotSizeFilter.qtyStep),
        minQty: parseFloat(item.lotSizeFilter.minOrderQty)
      };
    }
    console.log(`✅ Loaded ${Object.keys(bybitInstruments).length} Bybit instruments`);
  } catch (err) {
    console.error('❌ Failed to load Bybit instruments:', err.response?.data || err.message);
  }
}

function adjustQtyForBybit(symbol, qty) {
  const inst = bybitInstruments[symbol];
  if (!inst) return qty >= 10 ? Math.floor(qty) : qty;

  if (qty >= 10) {
    return Math.floor(qty);
  } else {
    const steps = Math.floor(qty / inst.qtyStep);
    return +(steps * inst.qtyStep).toFixed(getDecimalPlaces(inst.qtyStep));
  }
}

function getDecimalPlaces(num) {
  const str = num.toString();
  if (str.indexOf('.') === -1) return 0;
  return str.split('.')[1].length || 0;
}

// ========== BYBIT SIGNING ==========
function signBybit(queryString, timestamp, secret) {
  return crypto.createHmac('sha256', secret)
    .update(`${timestamp}${process.env.BYBIT_API_KEY}5000${queryString}`)
    .digest('hex');
}

// ========== OPEN POSITIONS ==========
async function getBitunixOpenPositions() {
  try {
    const rawPositions = await bitunixClient.getCurrentPositions();
    return rawPositions
      .filter(p => parseFloat(p.qty) > 0)
      .map(p => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        side: p.side.toUpperCase(),
        avgPrice: parseFloat(p.avgOpenPrice),
        positionId: p.positionId,
        timestamp: Date.now(),
      }));
  } catch (err) {
    console.error('❌ Bitunix getOpenPositions error:', err.message);
    return [];
  }
}

async function getBybitOpenPositions() {
  const endpoint = 'https://api.bybit.com/v5/position/list';
  const category = 'linear';
  const settleCoin = 'USDT';
  const query = `category=${category}&settleCoin=${settleCoin}`;
  const timestamp = Date.now().toString();
  const signature = signBybit(query, timestamp, process.env.BYBIT_API_SECRET);

  try {
    const response = await axios.get(`${endpoint}?${query}`, {
      headers: {
        'X-BAPI-SIGN': signature,
        'X-BAPI-API-KEY': process.env.BYBIT_API_KEY,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': '5000',
      },
      httpsAgent,
    });

    return response.data.result.list
      .filter(p => parseFloat(p.size) > 0)
      .map(p => ({
        symbol: p.symbol,
        qty: parseFloat(p.size),
        side: p.side.toUpperCase(),
        avgPrice: parseFloat(p.avgPrice),
        positionId: p.positionId || `${p.symbol}_${p.side}`,
        timestamp: Date.now(),
      }));
  } catch (err) {
    console.error('❌ Bybit getOpenPositions error:', err.response?.data || err.message);
    return [];
  }
}

async function getOpenPositions(exchange) {
  if (exchange === 'bitunix') return getBitunixOpenPositions();
  if (exchange === 'bybit') return getBybitOpenPositions();
  return [];
}

// ========== PLACE ORDER ==========

async function placeBitunixOrder(side, symbol, qty, price = undefined, orderType = 'MARKET') {
  try {
    const payload = {
      symbol,
      side: side.toUpperCase(),
      qty: qty.toString(),
      tradeSide: 'OPEN',
      orderType: orderType.toUpperCase(),
      reduceOnly: false,
      effect: orderType === 'LIMIT' ? 'GTC' : 'IOC',
      clientId: `client_${Date.now()}`,
    };

    if (orderType === 'LIMIT' && price) {
      payload.price = price.toString();
    }
    const response = await bitunixClient.placeOrder(payload);
    return response;
  } catch (err) {
    console.error('[Bitunix] Place order error:', err.message);
    throw err;
  }
}

async function placeBybitOrder(side, symbol, qty, price = undefined, orderType = 'MARKET') {
  const endpoint = 'https://api.bybit.com/v5/order/create';
  const timestamp = Date.now().toString();

  const body = {
    category: 'linear',
    symbol,
    side,
    orderType: orderType.toUpperCase(),
    qty: qty.toString(),
    timeInForce: orderType === 'MARKET' ? 'IOC' : 'GTC',
    positionIdx: 0,
    reduceOnly: false,
    orderLinkId: `order_${Date.now()}`,
  };

  if (orderType === 'LIMIT' && price) {
    body.price = price.toString();
  }

  const queryString = JSON.stringify(body);
  const signature = signBybit(queryString, timestamp, process.env.BYBIT_API_SECRET);

  try {
    const response = await axios.post(endpoint, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-BAPI-API-KEY': process.env.BYBIT_API_KEY,
        'X-BAPI-SIGN': signature,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': '5000',
      },
      httpsAgent,
    });
    return response.data.result;
  } catch (err) {
    console.error('[Bybit] Place order error:', err.response?.data || err.message);
    throw err;
  }
}

async function placeOrder(exchange, side, symbol, qty, price, orderType = 'MARKET') {
  let adjustedQty = qty;

  if (exchange === 'bybit') {
    adjustedQty = adjustQtyForBybit(symbol, qty);
    if (adjustedQty === 0) {
      console.log(`❌ [Bybit] Qty too small for ${symbol}`);
      return;
    }
    return placeBybitOrder(side, symbol, adjustedQty, price, orderType);
  }

  if (exchange === 'bitunix') {
    return placeBitunixOrder(side, symbol, qty, price, orderType);
  }

  throw new Error(`Unknown exchange: ${exchange}`);
}

// ========== CANCEL ORDER ==========

async function cancelBitunixOrder(symbol, orderId) {
  try {
    const orderList = [{ orderId }];
    const response = await bitunixClient.cancelOrders(symbol, orderList);
    return response;
  } catch (err) {
    console.error('[Bitunix] Cancel order error:', err.message);
    throw err;
  }
}

async function cancelBybitOrder(orderId, symbol) {
  const endpoint = 'https://api.bybit.com/v5/order/cancel';
  const timestamp = Date.now().toString();

  const body = {
    category: 'linear',
    symbol,
    orderId,
  };

  const queryString = JSON.stringify(body);
  const signature = signBybit(queryString, timestamp, process.env.BYBIT_API_SECRET);

  try {
    const response = await axios.post(endpoint, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-BAPI-API-KEY': process.env.BYBIT_API_KEY,
        'X-BAPI-SIGN': signature,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': '5000',
      },
      httpsAgent,
    });
    return response.data;
  } catch (err) {
    console.error('[Bybit] Cancel order error:', err.response?.data || err.message);
    throw err;
  }
}

async function cancelOrder(exchange, orderId, symbol) {
  if (exchange === 'bitunix') {
    if (!symbol) throw new Error('Bitunix cancelOrder requires symbol');
    return cancelBitunixOrder(symbol, orderId);
  }
  if (exchange === 'bybit') {
    if (!symbol) throw new Error('Bybit cancelOrder requires symbol');
    return cancelBybitOrder(orderId, symbol);
  }
  throw new Error(`Unknown exchange: ${exchange}`);
}

// ========== CLOSE BITUNIX ORDER ==========

async function closeOrderBitunix(symbol) {
  const url = 'https://fapi.bitunix.com/api/v1/futures/trade/flash_close_position';
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  // Make sure you have BITUNIX_API_KEY and BITUNIX_API_SECRET in env or config
  const BITUNIX_API_KEY = process.env.BITUNIX_API_KEY;
  const BITUNIX_API_SECRET = process.env.BITUNIX_API_SECRET;

  const payloadObj = {
    positionId: state.openTrades.get(symbol)?.positionId
  };
  const body = JSON.stringify(payloadObj);
  const sign = generateBitunixSignature(nonce, timestamp, BITUNIX_API_KEY, {}, body, BITUNIX_API_SECRET);

  try {;
    const response = await axios.post(url, payloadObj, {
      headers: {
        'api-key': BITUNIX_API_KEY,
        'sign': sign,
        'nonce': nonce,
        'timestamp': timestamp,
        'language': 'en-US',
        'Content-Type': 'application/json'
      },
      httpsAgent,
    });
    return response.data;
  } catch (err) {
    console.error('[Bitunix] Close order error:', err.response?.data || err.message);
    throw err;
  }
}

// NOTE: You need to implement your generateBitunixSignature function elsewhere
// Example signature function depends on Bitunix API docs for signature format

module.exports = {
  getOpenPositions: async (exchange) => {
    if (exchange === 'bitunix') return getBitunixOpenPositions();
    if (exchange === 'bybit') return getBybitOpenPositions();
    return [];
  },
  placeOrder,
  cancelOrder,
  closeOrderBitunix,
  loadBybitInstruments,
  adjustQtyForBybit,
};
