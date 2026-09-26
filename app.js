App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云开发能力');
      return;
    }
    wx.cloud.init({
      traceUser: true
    });
  },

  globalData: {
    openid: null
  },

  getOpenId() {
    if (this.globalData.openid) {
      return Promise.resolve(this.globalData.openid);
    }
    return wx.cloud
      .callFunction({ name: 'login' })
      .then(res => {
        this.globalData.openid = res.result.openid;
        return res.result.openid;
      });
  }
});
