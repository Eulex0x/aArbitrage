# 📈 Arbitrage WebSocket Limit Bot

A simple efficient and fast Node.js-based **crypto arbitrage bot** that monitors multiple exchanges in real time via WebSocket and REST APIs, detects profitable spread opportunities, and (optionally) executes trades automatically.

## 🚀 Features

- **Real-time price tracking** across multiple exchanges
- **Spread detection** with configurable thresholds
- **Cooldowns & max open positions** to control trading risk
- **Confirmation counter** to reduce false triggers
- **Telegram notifications** for trade signals
- **Custom exchange trading URLs** for quick manual action
- Configurable **forbidden exchanges** to skip unwanted platforms
- Optional **automatic trade execution** (place long/short orders)

---

## 📂 Project Structure

```
aArbitrage/
├── Symbols.js
├── app.js
├── backup.js
├── chat_ids.json         # Saved Telegram chat IDs
├── config.js             # Main configuration
├── node_modules/
├── package.json
├── public/
├── src/
│   └── exchanges/        # Exchange-specific logic
├── state.js              # Runtime state storage
├── trade/                # Trade-related logic
└── utils/
    ├── config.json       # Exchange API keys (ignored in Git)
    ├── OpenApiHttpFuturePrivate.js
    ├── OpenApiHttpFuturePublic.js
    ├── errorCodes.js
    ├── normalize.js
    └── sign.js
```

---

## ⚙️ Configuration

All bot settings are controlled via `config.js` and `.env` (both should be **kept private** and are listed in `.gitignore`).

Example `config.js` options:
```js
module.exports = {
  enabledExchanges: ['bybit', 'bitunix', 'mexc'],
  spread: 0.5, // Minimum spread (%) to trigger
  fee: 0.1,    // Trading fee (%) to subtract from spread
  cooldown: 10000, // Minimum ms between trades for same symbol
  maxPositions: 3, // Max simultaneous open positions
  confirmationCount: 3, // Number of scans to confirm signal
  qtyUSD: 100, // USD value to trade per position
  debounceScandelay: 2000,
  forbiddenExchanges: [],
  symbolMap: {},
  telegramWebhook: 'https://api.telegram.org/bot<token>/sendMessage'
};
```

`.env` example:
```
BYBIT_API_KEY=yourkey
BYBIT_API_SECRET=yoursecret
BITUNIX_API_KEY=yourkey
BITUNIX_API_SECRET=yoursecret
MEXC_API_KEY=yourkey
MEXC_API_SECRET=yoursecret
```

---

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/eulex0x/aArbitrage.git
cd aArbitrage

# Install dependencies
npm install
```

---

## ▶️ Running the Bot

**Development mode**:
```bash
node app.js
```

**With live trading enabled**:
- Ensure your API keys are set in `.env` / `config.json`
- config.json will looks like this 
```
{
    "credentials": {
        "api_key": "BITUNIX_API_KEY",
        "secret_key": "BITUNIX_SECRET_KEY"
    },
    "websocket": {
        "public_uri": "wss://fapi.bitunix.com/public/",
        "private_uri": "wss://fapi.bitunix.com/private/",
        "reconnect_interval": 5
    },
    "http": {
        "uri_prefix": "https://fapi.bitunix.com"
    }
} #  
```
- Set `openTrade()` to be active in the code (remove test returns)

---

## 📡 Telegram Alerts

The bot can send **trade signals** directly to your Telegram.

1. Create a Telegram bot via [BotFather](https://t.me/botfather)
2. Get your bot token and set it in `config.js` → `telegramWebhook`
3. Start the bot and send `/start` to your bot to save your `chat_id`
4. You’ll now receive alerts like:
```
🚀 OPEN BTCUSDT
Long on Bybit @ 50000
Short on Bitunix @ 50250
Spread: 0.5 %
🕒 Live: 12 sec
```

---

## ⚠️ Disclaimer

> This software is for **educational and research purposes only**.  
> Use it at your own risk.  
> Crypto trading involves substantial risk of loss.

---

## 📜 License

MIT License
