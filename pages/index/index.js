const db = wx.cloud.database();
const app = getApp();
const { fmtSigned } = require('../../utils/util');

const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function genCode() {
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

Page({
  data: {
    profileReady: false,
    profileDirty: false,
    nickname: '',
    avatarUrl: '',
    rank: '-',
    totalNetText: '0',
    winRate: '-',
    winCount: 0,
    loseCount: 0,
    joinCode: ''
  },

  onLoad(options) {
    this.pendingCode = this.parseEntry(options);
    this.inited = false;
  },

  onShow() {
    if (this.inited) {
      this.refreshStats();
    } else {
      this.init();
    }
  },

  parseEntry(options) {
    if (!options) return '';
    let code = options.room || '';
    if (!code && options.scene) {
      const scene = decodeURIComponent(options.scene);
      const m = scene.match(/C=([A-Za-z0-9]+)/i);
      code = m ? m[1] : '';
    }
    return (code || '').toUpperCase();
  },

  async init() {
    try {
      const openid = await app.getOpenId();
      this.openid = openid;
      this.inited = true;
      await this.loadProfile();
      await this.refreshStats();
      if (this.pendingCode) {
        const code = this.pendingCode;
        this.pendingCode = '';
        this.enterRoom(code);
      }
    } catch (e) {
      wx.showToast({
        title: '云函数 login 未部署，请按 README 部署云函数',
        icon: 'none',
        duration: 3000
      });
    }
  },

  async loadProfile() {
    const res = await db.collection('users').where({ openid: this.openid }).limit(1).get();
    if (res.data.length) {
      const u = res.data[0];
      this.userId = u._id;
      this.setData({
        profileReady: true,
        nickname: u.nickname || '',
        avatarUrl: u.avatarFileID || ''
      });
    }
  },

  onChooseAvatar(e) {
    const temp = e.detail.avatarUrl;
    wx.cloud.uploadFile({
      cloudPath: 'avatars/' + this.openid + '_' + Date.now() + '.png',
      filePath: temp,
      success: up => {
        this.setData({ avatarUrl: up.fileID, profileDirty: true });
      },
      fail: () => {
        this.setData({ avatarUrl: temp, profileDirty: true });
      }
    });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value, profileDirty: true });
  },

  async saveProfile() {
    const nickname = (this.data.nickname || '').trim();
    if (!nickname) {
      wx.showToast({ title: '请先填写昵称', icon: 'none' });
      return;
    }
    const avatar = this.data.avatarUrl || '';
    try {
      if (this.userId) {
        await db.collection('users').doc(this.userId).update({
          data: { nickname: nickname, avatarFileID: avatar }
        });
      } else {
        const add = await db.collection('users').add({
          data: { openid: this.openid, nickname: nickname, avatarFileID: avatar, createdAt: db.serverDate() }
        });
        this.userId = add._id;
      }
      this.setData({ profileReady: true, profileDirty: false, nickname: nickname });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  async refreshStats() {
    if (!this.openid) return;
    try {
      const records = await this.fetchAll('records');
      const agg = {};
      records.forEach(r => {
        const delta = r.delta || 0;
        if (r.toOpenid) {
          let o = agg[r.toOpenid];
          if (!o) o = agg[r.toOpenid] = { net: 0, wins: 0, loses: 0 };
          o.net = Math.round((o.net + delta) * 100) / 100;
          o.wins++;
        }
        if (r.fromOpenid) {
          let o = agg[r.fromOpenid];
          if (!o) o = agg[r.fromOpenid] = { net: 0, wins: 0, loses: 0 };
          o.net = Math.round((o.net - delta) * 100) / 100;
          o.loses++;
        }
      });
      const list = Object.keys(agg)
        .map(k => ({ openid: k, net: agg[k].net }))
        .sort((a, b) => b.net - a.net);
      const mine = agg[this.openid];
      const idx = list.findIndex(x => x.openid === this.openid);
      this.setData({
        rank: idx >= 0 ? idx + 1 : '-',
        totalNetText: mine ? fmtSigned(mine.net) : '0',
        winRate: mine && mine.wins + mine.loses > 0
          ? Math.round((mine.wins / (mine.wins + mine.loses)) * 100) + '%'
          : '-',
        winCount: mine ? mine.wins : 0,
        loseCount: mine ? mine.loses : 0
      });
    } catch (e) {}
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

  onCodeInput(e) {
    this.setData({ joinCode: e.detail.value.toUpperCase() });
  },

  async createRoom() {
    if (!this.checkProfile()) return;
    wx.showLoading({ title: '开房中' });
    try {
      let code = '';
      for (let i = 0; i < 10; i++) {
        const cand = genCode();
        const dup = await db.collection('rooms').where({ code: cand, status: 'ongoing' }).count();
        if (dup.total === 0) {
          code = cand;
          break;
        }
      }
      if (!code) throw new Error('no code');
      const add = await db.collection('rooms').add({
        data: {
          code: code,
          ownerOpenid: this.openid,
          status: 'ongoing',
          qrFileID: '',
          createdAt: db.serverDate()
        }
      });
      await db.collection('members').add({
        data: {
          roomId: add._id,
          openid: this.openid,
          nickname: this.data.nickname,
          avatarFileID: this.data.avatarUrl || '',
          joinedAt: db.serverDate()
        }
      });
      try {
        const qr = await wx.cloud.callFunction({ name: 'qrcode', data: { scene: 'C=' + code } });
        if (qr.result && qr.result.fileID) {
          await db.collection('rooms').doc(add._id).update({ data: { qrFileID: qr.result.fileID } });
        }
      } catch (e2) {}
      wx.hideLoading();
      wx.navigateTo({ url: '/pages/room/room?code=' + code });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '开房失败，请检查云函数', icon: 'none' });
    }
  },

  scanJoin() {
    if (!this.checkProfile()) return;
    wx.scanCode({
      onlyFromCamera: false,
      success: res => {
        const code = this.parseScan(res) || this.parseEntry({ scene: res.path ? this.getSceneFromPath(res.path) : '' });
        if (code) {
          this.enterRoom(code);
        } else {
          wx.showToast({ title: '不是有效的房间码', icon: 'none' });
        }
      }
    });
  },

  getSceneFromPath(path) {
    const m = decodeURIComponent(path || '').match(/scene=([^&]+)/);
    return m ? m[1] : '';
  },

  parseScan(res) {
    const sources = [res.result, res.path];
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      if (!s) continue;
      let text = s;
      try {
        text = decodeURIComponent(s);
      } catch (e) {}
      const m = text.match(/C=([A-Za-z0-9]+)/i) || text.match(/room=([A-Za-z0-9]+)/i);
      if (m) return m[1].toUpperCase();
    }
    return '';
  },

  codeJoin() {
    const code = (this.data.joinCode || '').trim().toUpperCase();
    if (code.length < 4) {
      wx.showToast({ title: '请输入 4 位房号', icon: 'none' });
      return;
    }
    this.enterRoom(code);
  },

  checkProfile() {
    if (!this.data.profileReady) {
      wx.showToast({ title: '请先填写并保存头像昵称', icon: 'none' });
      return false;
    }
    return true;
  },

  async enterRoom(code) {
    if (!this.checkProfile()) return;
    wx.showLoading({ title: '进房中' });
    try {
      const res = await db.collection('rooms').where({ code: code, status: 'ongoing' }).limit(1).get();
      if (!res.data.length) {
        wx.hideLoading();
        wx.showToast({ title: '房间不存在或已结束', icon: 'none' });
        return;
      }
      const room = res.data[0];
      const my = await db.collection('members').where({ roomId: room._id, openid: this.openid }).count();
      if (my.total === 0) {
        await db.collection('members').add({
          data: {
            roomId: room._id,
            openid: this.openid,
            nickname: this.data.nickname,
            avatarFileID: this.data.avatarUrl || '',
            joinedAt: db.serverDate()
          }
        });
      }
      wx.hideLoading();
      wx.navigateTo({ url: '/pages/room/room?code=' + code });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '进房失败', icon: 'none' });
    }
  },

  goStats() {
    wx.switchTab({ url: '/pages/stats/stats' });
  },

  onShareAppMessage() {
    return {
      title: '聚会小本子，随手记一记',
      path: '/pages/index/index'
    };
  }
});
