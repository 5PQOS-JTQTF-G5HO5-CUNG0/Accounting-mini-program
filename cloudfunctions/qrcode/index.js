const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async event => {
  const scene = (event.scene || '').slice(0, 32);
  if (!scene) {
    return { errCode: 1, errMsg: 'scene required' };
  }
  try {
    const res = await cloud.openapi.wxacode.getUnlimited({
      scene: scene,
      page: 'pages/index/index',
      checkPath: false,
      width: 430
    });
    const safe = scene.replace(/[^A-Za-z0-9]/g, '');
    const upload = await cloud.uploadFile({
      cloudPath: 'qrcodes/' + safe + '_' + Date.now() + '.png',
      fileContent: res.buffer
    });
    return {
      errCode: 0,
      fileID: upload.fileID
    };
  } catch (e) {
    return {
      errCode: 2,
      errMsg: e.errMsg || String(e)
    };
  }
};
