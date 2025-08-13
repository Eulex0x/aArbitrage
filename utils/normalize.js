function normalizeSymbol(exchange, rawSymbol, symbolMap) {
  const upper = rawSymbol.toUpperCase();
  const normalizedKey = Object.keys(symbolMap?.[exchange] || {}).find(key =>
    symbolMap[exchange][key].toUpperCase() === upper
  );
  // Return normalized symbol or original symbol if not found
  return normalizedKey || upper;
}

module.exports = {
  normalizeSymbol
};