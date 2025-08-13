const fs = require('fs');
const path = require('path');
const state = require('../state');
const config = require('../config');
const { placeOrder, closeOrderBitunix } = require('./exchange');
const axios = require('axios');

const spreadCounters = new Map();
let scanTimeout = null;

const CHAT_IDS_FILE = path.join(__dirname, '..', 'chat_ids.json');


function reverseNormalizeSymbol(exchange, normalizedSymbol, symbolMap) {
  const map = symbolMap?.[exchange];
  if (!map) return normalizedSymbol;


  if (map.hasOwnProperty(normalizedSymbol)) {
    return map[normalizedSymbol];
  }

  return normalizedSymbol;
}


function getTradeUrl(exchange, symbol) {
  switch (exchange.toLowerCase()) {
    case 'bybit':
      return `https://www.bybit.com/en-US/trade/usdt/${symbol}`;
    case 'bitunix':
      return `https://www.bitunix.com/contract-trade/${symbol}`;
    case 'mexc':
      const mexcSymbol = symbol.includes('_') ? symbol : symbol.replace(/(USDT|USDC|BTC|ETH)/, '_$1');
      return `https://www.mexc.com/futures/${mexcSymbol}?type=linear_swap`;
    case 'binance':
      return `https://www.binance.com/en/futures/${symbol}`;
    case 'coinex':
      const coinexSymbol = symbol.includes('_') ? symbol : symbol.replace(/(USDT|USDC|BTC|ETH)/, '-$1');
      return `https://www.coinex.com/futures/${coinexSymbol.toLowerCase()}`;
    case 'gate':
      const gateSymbol = symbol.includes('_') ? symbol : symbol.replace(/(USDT|USDC|BTC|ETH)/, '-$1');
      return `https://www.gate.io/futures/USDT/${gateSymbol.toUpperCase()}`;
    default:
      return '';
  }
}

// Load chat IDs from file, return Set of numbers
function loadChatIds() {
  try {
    if (!fs.existsSync(CHAT_IDS_FILE)) return new Set();
    const data = fs.readFileSync(CHAT_IDS_FILE, 'utf8');
    const arr = JSON.parse(data);
    return new Set(arr);
  } catch (err) {
    console.error('❌ Failed to load chat IDs:', err.message);
    return new Set();
  }
}

// Save chat IDs (Set) to file
function saveChatIds(chatIds) {
  try {
    fs.writeFileSync(CHAT_IDS_FILE, JSON.stringify([...chatIds], null, 2));
  } catch (err) {
    console.error('❌ Failed to save chat IDs:', err.message);
  }
}

// Send Telegram message to all saved chat IDs
async function sendTelegramMessage(text) {
  const chatIds = loadChatIds();
  for (const chat_id of chatIds) {
    try {
      await axios.post(config.telegramWebhook, { chat_id, text , parse_mode: 'Markdown', disable_web_page_preview: true });
    } catch (err) {
      console.error(`❌ Telegram send message error to ${chat_id}:`, err.message);
    }
  }
}

function addChatId(newId) {
  const chatIds = loadChatIds();
  if (!chatIds.has(newId)) {
    chatIds.add(newId);
    saveChatIds(chatIds);
    console.log(`✅ Added new Telegram chat_id: ${newId}`);
  }
}

function getExchangePairs(enabled) {
  const pairs = [];
  for (let i = 0; i < enabled.length; i++) {
    for (let j = i + 1; j < enabled.length; j++) {
      pairs.push([enabled[i], enabled[j]]);
    }
  }
  return pairs;
}

function debounceScan() {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => scanForArbitrage(), config.debounceScandelay);
}

async function scanForArbitrage() {
  if (state.tradeInProgress) return;
  state.tradeInProgress = true;

  try {
    const openCount = Array.from(state.openTrades.values()).filter(t => t?.isOpen).length;
    if (openCount >= config.maxPositions) return;

    const pairs = getExchangePairs(config.enabledExchanges);

    for (const [symbol, data] of state.prices.entries()) {
      const now = Date.now();

      if (!state.openTrades.has(symbol)) {
        state.openTrades.set(symbol, { lastAction: 0 });
      }

      const trade = state.openTrades.get(symbol);
      const cooldownPassed = now - (trade.lastAction || 0) >= config.cooldown;
      if (!cooldownPassed) continue;

      if (!data.opportunity) {
        data.opportunity = {
          lifetimeStart: 0,
          lastSeen: 0,
          spreadCounter: 0,
          confirmed: false,
        };
      }

      for (const [ex1, ex2] of pairs) {
        const p1 = data.exchanges?.[ex1];
        const p2 = data.exchanges?.[ex2];
        if (typeof p1 !== 'number' || typeof p2 !== 'number') continue;

        const rawSpread = Math.abs((p2 - p1) / ((p2 + p1) / 2)) * 100;
        const spread = Math.max(0, rawSpread - config.fee);

        const isAboveThreshold = spread >= config.spread;
        const [longEx, shortEx, longP, shortP] = p1 < p2
          ? [ex1, ex2, p1, p2]
          : [ex2, ex1, p2, p1];

        const forbiddenExchanges = config.forbiddenExchanges;
        const lifetime = now - (data.opportunity.lifetimeStart || now);

        // Always record lifetime if spread is present
        if (spread > 0) {
          if (data.opportunity.lifetimeStart === 0) {
            data.opportunity.lifetimeStart = now;
          }
          data.opportunity.lastSeen = now;
        } else {
          // Reset only if spread disappeared completely
          if (lifetime > 10000) {
            data.opportunity.lifetimeStart = 0;
            data.opportunity.lastSeen = 0;
          }
        }

        // Skip actual trading if spread < threshold
        if (!isAboveThreshold) continue;

        data.opportunity.spreadCounter += 1;
        if (data.opportunity.spreadCounter < config.confirmationCount) continue;
        data.opportunity.confirmed = true;

        // Skip if trade already open or forbidden
        if (trade.isOpen || state.pendingTrades.has(symbol)) continue;
        if (forbiddenExchanges.includes(longEx) || forbiddenExchanges.includes(shortEx)) continue;

        //const lifetimeSec = Math.floor(lifetime / 1000);
        //if (lifetime < 5000) continue;

        sendTelegramMessage(
          `🚀 OPEN ${symbol}\n` +
          `Long on [${longEx} @ ${longP}](${getTradeUrl(longEx, symbol)})\n` +
          `Short on [${shortEx} @ ${shortP}](${getTradeUrl(shortEx, symbol)})\n` +
          `Spread: ${spread.toFixed(4)} %\n` +
          `🕒 Live: ${lifetimeSec} sec`
        );

        // 🔒 Respect maxPositions limit again before trading
        const updatedOpenCount = Array.from(state.openTrades.values()).filter(t => t?.isOpen).length;
        if (updatedOpenCount >= config.maxPositions) return;

        // await openTrade(symbol, longEx, shortEx, longP, shortP);
        return; // Stop loop after one trade
      }
    }
  } catch (err) {
    console.error('❌ scanForArbitrage error:', err);
  } finally {
    state.tradeInProgress = false;
  }
}


// Keep your openTrade and closeTrade unchanged, or update as needed

async function openTrade(symbol, longExchange, shortExchange, longPrice, shortPrice) {
  if (state.openTrades.get(symbol)?.isOpen || state.pendingTrades.has(symbol)) return;

  state.pendingTrades.add(symbol);
  const qty = config.qtyUSD / shortPrice;

  try {
    const longSymbol = reverseNormalizeSymbol(longExchange, symbol, config.symbolMap);
    const shortSymbol = reverseNormalizeSymbol(shortExchange, symbol, config.symbolMap);

    const shortResult = await placeOrder(shortExchange, 'Sell', shortSymbol, qty, shortPrice, 'MARKET');
    const longResult = await placeOrder(longExchange, 'Buy', longSymbol, qty, undefined, 'MARKET');

    const spreadText = ((Math.abs(shortPrice - longPrice) / ((shortPrice + longPrice) / 2)) * 100).toFixed(4);
    const msg = `[${new Date().toLocaleTimeString()}] 🚀 OPEN ${symbol} | SELL ${shortExchange} @ ${shortPrice.toFixed(6)} → BUY ${longExchange} @ ${longPrice.toFixed(6)} | Spread: ${spreadText}% | Qty: ${qty.toFixed(4)}`;
    console.log(msg);

    state.openTrades.set(symbol, {
      isOpen: true,
      longExchange,
      shortExchange,
      longPrice,
      shortPrice,
      qty,
      timestamp: Date.now(),
      lastAction: Date.now(),
      positionId: longResult.orderId || shortResult.orderId || 1
    });

  } catch (err) {
    console.error('❌ Open trade failed:', err.message);
  } finally {
    state.pendingTrades.delete(symbol);
  }
}

async function closeTrade(symbol) {
  const trade = state.openTrades.get(symbol);
  if (!trade || trade.closing || !trade.isOpen) return;

  const longPrice = state.prices.get(symbol)?.exchanges[trade.longExchange];
  const shortPrice = state.prices.get(symbol)?.exchanges[trade.shortExchange];

  if (!longPrice || !shortPrice || shortPrice <= longPrice) return;

  console.log(`✅ Closing ${symbol}: short ${shortPrice} > long ${longPrice}`);
  trade.closing = true;

  try {
    if (trade.shortExchange === 'bitunix') {
      await closeOrderBitunix(symbol);
      await placeOrder(trade.longExchange, 'Sell', symbol, trade.qty);
    } else {
      await placeOrder(trade.shortExchange, 'Buy', symbol, trade.qty);
      await placeOrder(trade.longExchange, 'Sell', symbol, trade.qty);
    }
    state.openTrades.delete(symbol);
  } catch (err) {
    console.error(`❌ Close error for ${symbol}:`, err);
    trade.closing = false;
  }
}

module.exports = {
  scanForArbitrage,
  debounceScan,
  closeTrade,
  openTrade,
  addChatId,
};
