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

  deviceId(){
    let d = localStorage.getItem(DB.K.device);
    if (!d){
      const a = crypto.getRandomValues(new Uint8Array(9));
      const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const s = Array.from(a, x => c[x % c.length]).join('');
      d = 'GS-' + s.slice(0,3) + '-' + s.slice(3,6) + '-' + s.slice(6,9);
      localStorage.setItem(DB.K.device, d);
    }
    return d;
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
    // أي كود أقدم من آخر كود قُبل على هذا الجهاز يُرفض (يمنع الرجوع لكود قديم بعد تعطيل أو تعديل المدة)
    const tt = Number(info.t) || 0;
    const maxT = Number(localStorage.getItem(DB.K.licenseT) || 0);
    if (tt < maxT) return false;

    if (info.off){                                       // كود تعطيل من الإدارة
      localStorage.setItem(DB.K.license, code);
      localStorage.setItem(DB.K.licenseT, String(tt));
      this.info = null;
      this.show();
      this.screen(window.afterLicense, 'off');
      return 'off';
    }
    if (info.exp && Date.now() > info.exp) return false; // كود منتهي لا يُقبل
    this.mergeId(info);
    localStorage.setItem(DB.K.license, code);
    localStorage.setItem(DB.K.licenseT, String(tt));
    this.info = info;
    if (info.from && Date.now() < info.from){            // الاشتراك يبدأ في تاريخ لاحق
      this.screen(window.afterLicense, 'early');
      return 'early';
    }
    this.show();
    this.warnIfExpiring();
    return true;
  },

  /* لفيفة المنتصف: اسم النشاط + المستخدم + مدة الاشتراك */
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

  /* يُستدعى عند كل تنقل: لو انتهى الاشتراك أثناء تشغيل التطبيق يرجع لشاشة التفعيل */
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

  waLink(reason){
    const what = reason === 'none' || reason === 'invalid' ? 'أرغب في تفعيل التطبيق'
               : reason === 'off' ? 'تم تعطيل اشتراكي وأرغب في الاستفسار'
               : reason === 'early' ? 'أرغب في الاستفسار عن موعد بدء الاشتراك'
               : 'أرغب في تجديد الاشتراك';
    const msg = what + '. رقم الجهاز: ' + this.deviceId();
    return 'https://wa.me/201115197980?text=' + encodeURIComponent(msg);
  },

  screen(onOk, reason){
    const id = this.deviceId();
    const wa = this.waLink(reason);
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
      <a class="btn ok" href="${wa}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;padding-top:16px">📱 تواصل مع الإدارة عبر واتساب</a>
      <hr style="margin:16px 0;border:0;border-top:2px dashed var(--line)">
      <label>🔓 عندي كود تفعيل / تجديد من الإدارة</label>
      <textarea class="inp" id="lic" rows="3" dir="ltr"></textarea>
      <button class="btn" id="act">تفعيل الكود</button>
      <p class="hint" style="margin-top:10px">لو الكود مش شغال، تأكد إن الإدارة بعتته لنفس رقم الجهاز الظاهر فوق.</p>
    </div>`;
    const btn = document.getElementById('act');
    btn.onclick = async () => {
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
    const dl = this.daysLeft();
    const wa = this.waLink('renew');
    const left = dl === null ? '<br>المدة: مفتوحة' : '<br>المتبقي: ' + (dl >= 0 ? dl + ' يوم' : 'منتهٍ');
    const m = UI.modal(`<h2>🔑 بيانات التفعيل</h2>
      <p class="big">رقم الجهاز</p><div class="codebox">${this.deviceId()}</div>
      <p>المحل: ${DB.esc(cur.s || '—')}<br>النشاط: ${DB.esc(cur.b || '—')}<br>المستخدم: ${DB.esc(cur.u || '—')}${left}</p>
      <a class="btn ok" href="${wa}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;padding-top:16px">📱 تجديد عبر واتساب</a>
      <label>كود تجديد من الإدارة</label>
      <textarea class="inp" id="nl" rows="3" dir="ltr"></textarea>
      <button class="btn ok" id="go">تحديث</button><button class="btn gray" id="x">رجوع</button>`);
    m.querySelector('#x').onclick = () => m.close();
    m.querySelector('#go').onclick = async () => {
      const r = await this.activate(m.querySelector('#nl').value);
      if (r === true){
        m.close(); UI.toast('تم التجديد ✔');
        if (window.afterLicense) window.afterLicense();
      } else if (r){
        m.close();                                   // off / early: شاشة الحالة ظهرت من activate
      } else {
        UI.toast('الكود غير صحيح أو منتهٍ أو قديم أو لا يخص هذا الجهاز', true);
      }
    };
  }
};
/* const على مستوى الصفحة لا ينشئ window.License — لازم نربطه صراحةً */
window.License = License;
