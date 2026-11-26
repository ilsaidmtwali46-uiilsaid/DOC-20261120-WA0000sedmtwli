const License = {
  SECRET: 'GS-2026-SM-948271-KEY',
  URL: 'https://script.google.com/macros/s/AKfycbzg42jG-V0J2uI6jY0Y6lQ5o_yI4qV3H4vH1n2I5O-s3O2b6fQ0P7T8X1Z9R4M6L8K/exec',
  OFFLINE_DAYS: 3,

  str(x){ return String(x == null ? '' : x); },
  norm(s){ return this.str(s).trim().toUpperCase().replace(/[^A-Z0-9-]/g, ''); },
  parseDate(s){
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.str(s).trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999);
    return (d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? d : null;
  },
  today(){ const d = new Date(); d.setHours(0,0,0,0); return d; },

  device(){
    let id = DB.get(DB.K.device, null);
    if (!id){
      const a = new Uint8Array(6); crypto.getRandomValues(a);
      id = 'DEV-' + Array.from(a, b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
      DB.set(DB.K.device, id);
    }
    return id;
  },

  async sign(shop, exp, dev){
    const raw = [this.SECRET, this.str(shop).trim(), this.str(exp).trim(), this.str(dev).trim()].join('|');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const hex = Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
    return hex.slice(0,4) + '-' + hex.slice(4,8) + '-' + hex.slice(8,12);
  },

  async verify(lic){
    if (!lic || !lic.shop || !lic.exp || !lic.code) return false;
    const d = this.parseDate(lic.exp);
    if (!d) return false;
    const exp1 = await this.sign(lic.shop, lic.exp, this.device());
    if (this.norm(lic.code) === exp1) return true;
    const exp2 = await this.sign(lic.shop, lic.exp, '');
    return this.norm(lic.code) === exp2;
  },

  clockBack(){
    const last = DB.get(DB.K.seenAt, null);
    const now = Date.now();
    if (last && now < last - 3600000) return true;
    DB.set(DB.K.seenAt, now);
    return false;
  },

  check(){
    const lic = DB.get(DB.K.license, null);
    if (!lic) return false;
    if (this.clockBack()){
      this.block('تاريخ الجهاز غير صحيح. اضبط التاريخ والوقت ثم أعد المحاولة.');
      return false;
    }
    const d = this.parseDate(lic.exp);
    if (!d || d < this.today()){
      this.block('انتهت مدة الاشتراك (' + DB.esc(lic.exp || '') + '). تواصل لتجديد الكود.');
      return false;
    }
    return true;
  },

  async onlineCheck(lic){
    if (!this.URL || !navigator.onLine) return true;
    const last = DB.get(DB.K.licenseCheck, 0);
    if (Date.now() - last < 12 * 3600 * 1000) return true;
    try {
      const u = this.URL + '?shop=' + encodeURIComponent(lic.shop) + '&dev=' + encodeURIComponent(this.device()) + '&code=' + encodeURIComponent(lic.code);
      const r = await fetch(u, { cache:'no-store' });
      if (!r.ok) return true;
      const j = await r.json();
      DB.set(DB.K.licenseCheck, Date.now());
      if (j && j.valid === false){
        DB.set(DB.K.license, null);
        return false;
      }
    } catch(e){}
    return true;
  },

  async gate(onOk){
    const lic = DB.get(DB.K.license, null);
    if (lic && await this.verify(lic) && this.check()){
      if (await this.onlineCheck(lic)) return onOk();
    }
    this.activate(onOk);
  },

  activate(onOk, msg){
    const dev = this.device();
    const cur = DB.get(DB.K.license, {}) || {};
    const app = document.getElementById('app');
    app.innerHTML = '<div class="box" style="max-width:460px;margin:16px auto">' +
      '<h1>تفعيل التطبيق</h1>' +
      (msg ? '<p class="big" style="color:var(--bad)">' + DB.esc(msg) + '</p>' : '') +
      '<p class="hint">أرسل رقم الجهاز للمطور للحصول على كود التفعيل:</p>' +
      '<div class="codebox" id="devBox">' + DB.esc(dev) + '</div>' +
      '<button type="button" class="btn gray" id="copyDev">نسخ رقم الجهاز</button>' +
      '<button type="button" class="btn" style="background:#25D366" id="waReq">طلب التفعيل عبر واتساب</button>' +
      '<label>اسم المحل / النشاط</label><input class="inp" id="lshop" value="' + DB.esc(cur.shop || '') + '">' +
      '<label>تاريخ الانتهاء (YYYY-MM-DD)</label><input class="inp" id="lexp" placeholder="2027-12-31" value="' + DB.esc(cur.exp || '') + '">' +
      '<label>كود التفعيل</label><input class="inp" id="lcode" style="direction:ltr;text-align:center" placeholder="XXXX-XXXX-XXXX">' +
      '<button type="button" class="btn ok" id="lgo">تفعيل</button></div>';

    const $ = id => app.querySelector('#' + id);
    $('copyDev').onclick = async () => {
      try { await navigator.clipboard.writeText(dev); UI.toast('تم نسخ رقم الجهاز'); }
      catch(e){ UI.toast('انسخ الرقم يدوياً'); }
    };
    $('waReq').onclick = () => {
      const sh = $('lshop').value.trim();
      const txt = 'مرحباً أستاذ السيد متولي، أطلب تفعيل برنامج المحاسبة.\nرقم الجهاز: ' + dev + (sh ? '\nاسم النشاط: ' + sh : '');
      window.open('https://wa.me/201115197980?text=' + encodeURIComponent(txt), '_blank', 'noopener');
    };
    $('lgo').onclick = async () => {
      const lic = { shop: $('lshop').value.trim(), exp: $('lexp').value.trim(), code: $('lcode').value.trim() };
      if (!lic.shop || !lic.exp || !lic.code) return UI.toast('أكمل كل الخانات', true);
      if (!await this.verify(lic)) return UI.toast('كود التفعيل غير صحيح', true);
      if (!this.parseDate(lic.exp) || this.parseDate(lic.exp) < this.today()) return UI.toast('تاريخ الاشتراك منتهٍ', true);
      DB.set(DB.K.license, lic);
      DB.set(DB.K.seenAt, Date.now());
      UI.toast('تم التفعيل بنجاح');
      onOk();
    };
  },

  block(msg){
    this.activate(() => afterLicense(), msg);
  },

  update(){
    const lic = DB.get(DB.K.license, null);
    const m = UI.modal('<h2>بيانات الاشتراك</h2>' +
      '<div class="box big">' + (lic
        ? 'النشاط: ' + DB.esc(lic.shop) + '<br>ينتهي في: ' + DB.esc(lic.exp) + '<br>الجهاز: <bdi dir="ltr">' + DB.esc(this.device()) + '</bdi>'
        : 'غير مفعّل') + '</div>' +
      '<button class="btn ok" id="renew">تجديد / تغيير الكود</button>' +
      '<button class="btn gray" id="x">رجوع</button>');
    m.querySelector('#x').onclick = () => m.close();
    m.querySelector('#renew').onclick = () => { m.close(); this.activate(() => afterLicense()); };
  },

  show(){
    const lic = DB.get(DB.K.license, null);
    const el = document.getElementById('title');
    if (!el) return;
    if (lic && lic.shop){
      el.innerHTML = '<div class="scroll-main-title">' + DB.esc(lic.shop) + '</div>' +
        '<div class="scroll-meta"><span class="scroll-sub-title">ساري حتى: ' + DB.esc(lic.exp) + '</span></div>';
    }
  }
};
window.License = License;
