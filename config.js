module.exports = {
  discordWebhook:'https://discord.com/api/webhooks/1394926228825440296/pb0p0-r-4XR216A1h1dShtxBT61xz9yGOhT6Q6Z-a1J8UcSJ1fiQf6HiunaOOJMugjRK',
  telegramWebhook: 'https://api.telegram.org/bot7569206785:AAGB_hMZsUm-Xv29ju5PnJWpuf7ZRYjPQNU/sendMessage',
    deadSymbolsPerExchange: {
    bitunix: ['RFCUSDT','MEMEFIUSDT','XEMUSDT', 'RADUSDT', 'SLPUSDT', 'BLZUSDT', 'XMRUSDT', 'ORBSUSDT', 'XVGUSDT', 'ZECUSDT', 'WAVESUSDT', 'DASHUSDT','STMXUSDT', 'DARKUSDT','BADGERUSDT','BALUSDT','PYRUSDT'],
    bybit: ['PYRUSDT'],
    mexc: [],
    gate: ['PYRUSDT']
  },
  enabledExchanges: ['bitunix','bybit', 'mexc','binance', 'coinex','gate'],
  forbiddenExchanges: ['mexc', 'binance','coinex','gate'],
  includedSymbols: [],
  symbolMap: {
    mexc: {
      'MEGATRUMPUSDT': 'TRUMPUSDT',
    },
    bitunix: {
    },
    bybit: {
      'PUMPFUNUSDT' : 'PUMPUSDT'
    },
    gate: {
      'PUMPFUNUSDT' : 'PUMPUSDT'
    },
    binance:{
      'PUMPFUNUSDT' : 'PUMPUSDT'
    }
  },
  Symbols: [],
  spreadThresholds: [0.1, 0.2, 0.3],
  qtyUSD: 100,
  maxPositions: 3,
  spread: 0.2,
  coinsVolume: 1000000,
  confirmationCount: 2,
  cooldown: 5000,
  fee: 0.1,
  SymbolsPCunks: 100,
  debounceScandelay: 100,
};
