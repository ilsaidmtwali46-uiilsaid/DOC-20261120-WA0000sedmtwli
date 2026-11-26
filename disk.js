const Disk = {
  _db: null, _h: null, _dir: null, _timer: null, _started: false,
  _auto: false, _err: '', _lastSave: null, _hasData: false,
  ok(){ return typeof window.showDirectoryPicker === 'function' && window.isSecureContext; },
  open(){
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('gs_disk_v1', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { this._db = r.result; res(this._db); };
      r.onerror = () => rej(r.error);
    });
  },
  async get(k){
    const db = await this.open();
    return new Promise(res => {
      const r = db.transaction('kv').objectStore('kv').get(k);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    });
  },
  async put(k, v){
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
  },
  async pick(){
    if (!this.ok()) return false;
    try {
      const dir = await window.showDirectoryPicker({ mode:'readwrite', startIn:'documents' });
      const file = await dir.getFileHandle('بيانات-المحل.json', { create:true });
      await this.put('dir', dir);
      await this.put('file', file);
      this._dir = dir; this._h = file; this._err = '';
      this._hasData = await this.fileHasData();
      return true;
    } catch(e){
      if (e && e.name !== 'AbortError') UI.toast('تعذر اختيار المجلد: ' + e.message, true);
      return false;
    }
  },
  async fileHasData(){
    if (!this._h) return false;
    try {
      const f = await this._h.getFile();
      if (!f || f.size < 10) return false;
      const obj = JSON.parse(await f.text());
      return !!(obj && obj.v === 1 && obj.data && Object.keys(obj.data).length);
    } catch(e){ return false; }
  },
  async restore(){
    if (!this._h) return false;
    try {
      const f = await this._h.getFile();
      const txt = await f.text();
      if (!txt.trim()) return false;
      const obj = JSON.parse(txt);
      if (!obj || obj.v !== 1 || !obj.data) return false;
      DB.restoreObject(obj);
      return true;
    } catch(e){
      if (e && e.message === 'full') UI.toast('مساحة المتصفح ممتلئة — تعذرت الاستعادة', true);
      return false;
    }
  },
  async saveNow(force){
    if (!this._h) return false;
    if (!force && !this._auto) return false;
    try {
      if (!force && this._hasData){
        const cur = DB.snapshot();
        if (!cur.data[DB.K.setup] && !(cur.data[DB.K.products] || []).length){
          this._err = 'توقّف الحفظ لحماية بيانات المجلد'; this.chip(); return false;
        }
      }
      const w = await this._h.createWritable();
      await w.write(JSON.stringify(DB.snapshot(), null, 2));
      await w.close();
      this._err = ''; this._lastSave = new Date(); this._hasData = true;
      DB.set(DB.K.lastBackup, this._lastSave.toISOString());
      this.chip();
      return true;
    } catch(e){
      this._err = e && e.name === 'NotAllowedError' ? 'اضغط لإعادة الإذن' : 'فشل الحفظ';
      this.chip();
      return false;
    }
  },
  touch(){
    if (!this._h || !this._auto) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), 900);
  },
  async start(onReady){
    this._started = true;
    if (!this.ok()){ this._auto = true; return onReady(); }
    try {
      this._h = await this.get('file');
      this._dir = await this.get('dir');
    } catch(e){}
    if (this._h){
      const q = await this._h.queryPermission({ mode:'readwrite' });
      if (q === 'granted'){
        if (!DB.isSetupDone()) await this.restore();
        this._hasData = await this.fileHasData();
        this._auto = true;
        if (DB.isSetupDone() && !this._hasData) this.saveNow();
        return onReady();
      }
      const app = document.getElementById('app');
      app.innerHTML = '<div class="box" style="margin-top:20px">' +
        '<h1>إعادة ربط مجلد الحفظ</h1>' +
        '<p class="big">اضغط للسماح للتطبيق بالقراءة والحفظ في مجلدك المختار.</p>' +
        '<button class="btn ok" id="grant">السماح والفتح</button>' +
        '<button class="btn gray" id="skip">المتابعة بدون ربط الآن</button></div>';
      app.querySelector('#grant').onclick = async () => {
        try {
          if ((await this._h.requestPermission({ mode:'readwrite' })) === 'granted'){
            if (!DB.isSetupDone()) await this.restore();
            this._hasData = await this.fileHasData();
            this._auto = true;
            if (DB.isSetupDone() && !this._hasData) await this.saveNow();
            return onReady();
          }
        } catch(e){}
        UI.toast('لم يُمنح الإذن', true);
      };
      app.querySelector('#skip').onclick = () => { this._err = 'غير مربوط'; onReady(); };
      return;
    }
    if (DB.isSetupDone() || DB.get('gs_fs_skip', false)) return onReady();
    const app = document.getElementById('app');
    app.innerHTML = '<div class="box" style="margin-top:20px">' +
      '<h1>اختر مكان حفظ بياناتك</h1>' +
      '<p class="big">سيحفظ التطبيق نسخة تلقائية في هذا المجلد مع كل عملية، حتى لا تضيع بياناتك أبداً.</p>' +
      '<button class="btn ok" id="pick">اختيار المجلد</button>' +
      '<button class="btn gray" id="later">لاحقاً</button></div>';
    app.querySelector('#pick').onclick = async () => {
      if (!await this.pick()) return;
      if (this._hasData){
        const ok = await UI.confirm('يوجد ملف بيانات سابق في هذا المجلد. استعادته؟', 'نعم، استعد', 'بدء جديد');
        if (ok) await this.restore();
      }
      this._auto = true;
      if (DB.isSetupDone()) await this.saveNow();
      onReady();
    };
    app.querySelector('#later').onclick = () => { DB.set('gs_fs_skip', true); onReady(); };
  },
  chip(){
    const el = document.getElementById('fsChip'); if (!el) return;
    if (!this.ok()){
      const last = DB.get(DB.K.lastBackup, null);
      const days = last ? Math.floor((Date.now() - new Date(last)) / 86400000) : 999;
      el.className = 'fs-chip' + (days >= 7 ? ' warn' : '');
      el.textContent = days >= 7
        ? '⚠ لم تأخذ نسخة احتياطية منذ فترة — اضغط للحفظ'
        : 'آخر نسخة احتياطية: ' + new Date(last).toLocaleDateString('ar-EG');
      el.onclick = () => this.panel();
      return;
    }
    if (!this._h){
      el.className = 'fs-chip warn';
      el.textContent = '⚠ البيانات غير مربوطة بمجلد — اضغط لاختيار مجلد الحفظ';
    } else if (this._err){
      el.className = 'fs-chip bad';
      el.textContent = '⚠ ' + this._err + ' — اضغط للإصلاح';
    } else {
      el.className = 'fs-chip';
      const t = this._lastSave ? ' • ' + this._lastSave.toLocaleTimeString('ar-EG', {hour:'2-digit',minute:'2-digit'}) : '';
      el.textContent = '✓ محفوظ تلقائياً في المجلد: ' + (this._dir ? this._dir.name : '') + t;
    }
    el.onclick = () => this.panel();
  },
  panel(){
    const last = DB.get(DB.K.lastBackup, null);
    let body = '<h2>حفظ البيانات والنسخ الاحتياطي</h2>';
    if (this.ok()){
      body += '<div class="box big">' + (this._h
        ? 'المجلد المربوط: ' + DB.esc(this._dir ? this._dir.name : 'مربوط') +
          (this._err ? '<br><span style="color:var(--bad)">الحالة: ' + DB.esc(this._err) + '</span>' : '<br><span style="color:var(--ok)">الحفظ التلقائي يعمل</span>')
        : 'لم يُربط مجلد بعد') + '</div>';
      if (this._h && this._err) body += '<button class="btn ok" id="regrant">إعادة السماح</button>';
      body += '<button class="btn ok" id="ch">' + (this._h ? 'تغيير المجلد' : 'اختيار مجلد الحفظ') + '</button>';
      if (this._h){
        body += '<button class="btn" id="now">حفظ في المجلد الآن</button>';
        body += '<button class="btn warn" id="fromDisk">استعادة من المجلد</button>';
      }
    } else {
      body += '<p class="big">الحفظ التلقائي في مجلد متاح على Chrome و Edge للكمبيوتر والأندرويد. على هذا المتصفح استخدم زر النسخة الاحتياطية:</p>';
    }
    body += '<p class="hint">آخر نسخة: ' + (last ? new Date(last).toLocaleString('ar-EG') : 'لا يوجد') + '</p>';
    body += '<button class="btn" id="dl">تنزيل ملف نسخة احتياطية</button>';
    body += '<button class="btn gray" id="x">رجوع</button>';
    const m = UI.modal(body);
    const $ = id => m.querySelector('#' + id);
    $('x').onclick = () => m.close();
    $('dl').onclick = () => { DB.exportBackup(); this.chip(); m.close(); };
    if ($('regrant')) $('regrant').onclick = async () => {
      try {
        if ((await this._h.requestPermission({ mode:'readwrite' })) === 'granted'){
          this._err = ''; this._auto = true; await this.saveNow(true);
          UI.toast('تم التفعيل'); m.close();
        }
      } catch(e){ UI.toast('لم يُمنح الإذن', true); }
    };
    if ($('ch')) $('ch').onclick = async () => {
      if (await this.pick()){
        this._auto = true;
        await this.saveNow(true);
        UI.toast('تم ربط المجلد وحفظ البيانات'); m.close();
      }
    };
    if ($('now')) $('now').onclick = async () => {
      if (await this.saveNow(true)){ UI.toast('تم الحفظ في المجلد'); m.close(); }
    };
    if ($('fromDisk')) $('fromDisk').onclick = async () => {
      if (!await UI.confirm('سيتم استبدال البيانات الحالية بالمحفوظة في المجلد. متأكد؟', 'نعم', 'إلغاء')) return;
      if (await this.restore()){ UI.toast('تمت الاستعادة'); setTimeout(() => location.reload(), 600); }
      else UI.toast('لا توجد بيانات صالحة في المجلد', true);
    };
  }
};
window.Disk = Disk;
