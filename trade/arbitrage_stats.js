const fs = require('fs');
const path = require('path');
const csvFile = path.join(__dirname, 'arbitrage.csv');

function parseLine(line) {
  const parts = line.split(',');
  if (parts.length < 8) return null;
  return {
    timestamp: new Date(parts[0]),
    symbol: parts[1],
    shortExchange: parts[2],
    shortPrice: parseFloat(parts[3]),
    longExchange: parts[4],
    longPrice: parseFloat(parts[5]),
    spread: parseFloat(parts[6]),
    time: parseFloat(parts[7])
  };
}

const timeWindows = [
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '4h', ms: 4 * 60 * 60 * 1000 },
  { label: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 }
];

function aggregateStats(rows, now) {
  const result = {};
  for (const { label, ms } of timeWindows) {
    const cutoff = new Date(now - ms);
    const filtered = rows.filter(r => r.timestamp >= cutoff);
    const bySymbol = {};
    for (const row of filtered) {
      if (!bySymbol[row.symbol]) {
        bySymbol[row.symbol] = {
          symbol: row.symbol,
          totalTime: 0,
          avgSpread: 0,
          maxSpread: 0,
          count: 0,
          weightedSpreadTime: 0
        };
      }
      const s = bySymbol[row.symbol];
      s.totalTime += row.time;
      s.count += 1;
      s.avgSpread += row.spread;
      if (row.spread > s.maxSpread) s.maxSpread = row.spread;
      s.weightedSpreadTime += row.spread * row.time;
    }
    for (const sym in bySymbol) {
      if (bySymbol[sym].count > 0) {
        bySymbol[sym].avgSpread = bySymbol[sym].avgSpread / bySymbol[sym].count;
      }
    }
    result[label] = Object.values(bySymbol);
  }
  return result;
}

function getStats() {
  const lines = fs.readFileSync(csvFile, 'utf8').split('\n').filter(Boolean);
  const dataLines = lines[0].startsWith('Timestamp') ? lines.slice(1) : lines;
  const rows = dataLines.map(parseLine).filter(Boolean);
  const now = Date.now();
  return aggregateStats(rows, now);
}

module.exports = { getStats };