const License = {
  PUBLIC_KEY:{"kty":"EC","crv":"P-256","x":"JPiLhZfTREyfi47bilILNM50L24xGA88AgLPLot2z0M","y":"aL9Mqq68V-Mw0TBPCg0zg3QgTusGky_yFEsdv2v3WhA"},
  info: null,

  /* فك base64url (مع إضافة الحشو المفقود) */
  dec(s){
    s = String(s).replace(/-/g,'+').replace(/_/g,'/');
    while (s.length % 4) s += '=';
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
  },
  clean(code){ return String(code == null ? '' : code).replace(/\s+/g, ''); },
  hasCrypto(){ return !!(window.crypto && crypto.subtle && crypto.getRandomValues); },

  /* كود تعريف جهاز فريد وثابت لكل جهاز لا يتكرر على نفس الجهاز ولا يتطابق مع جهاز آخر */
  deviceId(){
    let d = localStorage.getItem(DB.K.device);
    if (!d){
      const a = crypto.getRandomValues(new Uint8Array(9));
      const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const s = Array.from(a, x => c[x % c.length]).join('');
      const fp = [
        navigator.userAgent || '',
        navigator.language || '',
        screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
        Intl.DateTimeFormat().resolvedOptions().timeZone || ''
      ].join('|');
      let h = 2166136261;
      for (let i = 0; i < fp.length; i++){
        h ^= fp.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const suffix = (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-3);
      d = 'GS-' + s.slice(0,3) + '-' + s.slice(3,6) + '-' + s.slice(6,9) + suffix;
      localStorage.setItem(DB.K.device, d);
    }
    return d;
  },

  getRequesterInfo(){
    try {
      return JSON.parse(localStorage.getItem('gs_requester_info') || '{}') || {};
    } catch(_){ return {}; }
  },
  saveRequesterInfo(activity, manager, phone){
    const obj = {
      activity: String(activity || '').trim(),
      manager: String(manager || '').trim(),
      phone: String(phone || '').trim()
    };
    try { localStorage.setItem('gs_requester_info', JSON.stringify(obj)); } catch(_){}
    return obj;
  },
  validateRequester(activity, manager, phone){
    const act = String(activity || '').trim();
    const mgr = String(manager || '').trim();
    const phn = String(phone || '').trim();
    if (!act || !mgr || !phn){
      UI.toast('يجب ملء جميع الحقول الإلزامية: النشاط، المسئول، ورقم التواصل', true);
      return null;
    }
    return this.saveRequesterInfo(act, mgr, phn);
  },

  /* التحقق من توقيع ECDSA P-256 ومن مطابقة رقم الجهاز */
  async verify(token){
    try {
      if (!this.PUBLIC_KEY || !this.hasCrypto()) return null;
      const parts = this.clean(token).split('.');
      if (parts.length !== 2) return null;
      const [p, s] = parts;
      const key = await crypto.subtle.importKey('jwk', this.PUBLIC_KEY, {name:'ECDSA',namedCurve:'P-256'}, false, ['verify']);
      if (!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'}, key, this.dec(s), this.dec(p))) return null;
      const info = JSON.parse(new TextDecoder().decode(this.dec(p)));
      return info.d === this.deviceId() ? info : null;
    } catch(e){ return null; }
  },

  /* حفظ/استرجاع (المحل - النشاط - المستخدم) حتى لو كود التجديد لا يحملها */
  mergeId(info){
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(DB.K.licenseId) || '{}') || {}; } catch(_){ saved = {}; }
    ['s','b','u'].forEach(k => {
      if (info[k]) saved[k] = info[k];
      else if (info.renew && saved[k]) info[k] = saved[k];
    });
    try { localStorage.setItem(DB.K.licenseId, JSON.stringify(saved)); } catch(_){}
    return info;
  },

  daysLeft(){
    if (!this.info || !this.info.exp) return null;
    return Math.ceil((this.info.exp - Date.now()) / 86400000);
  },

  /* يرجع: true (تم) | false (مرفوض) | 'off' (كود تعطيل) | 'early' (الاشتراك لم يبدأ بعد) */
  async activate(code){
    code = this.clean(code);
    const info = await this.verify(code);
    if (!info) return false;
    const tt = Number(info.t) || 0;
    const maxT = Number(localStorage.getItem(DB.K.licenseT) || 0);
    if (tt < maxT) return false;

    if (info.off){
      localStorage.setItem(DB.K.license, code);
      localStorage.setItem(DB.K.licenseT, String(tt));
      this.info = null;
      this.show();
      this.screen(window.afterLicense, 'off');
      return 'off';
    }
    if (info.exp && Date.now() > info.exp) return false;
    this.mergeId(info);
    localStorage.setItem(DB.K.license, code);
    localStorage.setItem(DB.K.licenseT, String(tt));
    this.info = info;
    if (info.from && Date.now() < info.from){
      this.screen(window.afterLicense, 'early');
      return 'early';
    }
    this.show();
    this.warnIfExpiring();
    return true;
  },

  show(){
    const el = document.getElementById('title');
    if (!el) return;
    if (!this.info){
      el.innerHTML = '<div class="scroll-main-title">اسم النشاط</div>';
      return;
    }
    const activityName = this.info.b || this.info.s || 'اسم النشاط';
    const shopName = (this.info.s && this.info.s !== activityName) ? this.info.s : '';
    const dl = this.daysLeft();
    const meta = [];
    if (shopName) meta.push('🏪 ' + DB.esc(shopName));
    if (this.info.u) meta.push('👤 ' + DB.esc(this.info.u));
    if (dl === null) meta.push('♾️ اشتراك مفتوح');
    else if (dl >= 0){
      const end = new Date(this.info.exp).toLocaleDateString('ar-EG');
      meta.push('⏳ متبقي ' + dl + ' يوم (حتى ' + end + ')');
    } else meta.push('⛔ الاشتراك منتهٍ');
    el.innerHTML = `<div class="scroll-main-title">${DB.esc(activityName)}</div>` +
      `<div class="scroll-meta">${meta.map(m => `<span class="scroll-sub-title">${m}</span>`).join('')}</div>`;
  },

  warnIfExpiring(){
    const dl = this.daysLeft();
    if (dl !== null && dl >= 0 && dl <= 3){
      setTimeout(() => UI.toast('⚠️ ينتهي الاشتراك بعد ' + dl + ' يوم — جدد الآن', true), 800);
    }
  },

  check(){
    if (!this.info || !this.info.exp) return true;
    if (Date.now() <= this.info.exp) return true;
    this.screen(window.afterLicense, 'exp');
    return false;
  },

  async gate(onOk){
    if (!this.hasCrypto()) return this.noCrypto();
    const raw = localStorage.getItem(DB.K.license);
    if (!raw) return this.screen(onOk, 'none');
    const info = await this.verify(raw);
    if (!info) return this.screen(onOk, 'invalid');
    if (info.off){ this.info = null; return this.screen(onOk, 'off'); }
    if (info.exp && Date.now() > info.exp) return this.screen(onOk, 'exp');
    this.mergeId(info);
    this.info = info;
    if (info.from && Date.now() < info.from) return this.screen(onOk, 'early');
    this.show();
    this.warnIfExpiring();
    return onOk();
  },

  noCrypto(){
    document.getElementById('app').innerHTML = `<div class="box">
      <h1>⚠️ المتصفح لا يدعم التفعيل</h1>
      <p class="big">افتح التطبيق من الرابط الآمن (https) وبمتصفح حديث مثل Chrome أو Safari.</p></div>`;
  },

  waLink(reason, req){
    const what = reason === 'none' || reason === 'invalid' ? 'طلب تفعيل التطبيق'
               : reason === 'off' ? 'طلب إعادة تفعيل الاشتراك'
               : reason === 'early' ? 'استفسار عن موعد بدء الاشتراك'
               : 'طلب تجديد الاشتراك';
    const msg = what
      + '\nالنشاط: ' + req.activity
      + '\nالمسئول: ' + req.manager
      + '\nرقم التواصل: ' + req.phone
      + '\nرقم الجهاز: ' + this.deviceId();
    return 'https://wa.me/201115197980?text=' + encodeURIComponent(msg);
  },

  screen(onOk, reason){
    const id = this.deviceId();
    const req = this.getRequesterInfo();
    const startTxt = this.info && this.info.from ? new Date(this.info.from).toLocaleDateString('ar-EG') : '';
    const titles = {
      off: '⛔ تم تعطيل الاشتراك من الإدارة',
      early: '⏳ الاشتراك لم يبدأ بعد' + (startTxt ? ' — يبدأ يوم ' + startTxt : ''),
      exp: '⏰ انتهت مدة الاشتراك',
      none: '🔒 التطبيق غير مفعّل على هذا الجهاز',
      invalid: '⚠️ كود التفعيل غير صالح أو لا يخص هذا الجهاز'
    };
    document.getElementById('app').innerHTML = `<div class="box">
      <h1>${titles[reason] || titles.none}</h1>
      <p class="big">رقم جهازك (أرسله للإدارة):</p>
      <div class="codebox">${id}</div>
      <label>النشاط (إلزامي)</label>
      <input class="inp" id="reqAct" value="${DB.esc(req.activity || '')}" placeholder="اكتب اسم النشاط">
      <label>المسئول (إلزامي)</label>
      <input class="inp" id="reqMgr" value="${DB.esc(req.manager || '')}" placeholder="اكتب اسم المسئول">
      <label>رقم التواصل (إلزامي)</label>
      <input class="inp" id="reqPhn" type="tel" value="${DB.esc(req.phone || '')}" placeholder="اكتب رقم الهاتف أو الواتساب">
      <button type="button" class="btn ok" id="waReqBtn">📱 إرسال طلب التفعيل / التجديد عبر واتساب</button>
      <hr style="margin:16px 0;border:0;border-top:2px dashed var(--line)">
      <label>🔓 عندي كود تفعيل / تجديد من الإدارة</label>
      <textarea class="inp" id="lic" rows="3" dir="ltr"></textarea>
      <button class="btn" id="act">تفعيل الكود</button>
      <p class="hint" style="margin-top:10px">لو الكود مش شغال، تأكد إن الإدارة بعتته لنفس رقم الجهاز الظاهر فوق.</p>
    </div>`;

    document.getElementById('waReqBtn').onclick = () => {
      const valid = this.validateRequester(
        document.getElementById('reqAct').value,
        document.getElementById('reqMgr').value,
        document.getElementById('reqPhn').value
      );
      if (!valid) return;
      window.open(this.waLink(reason, valid), '_blank', 'noopener');
    };

    const btn = document.getElementById('act');
    btn.onclick = async () => {
      const valid = this.validateRequester(
        document.getElementById('reqAct').value,
        document.getElementById('reqMgr').value,
        document.getElementById('reqPhn').value
      );
      if (!valid) return;
      btn.disabled = true;
      try {
        const r = await this.activate(document.getElementById('lic').value);
        if (r === true) onOk();
        else if (!r) UI.toast('الكود غير صحيح أو منتهٍ أو قديم أو لا يخص هذا الجهاز', true);
      } finally { btn.disabled = false; }
    };
  },

  update(){
    const cur = this.info || {};
    const req = this.getRequesterInfo();
    const dl = this.daysLeft();
    const left = dl === null ? '<br>المدة: مفتوحة' : '<br>المتبقي: ' + (dl >= 0 ? dl + ' يوم' : 'منتهٍ');
    const m = UI.modal(`<h2>🔑 بيانات التفعيل</h2>
      <p class="big">رقم الجهاز</p><div class="codebox">${this.deviceId()}</div>
      <p>المحل: ${DB.esc(cur.s || '—')}<br>النشاط: ${DB.esc(cur.b || req.activity || '—')}<br>المستخدم: ${DB.esc(cur.u || req.manager || '—')}${left}</p>
      <label>النشاط (إلزامي)</label>
      <input class="inp" id="mAct" value="${DB.esc(req.activity || cur.b || '')}" placeholder="اكتب اسم النشاط">
      <label>المسئول (إلزامي)</label>
      <input class="inp" id="mMgr" value="${DB.esc(req.manager || cur.u || '')}" placeholder="اكتب اسم المسئول">
      <label>رقم التواصل (إلزامي)</label>
      <input class="inp" id="mPhn" type="tel" value="${DB.esc(req.phone || '')}" placeholder="اكتب رقم التواصل">
      <button type="button" class="btn ok" id="mWa">📱 إرسال طلب التجديد عبر واتساب</button>
      <label>كود تجديد من الإدارة</label>
      <textarea class="inp" id="nl" rows="3" dir="ltr"></textarea>
      <button class="btn ok" id="go">تحديث</button><button class="btn gray" id="x">رجوع</button>`);
    m.querySelector('#x').onclick = () => m.close();
    m.querySelector('#mWa').onclick = () => {
      const valid = this.validateRequester(
        m.querySelector('#mAct').value,
        m.querySelector('#mMgr').value,
        m.querySelector('#mPhn').value
      );
      if (!valid) return;
      window.open(this.waLink('renew', valid), '_blank', 'noopener');
    };
    m.querySelector('#go').onclick = async () => {
      const valid = this.validateRequester(
        m.querySelector('#mAct').value,
        m.querySelector('#mMgr').value,
        m.querySelector('#mPhn').value
      );
      if (!valid) return;
      const r = await this.activate(m.querySelector('#nl').value);
      if (r === true){
        m.close(); UI.toast('تم التجديد ✔');
        if (window.afterLicense) window.afterLicense();
      } else if (r){
        m.close();
      } else {
        UI.toast('الكود غير صحيح أو منتهٍ أو قديم أو لا يخص هذا الجهاز', true);
      }
    };
  }
};
window.License = License;
