// Parse "HH:MM" string or plain number to integer hour.
function parseHourField(val) {
  if (val == null) return null;
  if (typeof val === 'string' && val.includes(':')) return parseInt(val.split(':')[0], 10);
  return Number(val);
}

module.exports = { parseHourField };
