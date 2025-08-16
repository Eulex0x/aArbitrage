module.exports = {
  discordWebhook:'',
  telegramWebhook: '',
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
  spread: 0.1,
  coinsVolume: 1000000,
  confirmationCount: 2,
  cooldown: 5000,
  fee: 0.0,
  SymbolsPCunks: 100,
  debounceScandelay: 100,
};
