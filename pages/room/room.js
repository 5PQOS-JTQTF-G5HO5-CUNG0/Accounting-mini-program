const db = wx.cloud.database();
const app = getApp();
const { fmtSigned } = require('../../utils/util');

Page({
  data: {
    room: null,
    isOwner: false,
    memberCount: 0,
    members: [],
    showQr: false,
    showMe: false,
    myName: '',
    myAvatar: '',
    myNetText: '0',
    payTarget: null,
    payFrom: null,
    payAmount: ''
  },

  onLoad(options) {
    this.code = options.code || '';
    this.openid = app.globalData.openid;
    if (!this.openid) {
      app.getOpenId().then(id => {
        this.openid = id;
        this.load();
      }).catch(() => this.load());
    } else {
      this.load();
    }
  },

  onUnload() {
    this.closeWatchers();
  },

  closeWatchers() {
    if (this.memberWatcher) {
      try { this.memberWatcher.close(); } catch (e) {}
      this.memberWatcher = null;
    }
    if (this.recordWatcher) {
      try { this.recordWatcher.close(); } catch (e) {}
      this.recordWatcher = null;
    }
  },

  onShow() {
    if (this.roomId) this.load();
  },

  async load() {
    try {
      const res = await db.collection('rooms')
        .where({ code: this.code })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      if (!res.data.length) {
        wx.showToast({ title: '房间不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1200);
        return;
      }
      const room = res.data[0];
      this.roomId = room._id;
      this.setData({
        room: room,
        isOwner: room.ownerOpenid === this.openid
      });
      this.closeWatchers();
      this.memberDocs = [];
      this.recordDocs = [];
      this.watchMembers();
      this.watchRecords();
    } catch (e) {
      wx.showToast({ title: '房间加载失败', icon: 'none' });
    }
  },

  watchMembers() {
    try {
      this.memberWatcher = db.collection('members').where({ roomId: this.roomId }).watch({
        onChange: snapshot => {
          if (snapshot && snapshot.docs) {
            this.memberDocs = snapshot.docs;
            this.applyData();
          }
        },
        onError: () => {}
      });
    } catch (e) {}
  },

  watchRecords() {
    try {
      this.recordWatcher = db.collection('records').where({ roomId: this.roomId }).watch({
        onChange: snapshot => {
          if (snapshot && snapshot.docs) {
            this.recordDocs = snapshot.docs;
            this.applyData();
          }
        },
        onError: () => this.fetchRecords()
      });
    } catch (e) {
      this.fetchRecords();
    }
  },

  async fetchRecords() {
    try {
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
      this.recordDocs = all;
      this.applyData();
    } catch (e) {}
  },

  applyData() {
    const nets = {};
    this.recordDocs.forEach(r => {
      if (r.toOpenid) {
        nets[r.toOpenid] = Math.round(((nets[r.toOpenid] || 0) + (r.delta || 0)) * 100) / 100;
      }
      if (r.fromOpenid) {
        nets[r.fromOpenid] = Math.round(((nets[r.fromOpenid] || 0) - (r.delta || 0)) * 100) / 100;
      }
    });
    const list = this.memberDocs.map(m => {
      const net = nets[m.openid] || 0;
      return {
        _id: m._id,
        openid: m.openid,
        nickname: m.nickname || '玩家',
        avatar: m.avatarFileID || '',
        net: net,
        netText: fmtSigned(net),
        isMe: m.openid === this.openid
      };
    });
    list.sort((a, b) => b.net - a.net);
    const me = list.find(x => x.isMe);
    this.meDoc = me || null;
    this.setData({
      members: list,
      memberCount: list.length,
      myName: me ? me.nickname : '玩家',
      myAvatar: me ? me.avatar : '',
      myNetText: me ? me.netText : '0'
    });
  },

  onAvatarTap(e) {
    const openid = e.currentTarget.dataset.openid;
    if (this.data.room.status !== 'ongoing') {
      wx.showToast({ title: '房间已结束', icon: 'none' });
      return;
    }
    if (openid === this.openid) {
      this.setData({ showMe: true });
      return;
    }
    const target = this.data.members.find(x => x.openid === openid);
    if (!target) return;
    this.setData({
      payTarget: target,
      payAmount: ''
    });
  },

  onPayInput(e) {
    this.setData({ payAmount: e.detail.value });
  },

  closePay() {
    this.setData({ payTarget: null, payAmount: '' });
  },

  closeMe() {
    this.setData({ showMe: false });
  },

  noop() {},

  async confirmPay() {
    const target = this.data.payTarget;
    if (!target) return;
    const amount = Math.round((parseFloat(this.data.payAmount) || 0) * 100) / 100;
    if (!(amount > 0)) {
      wx.showToast({ title: '请输入大于 0 的分数', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '记录中' });
    try {
      await db.collection('records').add({
        data: {
          roomId: this.roomId,
          fromOpenid: this.openid,
          fromName: this.data.myName,
          toOpenid: target.openid,
          toName: target.nickname,
          delta: amount,
          createdAt: db.serverDate()
        }
      });
      wx.hideLoading();
      this.closePay();
      wx.showToast({ title: '已给 ' + target.nickname + ' 加 ' + amount + ' 分', icon: 'none' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '记录失败', icon: 'none' });
    }
  },

  updateNickname() {
    wx.showModal({
      title: '更新昵称',
      editable: true,
      placeholderText: this.data.myName,
      success: res => {
        if (!res.confirm) return;
        const name = (res.content || '').trim();
        if (!name) {
          wx.showToast({ title: '昵称不能为空', icon: 'none' });
          return;
        }
        wx.showLoading({ title: '保存中' });
        const jobs = [];
        if (this.meDoc) {
          jobs.push(db.collection('members').doc(this.meDoc._id).update({ data: { nickname: name } }));
        }
        jobs.push(
          db.collection('users').where({ openid: this.openid }).limit(1).get().then(u => {
            if (u.data.length) {
              return db.collection('users').doc(u.data[0]._id).update({ data: { nickname: name } });
            }
            return null;
          })
        );
        Promise.all(jobs).then(() => {
          wx.hideLoading();
          wx.showToast({ title: '已更新', icon: 'success' });
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '更新失败', icon: 'none' });
        });
      }
    });
  },

  exitRoom() {
    if (this.data.isOwner) {
      wx.showToast({ title: '你是房主，请先结束房间再退出', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '退出房间',
      content: '退出后你在本房的积分保留，确定退出吗？',
      success: res => {
        if (!res.confirm) return;
        if (this.meDoc) {
          db.collection('members').doc(this.meDoc._id).remove().then(() => {
            wx.navigateBack();
          }).catch(() => {
            wx.showToast({ title: '退出失败', icon: 'none' });
          });
        } else {
          wx.navigateBack();
        }
      }
    });
  },

  showQr() {
    this.setData({ showQr: true });
  },

  hideQr() {
    this.setData({ showQr: false });
  },

  endRoom() {
    wx.showModal({
      title: '结束房间',
      content: '结束后不能再记分，确定要结算吗？',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中' });
        db.collection('rooms').doc(this.roomId).update({
          data: { status: 'ended', endedAt: db.serverDate() }
        }).then(() => {
          wx.hideLoading();
          this.load();
          wx.navigateTo({ url: '/pages/settle/settle?code=' + this.code });
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
      }
    });
  },

  viewSettle() {
    wx.navigateTo({ url: '/pages/settle/settle?code=' + this.code });
  },

  onShareAppMessage() {
    return {
      title: '房号 ' + this.code + '，点进来一起记账',
      path: '/pages/index/index?room=' + this.code
    };
  }
});
