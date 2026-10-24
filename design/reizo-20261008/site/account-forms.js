/* Local interaction only: no credentials, account writes or persistence. */
(() => {
  const $ = s => document.querySelector(s);
  const dialog = $('#account-action-dialog');
  const field = (label, html) => '<label>' + label + html + '</label>';
  const input = (name, placeholder, type = 'text') => '<input name="'+name+'" type="'+type+'" placeholder="'+placeholder+'" required maxlength="160">';
  const socialHosts = {X:['x.com','twitter.com'],GitHub:['github.com'],LinkedIn:['linkedin.com'],Instagram:['instagram.com'],YouTube:['youtube.com'],TikTok:['tiktok.com']};
  const socialDrafts = new Map();
  function renderSocials() {
    const list = $('#account-social-list'); list.textContent = '';
    socialDrafts.forEach((url, platform) => {
      const row = document.createElement('div'); row.className = 'ac-social-row';
      const copy = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = platform;
      const link = document.createElement('a'); link.href = url; link.textContent = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      const badge = document.createElement('small'); badge.textContent = '公开主页';
      copy.append(title, link, badge);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'ac-subtle'; remove.textContent = '移除'; remove.setAttribute('aria-label','移除 '+platform+' 主页链接');
      remove.addEventListener('click', () => { socialDrafts.delete(platform); renderSocials(); $('#account-social-status').textContent = '已移除链接。'; });
      row.append(copy, remove); list.append(row);
    });
    $('#account-social-empty').hidden = socialDrafts.size > 0;
    $('#overview-social-count').textContent = socialDrafts.size ? socialDrafts.size + ' 个社交链接' : '社交媒体链接在资料中管理';
  }
  const actions = {
    referrer: { title: '填写邀请人的邀请码', fields: field('邀请码','<input name="referrer" placeholder="活动开放后填写好友的邀请码" disabled>'), disabled: true, submit: '关联邀请人', note: '邀请服务与活动规则尚未上线，暂不提交或建立邀请关系。关联资格、可填写时间与修改规则将在活动开放前明确。', result: '邀请服务尚未接入，没有关联邀请人或发放奖励。' },
    wechat: { title: '使用微信登录', fields: '<p class="ac-form-intro">接入微信授权后，可通过微信验证身份，再回到当前账户页面。绑定其他登录方式前，需要先验证当前账户。</p>', disabled: true, submit: '继续微信授权', note: '微信登录服务尚未接入。目前不展示虚假的二维码，不读取微信资料，也不建立绑定。', result: '微信授权尚未接入，未登录或绑定账户。' },
    google: { title: '使用 Google 登录', fields: '<p class="ac-form-intro">接入 Google 授权后，选择账户并完成验证，再回到当前页面。接入后仅按授权范围同步昵称、头像等资料。</p>', disabled: true, submit: '继续 Google 授权', note: 'Google 登录服务尚未接入。不在本站收集 Google 密码，也不模拟登录或绑定成功。', result: 'Google 授权尚未接入，未登录或绑定账户。' },
    social: { title: '添加社交媒体链接', fields: field('平台','<select id="social-platform" name="platform">'+Object.keys(socialHosts).map(name=>'<option>'+name+'</option>').join('')+'</select>') + field('公开主页链接','<input id="social-url" name="url" type="url" placeholder="粘贴该平台的 HTTPS 主页地址" required maxlength="500" autocomplete="off">'), submit: '添加链接', note: '添加公开主页，用于个人资料展示；同一平台的新链接将替换旧链接。', result: '此链接仅用于本次预览，未同步账户。' },
    password: { title: '修改密码', fields: '<fieldset disabled class="ac-password-fields">' + field('当前密码','<input type="password" autocomplete="current-password" placeholder="输入当前密码">') + field('新密码','<input type="password" autocomplete="new-password" placeholder="输入新密码">') + field('确认新密码','<input type="password" autocomplete="new-password" placeholder="再次输入新密码">') + '</fieldset>', disabled: true, submit: '确认修改', note: '密码服务尚未接入，暂不接受密码输入。接入后需验证当前身份，并校验两次新密码是否一致。', result: '密码服务尚未接入，没有修改账户密码。' },
    key: { title: '创建 API 密钥', fields: field('密钥名称',input('name','例如：产品开发环境')) + field('使用环境','<select name="environment"><option>开发环境</option><option>生产环境</option></select>') + field('权限','<select name="scope"><option>模型调用</option><option>只读用量</option></select>') + field('有效期','<select name="expiry"><option>30 天</option><option>90 天</option><option>自定义到期时间（接入后配置）</option></select>'), result: '配置填写完整。密钥服务尚未接入，未创建任何真实密钥。' },
    invite: { title: '邀请团队成员', fields: field('成员邮箱',input('email','member@example.com','email')) + field('成员角色','<select name="role"><option>成员</option><option>管理员</option></select>'), result: '邀请信息填写完整。团队服务尚未接入，没有发送邀请。' },
    settlement: { title: '企业结算资料', fields: field('企业名称',input('company','企业完整名称')) + field('税务标识',input('tax','统一社会信用代码 / 税务识别号')) + field('对账邮箱',input('email','billing@example.com','email')), result: '资料字段已检查。结算服务尚未接入，没有提交或保存企业资料。' },
    invoice: { title: '申请开票', fields: '<p class="ac-form-intro">开票前需关联企业抬头和已结算订单。这里先查看申请流程。</p>' + field('结算订单',input('order','填写结算订单编号')) + field('接收邮箱',input('email','billing@example.com','email')), result: '填写检查完成。订单与开票服务尚未接入，没有提交发票申请。' }
  };
  document.querySelectorAll('[data-account-action]').forEach(button => button.addEventListener('click', () => {
    const demo = typeof window !== 'undefined' && window.ReizoAccountDemo;
    if (demo && demo.action(button.dataset.accountAction, button)) return;
    const item = actions[button.dataset.accountAction]; if (!item) return;
    dialog.dataset.action = button.dataset.accountAction;
    $('#account-action-title').textContent = button.dataset.connection === 'bind' ? '关联 ' + (button.dataset.accountAction === 'wechat' ? '微信' : 'Google') + ' 账户' : item.title;
    $('#account-action-note').textContent = item.note || '当前只检查填写内容，不向服务器提交，也不创建真实账户资产。';
    $('#account-action-submit').textContent = item.submit || '检查配置';
    $('#account-action-submit').disabled = !!item.disabled;
    $('#account-action-fields').innerHTML = item.fields;
    if (demo?.active && button.dataset.accountAction === 'password') {
      $('#account-action-fields').innerHTML = field('当前密码','<input id="demo-current-pass" type="password" autocomplete="off" required>') + field('新密码','<input id="demo-new-pass" type="password" minlength="8" autocomplete="off" required>') + field('确认新密码','<input id="demo-confirm-pass" type="password" minlength="8" autocomplete="off" required>');
      $('#account-action-submit').disabled = false;
      $('#account-action-note').textContent = '请输入当前密码，并设置至少 8 个字符的新密码。';
    }
    $('#account-action-status').textContent = '';
    dialog.showModal();
  }));
  $('#account-action-close').addEventListener('click', () => dialog.close());
  $('#account-action-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { $('#account-action-fields').textContent = ''; $('#account-action-status').textContent = ''; });
  $('#account-action-form').addEventListener('submit', event => {
    event.preventDefault(); const item = actions[dialog.dataset.action];
    if (!item) return;
    const demo = typeof window !== 'undefined' && window.ReizoAccountDemo;
    if (demo?.active && dialog.dataset.action === 'password') {
      if (!event.currentTarget.reportValidity()) return;
      $('#account-action-status').textContent = demo.changePassword($('#demo-current-pass').value, $('#demo-new-pass').value, $('#demo-confirm-pass').value);
      return;
    }
    if (item.disabled) { $('#account-action-status').textContent = item.result; return; }
    if (!event.currentTarget.reportValidity()) return;
    if (dialog.dataset.action === 'social') {
      try {
        const platform = $('#social-platform').value;
        const url = new URL($('#social-url').value.trim());
        if (url.protocol !== 'https:' || url.username || url.password || url.port || !socialHosts[platform]?.some(host => url.hostname === host || url.hostname.endsWith('.'+host))) throw Error('invalid');
        socialDrafts.set(platform, url.href); renderSocials(); dialog.close();
        $('#account-social-status').textContent = '已更新主页链接。';
      } catch { $('#account-action-status').textContent = '请填写所选平台的 HTTPS 主页地址，不能包含账户密码或其他网站链接。'; }
      return;
    }
    $('#account-action-status').textContent = item.result;
  });
  document.querySelectorAll('[data-empty-filter]').forEach(input => input.addEventListener('input', () => {
    if (typeof window !== 'undefined' && window.ReizoAccountDemo?.active) { window.ReizoAccountDemo.updateKeys(); return; }
    $('#' + input.dataset.emptyFilter).textContent = input.value.trim() ? '筛选条件已填写；连接账户后可查询匹配的密钥。' : '';
  }));
  document.querySelectorAll('[data-local-filter]').forEach(form => form.addEventListener('submit', event => {
    if (typeof window !== 'undefined' && window.ReizoAccountDemo?.active) { event.preventDefault(); window.ReizoAccountDemo.updateLogs(); return; }
    event.preventDefault(); form.closest('.ac-panel').querySelector('.ac-filter-status').textContent = '筛选条件已更新。日志服务尚未接入，暂不能查询实际记录。';
  }));
  $('#preferences-form').addEventListener('submit', event => {
    event.preventDefault(); document.body.classList.toggle('ac-compact', $('#account-density').value === 'compact');
    $('#preferences-status').textContent = '已应用设置。';
  });
  let taskStatus = '全部';
  const taskFilters = document.querySelectorAll('[data-task-filter]');
  const updateDashboard = () => {
    if (typeof window !== 'undefined' && window.ReizoAccountDemo?.active) { window.ReizoAccountDemo.updateDashboard(); return; }
    $('#dashboard-status').textContent = $('#dashboard-period').value + ' · ' + $('#dashboard-source').value + ' · ' + taskStatus + '任务。账户数据尚未连接，暂不能查询实际记录。';
  };
  taskFilters.forEach(button => button.addEventListener('click', () => {
    taskStatus = button.dataset.taskFilter;
    taskFilters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    updateDashboard();
  }));
  ['#dashboard-period','#dashboard-source'].forEach(selector => $(selector).addEventListener('change', updateDashboard));
  document.addEventListener('reizo:demo-logout', () => {
    taskStatus = '全部';
    socialDrafts.clear(); renderSocials(); $('#account-social-status').textContent = '';
    $('#preferences-form').reset(); document.body.classList.remove('ac-compact'); $('#preferences-status').textContent = '';
  });
})();
