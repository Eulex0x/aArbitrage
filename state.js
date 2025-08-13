module.exports = {
  prices: new Map(),        // key: symbol string, value: { exchanges: { bybit, bitunix }, VolumeBybit, VolumeB }
  openTrades: new Map(),    // key: symbol string, value: trade info
  pendingTrades: new Set(), // symbols pending trade to avoid duplicates
  tradeInProgress: false
};
