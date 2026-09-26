function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatTime(t) {
  if (!t) return '';
  const d = t instanceof Date ? t : new Date(t);
  if (isNaN(d.getTime())) return '';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function fmtNum(v) {
  const n = Math.round((v || 0) * 100) / 100;
  return String(n);
}

function fmtSigned(v) {
  const n = Math.round((v || 0) * 100) / 100;
  return (n > 0 ? '+' : '') + n;
}

module.exports = {
  formatTime,
  fmtNum,
  fmtSigned
};
