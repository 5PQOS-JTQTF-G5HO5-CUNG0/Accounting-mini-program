const db = wx.cloud.database();
const { fmtSigned } = require('../../utils/util');

Page({
  data: {
    list: [],
    hasData: false
  },

  onShow() {
    this.load();
  },

  async fetchAll(collection) {
    const all = [];
    while (true) {
      const res = await db.collection(collection).skip(all.length).limit(20).get();
      all.push.apply(all, res.data);
      if (res.data.length < 20 || all.length >= 500) break;
    }
    return all;
  },

  async load() {
    try {
      const records = await this.fetchAll('records');
      const map = {};
      const touch = openid => {
        if (!openid) return null;
        if (!map[openid]) {
          map[openid] = {
            name: '玩家',
            gameIds: {},
            paid: 0,
            recv: 0,
            net: 0,
            maxWin: 0,
            maxLoss: 0
          };
        }
        return map[openid];
      };
      records.forEach(r => {
        const delta = r.delta || 0;
        const to = touch(r.toOpenid);
        if (to) {
          to.name = r.toName || to.name;
          to.gameIds[r.roomId] = true;
          to.recv++;
          to.net = Math.round((to.net + delta) * 100) / 100;
          if (delta > to.maxWin) to.maxWin = delta;
        }
        const from = touch(r.fromOpenid);
        if (from) {
          from.name = r.fromName || from.name;
          from.gameIds[r.roomId] = true;
          from.paid++;
          from.net = Math.round((from.net - delta) * 100) / 100;
          if (-delta < from.maxLoss) from.maxLoss = -delta;
        }
      });
      const list = Object.keys(map).map(k => {
        const o = map[k];
        return {
          name: o.name,
          net: o.net,
          netText: fmtSigned(o.net),
          gameCount: Object.keys(o.gameIds).length,
          roundCount: o.recv + o.paid,
          winRate: o.recv + o.paid ? Math.round((o.recv / (o.recv + o.paid)) * 100) : 0,
          maxWinText: String(o.maxWin),
          maxLossText: String(o.maxLoss)
        };
      }).sort((a, b) => b.net - a.net);
      this.setData({ list: list, hasData: list.length > 0 });
    } catch (e) {
      wx.showToast({ title: '战绩加载失败', icon: 'none' });
    }
  }
});
