/* Fictional Jason account, explicitly requested for UI review. No backend calls.
   Fixtures are not real balances, credentials, customer records or reward policy. */
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const session = window.ReizoDemoSession;
  const snapshots = new Map();
  const number = value => value.toLocaleString('en-US');
  let password = 'Reizo2026!';
  let bound = {wechat:false, google:true};
  const tasks = [
    {name:'新品电商产品套图',status:'进行中',progress:72,model:'图像模型',credits:240,age:0,time:'今天 14:28'},
    {name:'上月财务经营分析',status:'进行中',progress:46,model:'REIZO 自动',credits:180,age:0,time:'今天 14:22'},
    {name:'社媒短视频脚本',status:'排队中',progress:0,model:'REIZO 自动',credits:0,age:0,time:'今天 14:20'},
    {name:'采购合同风险审查',status:'需处理',progress:35,model:'推理模型',credits:90,age:0,time:'今天 14:08'},
    {name:'38 份调研资料整理',status:'已完成',progress:100,model:'REIZO 自动',credits:320,age:0,time:'今天 13:46'},
    {name:'产品落地页文案',status:'已完成',progress:100,model:'文本模型',credits:110,age:0,time:'今天 12:10'},
    {name:'代码单元测试检查',status:'已完成',progress:100,model:'代码模型',credits:170,age:2,time:'2 天前'},
    {name:'行业趋势研究摘要',status:'已完成',progress:100,model:'REIZO 自动',credits:250,age:12,time:'12 天前'}
  ];
  const logs = [
    ['今天 14:28','demo_req_001','图像模型','成功','图像','4 张','240','12.4 s'],
    ['今天 14:22','demo_req_002','推理模型','处理中','文本与推理','12,480 Token','结算中','—'],
    ['今天 13:46','demo_req_003','文本模型','成功','文本与推理','28,600 Token','320','8.2 s'],
    ['今天 12:10','demo_req_004','代码模型','失败','文本与推理','0 Token','0','1.1 s']
  ];
  function replace(selector, html) {
    $$(selector).forEach(node => {
      if (!snapshots.has(node)) snapshots.set(node, node.innerHTML);
      node.innerHTML = html; // Only fixed, local fixtures and numbers; never user input.
    });
  }
  function rows(selector, data) {
    const body = $(selector);
    if (!body) return;
    if (!snapshots.has(body)) snapshots.set(body, body.innerHTML);
    body.replaceChildren();
    data.forEach(values => {
      const tr = document.createElement('tr');
      values.forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); });
      body.append(tr);
    });
    if (!data.length) {
      const tr = document.createElement('tr'),td=document.createElement('td');
      td.colSpan = body.closest('table').querySelectorAll('th').length;
      td.className = 'ac-demo-empty'; td.textContent = '没有符合筛选条件的记录'; tr.append(td); body.append(tr);
    }
  }
  function updateDashboard() {
    if (!session.active) return;
    const period = $('#dashboard-period').value;
    const range = period === '今天' ? 1 : period === '最近 7 天' ? 7 : 30;
    const source = $('#dashboard-source').value;
    const selected = $('[data-task-filter][aria-pressed="true"]')?.dataset.taskFilter || '全部';
    const scoped = tasks.filter(task => task.age < range);
    ['进行中','已完成','排队中','需处理'].forEach((status,index) => replace('#developer .ac-task-metrics article:nth-child('+(index+1)+') strong', String(scoped.filter(task=>task.status===status).length)));
    const filtered = scoped.filter(task => selected === '全部' || task.status === selected);
    rows('#developer tbody', filtered.map(task=>[task.name,task.status+(task.status==='进行中'?' · '+task.progress+'%':''),task.model,number(task.credits)+' Credits',task.time]));
    const factor = range === 1 ? 1 : range === 7 ? 5 : 18;
    const input = (source==='API'?48000:source==='工作台'?96000:144000)*factor;
    const output = (source==='API'?12000:source==='工作台'?24000:36000)*factor;
    [input+output,input,output].forEach((value,index)=>replace('.ac-token-summary>div:nth-child('+(index+1)+') strong',number(value)));
    const shape = source==='API'?[18,30,22,45,65,51,80,44]:[28,45,37,70,51,85,66,54];
    replace('.ac-chart-empty','<div class="ac-demo-bars" role="img" aria-label="Token 趋势，所选周期总量 '+number(input+output)+'"><div>'+shape.map(value=>'<i style="height:'+value+'%"></i>').join('')+'</div><p><span>'+(range===1?'00:00':range+' 天前')+'</span><span>'+(range===1?'24:00':'今天')+'</span></p></div>');
    $('#dashboard-status').textContent = period+' · '+source+' Token · '+selected+'工作台任务，共 '+filtered.length+' 项。';
  }
  function updateLogs() {
    if (!session.active) return;
    const form = $('#logs form');
    const query = form.querySelector('[name="request"]').value.trim().toLowerCase();
    const status = form.querySelector('[name="status"]').value;
    const model = form.querySelector('[name="model"]').value;
    const filtered = logs.filter(row=>(!query||row[1].includes(query)) && (status==='全部状态'||row[3]===status) && (model==='全部能力'||row[4]===model));
    rows('#logs tbody',filtered.map(row=>[row[0]+' / '+row[1],row[2],row[3],row[5],row[6],row[7]]));
    $('#logs .ac-filter-status').textContent = form.querySelector('[name="period"]').value+' · '+filtered.length+' 条记录。';
  }
  function updateKeys() {
    if (!session.active) return;
    const query = $('[data-empty-filter]').value.trim().toLowerCase();
    rows('#keys tbody','开发项目'.includes(query)||!query ? [['开发项目','•••• 7K2A','模型调用','30 天后','今天 14:28','已启用']] : []);
    $('#keys-empty').textContent = '';
  }
  function renderIdentity() {
    $$('.ac-connected-row').forEach((row,index) => {
      const provider=index===0?'wechat':'google';
      const small=row.querySelector('small'),button=row.querySelector('button');
      if(!snapshots.has(small))snapshots.set(small,small.innerHTML);
      if(!snapshots.has(button))snapshots.set(button,button.innerHTML);
      small.textContent=bound[provider] ? (provider==='google'?'jason@example.com · 已关联':'Jason · 已关联') : '未关联';
      button.textContent=bound[provider]?'解除关联':'关联账户';
    });
    replace('.ac-identity-summary p','<span>密码登录</span><span>'+(bound.google?'Google 已关联':'Google 未关联')+'</span>');
  }
  function render() {
    document.body.classList.toggle('ac-demo-active',session.active);
    $('#demo-logout').hidden=!session.active;
    if(!session.active) {
      snapshots.forEach((html,node)=>{node.innerHTML=html;}); snapshots.clear();
      $('#demo-login-error').textContent='';
      $('#demo-password').value='Reizo2026!';
      $('#demo-username').value='Jason';
      $('#dashboard-period').value='今天';$('#dashboard-source').value='全部来源';
      $$('[data-task-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.taskFilter==='全部')));
      $('#dashboard-status').textContent='今天 · 全部来源 · 全部任务。账户数据尚未连接。';
      $('#keys-empty').textContent='';$('#logs .ac-filter-status').textContent='';
      $('#logs form').reset();$('[data-empty-filter]').value='';
      $('#account-action-dialog').close();
      return;
    }
    replace('.ac-profile h2','你好，Jason');
    replace('.ac-profile p','Pro 专业会员 · 让今天的工作更进一步。');
    replace('.ac-avatar','J');
    replace('#daily-summary','今日可用 100 / 100 点 · 今晚到期 · 仅限工作台');
    replace('.ac-balances article:first-child strong','58,240');
    replace('.ac-balances article:last-child strong','120,000');
    $$('.ac-balances strong').forEach(node=>node.removeAttribute('aria-label'));
    replace('.ac-membership-summary h2','Pro 专业');
    replace('.ac-membership-summary div>span','当期 80,000 Credits · 剩余 58,240');
    replace('.ac-current-plan .ac-status','使用中');
    replace('.ac-current-plan h2','Pro 专业');
    replace('.ac-current-plan>p','每月 80,000 Credits · 4 个并发任务 · 额外用量 9.25 折');
    replace('.ac-current-plan dl','<div><dt>会员等级</dt><dd>Pro 专业</dd></div><div><dt>本期剩余</dt><dd>23 天</dd></div><div><dt>续费状态</dt><dd>手动续费</dd></div>');
    replace('.ac-profile-settings dl','<div><dt>昵称</dt><dd>Jason</dd></div><div><dt>邮箱</dt><dd>jason@example.com</dd></div><div><dt>登录方式</dt><dd>密码登录</dd></div><div><dt>账户 ID</dt><dd>RZ-100028</dd></div>');
    replace('#billing .ac-records .ac-empty','<div class="ac-demo-ledger"><div><span>今天 14:28</span><span>产品套图 · 会员额度</span><strong>−240</strong><span>已完成</span></div><div><span>今天 13:46</span><span>资料整理 · 会员额度</span><strong>−320</strong><span>已完成</span></div><div><span>本期开始</span><span>Pro 月度额度</span><strong>+80,000</strong><span>已发放</span></div></div>');
    replace('#billing>.ac-note','工作台与 API 用量共用钱包，扣减记录可在这里查看。');
    replace('#developer .ac-dashboard-controls>.ac-status','Jason 的任务');
    replace('.ac-concurrency-value strong','2 <span>/ 4</span>');
    replace('.ac-pending-line','<div class="ac-demo-progress"><p><span>新品电商产品套图</span><span>72%</span></p><progress max="100" value="72" aria-label="产品套图进度 72%"></progress><p><span>上月财务经营分析</span><span>46%</span></p><progress max="100" value="46" aria-label="经营分析进度 46%"></progress></div>');
    replace('#developer .ac-dashboard-card:first-child .ac-note','当前 2 个任务并行执行，另有 1 项排队。API 限流单独管理。');
    replace('.ac-credit-card dl','<div><dt>会员当期剩余</dt><dd>58,240 <small>Credits</small></dd></div><div><dt>另购余额</dt><dd>120,000 <small>Credits</small></dd></div><div><dt>每日体验剩余</dt><dd>100 <small>Credits</small></dd></div>');
    rows('#team tbody',[['Jason · jason@example.com','所有者','本期开始','已加入','当前账户'],['Mia · m***@example.com','成员','3 天前','已加入','—']]);
    rows('#settlement tbody',[['本月','—','待完善结算资料','未申请','—']]);
    rows('#security tbody',[['当前浏览器','刚刚','—','当前会话']]);
    replace('#security .ac-description','管理登录方式与设备会话。');
    rows('#referrals tbody',[['好友 A***','3 天前','已注册 · 条件待审核','待规则确认','待规则确认'],['好友 B***','昨天','已注册 · 条件待审核','待规则确认','待规则确认']]);
    replace('#referrals .ac-referral-metrics article:first-child strong','2');
    replace('#referrals .ac-referral-metrics article:first-child small','成功关联的邀请');
    replace('#referrals .ac-referral-metrics article:nth-child(2) small','活动开放后查看');
    replace('#referrals .ac-referral-metrics article:nth-child(3) small','活动开放后查看');
    replace('.ac-connections>.ac-note','关联后，可使用不同方式登录同一账户。');
    renderIdentity();updateDashboard();updateLogs();updateKeys();
  }
  function signIn() {
    session.set(true);$('#demo-password').value='';$('#demo-login-error').textContent='';
    $('[data-account-section="overview"]').click();
  }
  $('#demo-login-form').addEventListener('submit',event=>{
    event.preventDefault();
    if($('#demo-username').value.trim().toLowerCase()!=='jason'||$('#demo-password').value!==password){
      $('#demo-login-error').textContent='账户或密码不正确，请重试。';return;
    }
    signIn();
  });
  $('#demo-logout').addEventListener('click',()=>{
    password='Reizo2026!';bound={wechat:false,google:true};
    session.set(false);
    $('[data-account-section="login"]').click();
  });
  document.addEventListener('reizo:demo-logout',()=>{password='Reizo2026!';bound={wechat:false,google:true};});
  window.addEventListener('reizo:demo-session',render);
  window.addEventListener('hashchange',()=>{
    if(session.active && location.hash==='#login') $('[data-account-section="overview"]').click();
  });
  window.ReizoAccountDemo = {
    get active(){return session.active;}, updateDashboard, updateLogs, updateKeys,
    action(name, button) {
      if(name!=='wechat'&&name!=='google')return false;
      if(button.dataset.connection==='bind'){
        if(!session.active){$('[data-account-section="login"]').click();return true;}
        bound[name]=!bound[name];renderIdentity();
      }else signIn();
      return true;
    },
    changePassword(current,next,confirm){
      if(!session.active)return '请先登录账户。';
      if(current!==password)return '当前密码不正确。';
      if(next.length<8)return '新密码至少 8 个字符。';
      if(next!==confirm)return '两次输入的新密码不一致。';
      password=next;
      return '密码已更新。';
    }
  };
  render();
  if(session.active && location.hash==='#login') $('[data-account-section="overview"]').click();
})();
