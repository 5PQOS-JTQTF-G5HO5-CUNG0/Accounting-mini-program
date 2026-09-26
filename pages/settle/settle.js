const db = wx.cloud.database();
const { minTransfers } = require('../../utils/settle');
const { fmtNum, fmtSigned } = require('../../utils/util');

Page({
  data: {
    room: null,
    results: [],
    transfers: [],
    hasDebt: false,
    allZero: false
  },

  onLoad(options) {
    this.code = options.code || '';
    this.load();
  },

  async fetchRecords() {
    const all = [];
    while (true) {
      const res = await db.collection('records')
        .where({ roomId: this.roomId })
        .skip(all.length)
        .limit(20)
        .get();
      all.push.apply(all, res.data);
      if (res.data.length < 20) break;
    }
    return all;
  },

  async load() {
    wx.showLoading({ title: '计算中' });
    try {
      const res = await db.collection('rooms')
        .where({ code: this.code })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      if (!res.data.length) throw new Error('no room');
      const room = res.data[0];
      this.roomId = room._id;

      const nets = {};
      const nameOf = {};
      try {
        const members = await db.collection('members').where({ roomId: this.roomId }).limit(20).get();
        members.data.forEach(m => {
          nets[m.openid] = nets[m.openid] || 0;
          nameOf[m.openid] = m.nickname || nameOf[m.openid] || '玩家';
        });
      } catch (e2) {}

      const records = await this.fetchRecords();
      records.forEach(r => {
        if (r.toOpenid) {
          nets[r.toOpenid] = Math.round(((nets[r.toOpenid] || 0) + (r.delta || 0)) * 100) / 100;
          nameOf[r.toOpenid] = r.toName || nameOf[r.toOpenid] || '玩家';
        }
        if (r.fromOpenid) {
          nets[r.fromOpenid] = Math.round(((nets[r.fromOpenid] || 0) - (r.delta || 0)) * 100) / 100;
          nameOf[r.fromOpenid] = r.fromName || nameOf[r.fromOpenid] || '玩家';
        }
      });

      const results = Object.keys(nets)
        .map(k => ({ openid: k, name: nameOf[k] || '玩家', net: nets[k] }))
        .sort((a, b) => b.net - a.net);
      results.forEach(r => {
        r.netText = fmtSigned(r.net);
      });
      const transfers = minTransfers(nets).map(t => ({
        from: nameOf[t.from] || '玩家',
        to: nameOf[t.to] || '玩家',
        amountText: fmtNum(t.amount)
      }));
      wx.hideLoading();
      this.setData({
        room: room,
        results: results,
        transfers: transfers,
        hasDebt: transfers.length > 0,
        allZero: results.every(r => Math.abs(r.net) < 0.005)
      });
    } catch (e) {
      wx.hideLoading();
      console.error('settle error', e);
      wx.showModal({
        title: '结算加载失败',
        content: (e && (e.errMsg || e.message)) || '未知错误，请重试',
        showCancel: false
      });
    }
  },

  backHome() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
