function computeNets(rounds) {
  const nets = {};
  rounds.forEach(r => {
    (r.scores || []).forEach(s => {
      if (!s.player) return;
      const v = Math.round((parseFloat(s.delta) || 0) * 100) / 100;
      nets[s.player] = Math.round(((nets[s.player] || 0) + v) * 100) / 100;
    });
  });
  return nets;
}

function minTransfers(nets) {
  const creditors = [];
  const debtors = [];
  Object.keys(nets).forEach(name => {
    const v = nets[name];
    if (v > 0.004) creditors.push({ name: name, amount: v });
    else if (v < -0.004) debtors.push({ name: name, amount: -v });
  });
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);
  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const c = creditors[i];
    const d = debtors[j];
    const pay = Math.min(c.amount, d.amount);
    const payRounded = Math.round(pay * 100) / 100;
    if (payRounded > 0) {
      transfers.push({ from: d.name, to: c.name, amount: payRounded });
    }
    c.amount -= pay;
    d.amount -= pay;
    if (c.amount < 0.004) i++;
    if (d.amount < 0.004) j++;
  }
  return transfers;
}

module.exports = {
  computeNets,
  minTransfers
};
