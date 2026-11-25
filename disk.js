const Disk = {
  ROOT_NAME: 'محاسبة-المحل',
  KEEP_DAILY: 14,
  state: 'new',
  err: '',
  dir: null,
  root: null,
  pending: 0,
  busy: false,
  busySnap: false,
  _t1: null, _t2: null, _started: false, _hooked: false,

  supported(){ return typeof window.showDirectoryPicker === 'function'; },
  mode(){ return localStorage.getItem('gs_fs_mode') || ''; },
  setMode(m){ localStorage.setItem('gs_fs_mode', m); },
  pad(n){ return String(n).padStart(2, '0'); },
  ymd(d){ return d.getFullYear() + '-' + this.pad(d.getMonth() + 1) + '-' + this.pad(d.getDate()); },
  hms(d){ return this.pad(d.getHours()) + this.pad(d.getMinutes()) + this.pad(d.getSeconds()); },
  safe(s){ return String(s).replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-'); },
  shop(){
    const i = (typeof License !== 'undefined') ? License.info : null;
    return (i && (i.b || i.s)) || 'المحل';
  },
  ver(){ return window.APP_VERSION || ''; },

  idb(){
    return new Promise((res, rej) => {
      const r = indexedDB.open('gs_disk', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async kvGet(k){
    const db = await this.idb();
    return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  },
  async kvSet(k, v){
    const db = await this.idb();
    return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  },
  async kvDel(k){
    const db = await this.idb();
    return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  },

  async perm(h, ask){
    if (!h) return false;
    if (!h.queryPermission) return true;
    const o = { mode: 'readwrite' };
    if ((await h.queryPermission(o)) === 'granted') return true;
    if (ask && (await h.requestPermission(o)) === 'granted') return true;
    return false;
  },
  async openRoot(){
    this.root = await this.dir.getDirectoryHandle(this.ROOT_NAME, { create: true });
  },

  async sub(path){
    let h = this.root;
    for (const p of path) h = await h.getDirectoryHandle(p, { create: true });
    return h;
  },
  async write(dirH, name, data){
    const fh = await dirH.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
  },
  async readText(name){
    try {
      const fh = await this.root.getFileHandle(name);
      return await (await fh.getFile()).text();
    } catch(e){ return null; }
  },
  async readJson(name){
    const t = await this.readText(name);
    if (!t) return null;
    try { return JSON.parse(t); } catch(e){ return null; }
  },

  async init(){
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch(e){}
    const m = this.mode();
    this.state = m === 'folder' ? 'needs' : (m || 'new');
    if (m !== 'folder') return;
    try {
      const h = await this.kvGet('dir');
      if (!h) return;
      this.dir = h;
      if (await this.perm(h, false)){
        await this.openRoot();
        this.state = 'ok';
      }
    } catch(e){ this.state = 'error'; this.err = e.message || String(e); }
  },

  async start(next){
    this._started = true;
    this.hook();
    try { await this.init(); } catch(e){ this.state = 'error'; this.err = e.message || String(e); }
    if (this.state === 'new') return this.firstRun(next);
    if (this.state === 'ok') this.touch(true);
    next();
  },

  hook(){
    if (this._hooked) return;
    this._hooked = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.state === 'ok'){ this.flushDocs(); this.flushSnap(); }
    });
  },

  firstRun(next){
    const sup = this.supported();
    document.getElementById('app').innerHTML = '<div class="box">' +
      '<h1>مكان حفظ بيانات المحل</h1>' +
      '<p class="big">كل فاتورة ومعاملة تُحفظ تلقائياً كملف على ذاكرة جهازك فقط (بدون إنترنت أو سيرفر).</p>' +
      '<p class="hint">ستجد داخل المجلد: الفواتير بصيغة HTML للطباعة، وسجل المعاملات والمخزون والعملاء والموردين بصيغة Excel، ونسخة كاملة للاستعادة.</p>' +
      (sup
        ? '<p class="hint">الأفضل إنشاء مجلد جديد باسم مثل «محاسبة» واختياره.</p><button class="btn ok" id="dpick">اختيار مجلد الحفظ</button>'
        : '<p class="hint" style="color:var(--bad)">متصفحك لا يدعم اختيار مجلد للحفظ التلقائي.</p>') +
      '<button class="btn gray" id="ddl">نسخ يدوية في التنزيلات</button>' +
      '<button class="btn gray" id="dskip">تخطي الآن</button>' +
    '</div>';
    const go = () => next();
    const pick = document.getElementById('dpick');
    if (pick) pick.onclick = async () => {
      pick.disabled = true;
      try { if (await this.choose()) return go(); }
      catch(e){ UI.toast('تعذر استخدام هذا المجلد', true); }
      pick.disabled = false;
    };
    document.getElementById('ddl').onclick = () => { this.setMode('downloads'); this.state = 'downloads'; go(); };
    document.getElementById('dskip').onclick = () => { this.setMode('none'); this.state = 'none'; go(); };
  },

  async choose(){
    let dir;
    try { dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'gs-accounting' }); }
    catch(e){ if (e && e.name === 'AbortError') return false; throw e; }
    this.dir = dir;
    await this.openRoot();
    await this.write(this.root, 'اقرأني.txt', 'هذا المجلد يخص برنامج محاسبة المحل (' + this.shop() + ').');
    await this.kvSet('dir', dir);
    this.setMode('folder');
    localStorage.setItem('gs_fs_name', dir.name || 'المجلد المحدد');
    this.state = 'ok';
    this.err = '';
    const restored = await this.offerRestore();
    if (restored) return true;
    localStorage.removeItem('gs_fs_done');
    this.touch(true);
    return true;
  },

  async offerRestore(){
    const snap = await this.readJson('بيانات-المحل.json');
    if (!snap || !snap.data) return false;
    const when = snap.at ? new Date(snap.at).toLocaleString('ar-EG') : '';
    const yes = await UI.confirm('تم العثور على بيانات محفوظة سابقاً في هذا المجلد' + (when ? ' (' + when + ')' : '') + '. هل تريد استعادتها؟', 'استعادة', 'لا، متابعة');
    if (yes){
      try {
        DB.restoreObject(snap);
        this.markAllDone();
        UI.toast('تمت الاستعادة');
        setTimeout(() => location.reload(), 600);
        return true;
      } catch(e){ UI.toast('تعذرت الاستعادة', true); return false; }
    }
    try {
      const old = await this.readText('بيانات-المحل.json');
      if (old){
        const d = await this.sub(['نسخ-يومية']);
        const n = new Date();
        await this.write(d, 'سابق-' + this.ymd(n) + '-' + this.hms(n) + '.json', old);
      }
    } catch(e){}
    return false;
  },

  markAllDone(){
    localStorage.setItem('gs_fs_done', JSON.stringify(this.docs().map(x => x.k)));
  },

  touch(now){
    if (this.state !== 'ok'){ this.chip(); return; }
    clearTimeout(this._t1);
    this._t1 = setTimeout(() => this.flushDocs(), now ? 200 : 1500);
    clearTimeout(this._t2);
    this._t2 = setTimeout(() => this.flushSnap(), now ? 1500 : 6000);
    this.chip();
  },

  docs(){
    const out = [];
    DB.list('sales').forEach(d => out.push({ k:'s:' + d.id, kind:'sale', d }));
    DB.list('purchases').forEach(d => out.push({ k:'p:' + d.id, kind:'purchase', d }));
    (DB.get(DB.K.payments, []) || []).forEach(d => out.push({ k:'y:' + d.id, kind:'payment', d }));
    (DB.get(DB.K.stocktakes, []) || []).forEach(d => out.push({ k:'t:' + d.id, kind:'stocktake', d }));
    return out.sort((a, b) => String(a.d.date).localeCompare(String(b.d.date)));
  },
  label(x){
    const d = x.d;
    if (x.kind === 'sale') return (d.isReturn ? 'مرتجع بيع ' : 'بيع ') + (d.type === 'cash' ? 'نقدي' : 'آجل');
    if (x.kind === 'purchase') return d.isReturn ? 'مرتجع شراء' : 'فاتورة شراء';
    if (x.kind === 'payment') return d.kind === 'customers' ? 'استلام من عميل' : 'سداد لمورد';
    return 'جرد';
  },
  info(x){
    const d = x.d, dt = new Date(d.date);
    let party = '', total = 0, paid = 0, count = (d.items || []).length;
    if (x.kind === 'sale'){
      party = d.customerId ? DB.partyName('customers', d.customerId) : '';
      total = d.total || 0;
      paid = d.type === 'cash' ? total : (Number(d.paid) || 0);
    } else if (x.kind === 'purchase'){
      party = d.supplierId ? DB.partyName('suppliers', d.supplierId, d.supplierName) : (d.supplierName || '');
      total = d.total || 0; paid = d.isReturn ? (d.received || 0) : (d.paid || 0);
    } else if (x.kind === 'payment'){
      party = DB.partyName(d.kind, d.party);
      total = d.amount || 0; paid = total; count = 0;
    } else {
      total = d.totalDiffValue || 0;
    }
    const label = this.label(x);
    const day = this.ymd(dt);
    const file = 'الفواتير/' + day + '/' + this.hms(dt) + '-' + this.safe(label) + '-' + String(d.id).slice(-4) + '.html';
    return { dt, day, time: this.pad(dt.getHours()) + ':' + this.pad(dt.getMinutes()), label, party, count,
      total: DB.round(total), paid: DB.round(paid), rem: DB.round(total - paid), file };
  },

  csvCell(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; },
  csvRow(a){ return a.map(v => this.csvCell(v)).join(',') + '\r\n'; },
  CSV_HEAD: ['التاريخ','الوقت','النوع','الطرف','عدد الأصناف','الإجمالي','المدفوع/المستلم','الباقي','ملف الفاتورة'],
  docRow(i){ return this.csvRow([this.ymd(i.dt), i.time, i.label, i.party, i.count, i.total, i.paid, i.rem, i.file]); },
  listCsv(name){
    if (name === 'products') return '\ufeff' + this.csvRow(['الكود','الصنف','سعر الشراء','سعر البيع','الكمية','الحد الأدنى','قيمة المخزون']) +
      DB.list('products').map(p => this.csvRow([p.code, p.name, p.buy || 0, p.price || 0, p.qty || 0, p.min || 0, DB.round((p.qty || 0) * (p.buy || 0))])).join('');
    if (name === 'customers') return '\ufeff' + this.csvRow(['العميل','الهاتف','العنوان','الرصيد']) +
      DB.list('customers').map(c => this.csvRow([c.name, c.phone || '', c.address || '', c.balance || 0])).join('');
    return '\ufeff' + this.csvRow(['المورد','الهاتف','العنوان','الرصيد']) +
      DB.list('suppliers').map(c => this.csvRow([c.name, c.phone || '', c.address || '', c.balance || 0])).join('');
  },
  async appendCsv(text, fresh){
    const fh = await this.root.getFileHandle('سجل-المعاملات.csv', { create: true });
    const size = (await fh.getFile()).size;
    if (fresh || size === 0){
      const w = await fh.createWritable();
      await w.write('\ufeff' + this.csvRow(this.CSV_HEAD) + text);
      await w.close();
      return;
    }
    const w = await fh.createWritable({ keepExistingData: true });
    await w.seek(size);
    await w.write(text);
    await w.close();
  },

  html(x, i){
    const e = s => DB.esc(s), d = x.d, M = v => DB.money(v);
    let table = '', rows = [];
    if (x.kind === 'sale' || x.kind === 'purchase'){
      const price = it => x.kind === 'sale' ? it.price : it.cost;
      table = '<table><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>' +
        (d.items || []).map(it => '<tr><td>' + e(it.name) + '</td><td>' + DB.round(it.qty) + '</td><td>' + M(price(it)) + '</td><td>' + M(it.qty * price(it)) + '</td></tr>').join('') + '</table>';
    } else if (x.kind === 'stocktake'){
      table = '<table><tr><th>الصنف</th><th>قبل الجرد</th><th>بعد الجرد</th><th>فرق القيمة</th></tr>' +
        (d.items || []).map(it => '<tr><td>' + e(it.name) + '</td><td>' + DB.round(it.before) + '</td><td>' + DB.round(it.after) + '</td><td>' + M(it.diffValue || 0) + '</td></tr>').join('') + '</table>';
    }
    if (i.party) rows.push([x.kind === 'sale' ? 'العميل' : (x.kind === 'purchase' ? 'المورد' : 'الطرف'), i.party]);
    rows.push(['الإجمالي', M(i.total)]);
    if (x.kind === 'purchase'){
      rows.push([d.isReturn ? 'المستلم من المورد' : 'المدفوع', M(i.paid)]);
      if (i.rem > 0) rows.push([d.isReturn ? 'خُصم من حساب المورد' : 'الباقي للمورد', M(i.rem)]);
    } else if (x.kind === 'sale'){
      if (i.paid > 0) rows.push([d.isReturn ? 'رد نقدي' : 'المدفوع نقداً', M(i.paid)]);
      if (i.rem > 0) rows.push(['الباقي على حساب العميل', M(i.rem)]);
    }
    const img = x.kind === 'purchase' && d.invoiceImg ? '<h3>صورة الفاتورة</h3><img class="inv" src="' + d.invoiceImg + '" alt="">' : '';
    return '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1">' +
'<title>' + e(i.label) + ' - ' + e(this.shop()) + '</title>' +
'<style>body{font-family:Tahoma,Arial,sans-serif;margin:0;padding:16px;color:#222;max-width:720px;margin-inline:auto}' +
'h1{margin:0 0 2px;font-size:1.3rem}.sub{color:#555;margin-bottom:12px}' +
'table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #bbb;padding:7px 8px;text-align:right}th{background:#eee}' +
'.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #ccc;font-weight:700}' +
'.inv{max-width:100%;border:1px solid #ccc}.np{display:block;margin:16px 0;padding:12px;width:100%;font:inherit;font-weight:700;cursor:pointer}' +
'.ft{margin-top:18px;font-size:.8rem;color:#777;text-align:center}' +
'@page{size:A5;margin:10mm}@media print{.np{display:none}}</style></head><body>' +
'<h1>' + e(this.shop()) + '</h1>' +
'<div class="sub">' + e(i.label) + ' — ' + e(i.dt.toLocaleString('ar-EG')) + '</div>' +
table +
rows.map(r => '<div class="row"><span>' + e(r[0]) + '</span><span>' + e(r[1]) + '</span></div>').join('') +
img +
'<button class="np" onclick="window.print()">طباعة</button>' +
'<div class="ft">نسخة محفوظة تلقائياً من برنامج المحاسبة</div></body></html>';
  },

  async flushDocs(){
    if (this.state !== 'ok') return;
    if (this.busy){ this._again = true; return; }
    this.busy = true;
    try {
      const done = new Set(JSON.parse(localStorage.getItem('gs_fs_done') || '[]'));
      const all = this.docs().filter(x => !done.has(x.k));
      this.pending = all.length;
      if (all.length){
        const fresh = done.size === 0;
        const batch = all.slice(0, 40);
        let rows = '';
        for (const x of batch){
          const i = this.info(x);
          const parts = i.file.split('/');
          const dir = await this.sub(parts.slice(0, -1));
          await this.write(dir, parts[parts.length - 1], this.html(x, i));
          rows += this.docRow(i);
          done.add(x.k);
        }
        await this.appendCsv(rows, fresh);
        localStorage.setItem('gs_fs_done', JSON.stringify([...done]));
        this.pending = all.length - batch.length;
      }
      localStorage.setItem('gs_fs_last', new Date().toISOString());
      this.err = '';
    } catch(e){ this.fail(e); }
    finally {
      this.busy = false;
      this.chip();
      if (this.state === 'ok' && (this._again || this.pending > 0)){ this._again = false; setTimeout(() => this.flushDocs(), 60); }
    }
  },

  async flushSnap(){
    if (this.state !== 'ok' || this.busySnap) return;
    this.busySnap = true;
    try {
      const text = JSON.stringify(DB.snapshot());
      await this.write(this.root, 'بيانات-المحل.json', text);
      const daily = await this.sub(['نسخ-يومية']);
      await this.write(daily, 'نسخة-' + this.ymd(new Date()) + '.json', text);
      await this.write(this.root, 'المخزون.csv', this.listCsv('products'));
      await this.write(this.root, 'العملاء.csv', this.listCsv('customers'));
      await this.write(this.root, 'الموردين.csv', this.listCsv('suppliers'));
      await this.prune(daily);
      localStorage.setItem('gs_fs_snap', new Date().toISOString());
      localStorage.setItem('gs_fs_last', new Date().toISOString());
      this.err = '';
    } catch(e){ this.fail(e); }
    finally { this.busySnap = false; this.chip(); }
  },
  async prune(dirH){
    const names = [];
    for await (const [name] of dirH.entries()){ if (/^نسخة-\d{4}-\d{2}-\d{2}\.json$/.test(name)) names.push(name); }
    names.sort();
    while (names.length > this.KEEP_DAILY){ try { await dirH.removeEntry(names.shift()); } catch(e){ break; } }
  },

  fail(e){
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') this.state = 'needs';
    else { this.state = 'error'; this.err = n === 'NotFoundError' ? 'المجلد غير موجود أو تم حذفه' : ((e && e.message) || 'خطأ غير معروف'); }
  },

  lastTxt(key){
    const v = localStorage.getItem(key);
    return v ? new Date(v).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—';
  },
  chipInfo(){
    const name = localStorage.getItem('gs_fs_name') || '';
    switch (this.state){
      case 'ok': return { t: 'محفوظ على الجهاز' + (name ? ' (' + name + ')' : '') + ' — آخر حفظ ' + this.lastTxt('gs_fs_last') + (this.pending ? ' — باقي ' + this.pending : ''), c: '' };
      case 'needs': return { t: 'اضغط هنا لتأكيد إذن الحفظ في المجلد' + (name ? ' (' + name + ')' : ''), c: 'warn' };
      case 'error': return { t: 'تعذر الحفظ في المجلد — اضغط للتفاصيل', c: 'bad' };
      case 'downloads': {
        const lb = localStorage.getItem(DB.K.lastBackup);
        const today = lb && new Date(lb).toDateString() === new Date().toDateString();
        return { t: today ? 'نسخ يدوية — تم حفظ نسخة اليوم' : 'لم تحفظ نسخة اليوم — اضغط', c: today ? '' : 'warn' };
      }
      default: return { t: 'الحفظ على الجهاز غير مفعّل — اضغط للتفعيل', c: 'warn' };
    }
  },
  chip(){
    const el = document.getElementById('fsChip');
    if (!el) return;
    const c = this.chipInfo();
    el.textContent = c.t;
    el.className = 'fs-chip ' + c.c;
    el.onclick = () => this.onChip();
  },
  async onChip(){
    if (this.state === 'needs' && this.dir){
      try {
        if (await this.perm(this.dir, true)){
          await this.openRoot();
          this.state = 'ok';
          this.touch(true);
          UI.toast('تم تفعيل الحفظ في المجلد');
          return;
        }
      } catch(e){ this.fail(e); }
    }
    this.panel();
  },

  panel(){
    const c = this.chipInfo();
    const sup = this.supported();
    const m = UI.modal('<h2>الحفظ في ذاكرة الجهاز</h2>' +
      '<p class="big" style="font-size:1rem">' + DB.esc(c.t) + '</p>' +
      (this.state === 'error' && this.err ? '<p class="hint" style="color:var(--bad)">' + DB.esc(this.err) + '</p>' : '') +
      (this.state === 'ok' ? '<button class="btn ok" id="dnow">حفظ الآن</button>' : '') +
      (sup ? '<button class="btn" id="dchg">' + (this.mode() === 'folder' ? 'تغيير مجلد الحفظ' : 'اختيار مجلد الحفظ') + '</button>' : '<p class="hint">اختيار المجلد غير مدعوم في هذا المتصفح.</p>') +
      (this.dir && this.state !== 'none' ? '<button class="btn gray" id="drest">استعادة من المجلد</button>' : '') +
      '<button class="btn gray" id="dcsv">تصدير سجل المعاملات (Excel)</button>' +
      '<button class="btn gray" id="dbak">نسخة احتياطية (ملف)</button>' +
      (this.mode() === 'folder' ? '<button class="btn bad" id="doff">إيقاف الحفظ في المجلد</button>' : '') +
      '<hr style="margin:12px 0;border:0;border-top:2px dashed var(--line)">' +
      '<p class="hint">إصدار التطبيق: <b>' + DB.esc(this.ver()) + '</b></p>' +
      '<button class="btn gray" id="dupd">تحديث التطبيق ومسح الكاش</button>' +
      '<button class="btn gray" id="dx">رجوع</button>');
    const $ = id => m.querySelector('#' + id);
    $('dx').onclick = () => m.close();
    $('dcsv').onclick = () => this.exportCsv();
    $('dbak').onclick = () => { DB.exportBackup(); this.chip(); };
    $('dupd').onclick = () => { if (typeof hardRefresh === 'function') hardRefresh(); else location.reload(); };
    if ($('dnow')) $('dnow').onclick = async () => { await this.flushDocs(); await this.flushSnap(); UI.toast(this.state === 'ok' ? 'تم الحفظ' : 'تعذر الحفظ', this.state !== 'ok'); m.close(); };
    if ($('dchg')) $('dchg').onclick = async () => {
      try { if (await this.choose()){ m.close(); UI.toast('تم اختيار المجلد'); } }
      catch(e){ UI.toast('تعذر استخدام هذا المجلد', true); }
    };
    if ($('drest')) $('drest').onclick = async () => {
      try {
        if (this.state !== 'ok'){
          if (!(await this.perm(this.dir, true))) return UI.toast('لم يُمنح الإذن', true);
          await this.openRoot(); this.state = 'ok';
        }
        const snap = await this.readJson('بيانات-المحل.json');
        if (!snap || !snap.data) return UI.toast('لا توجد نسخة محفوظة', true);
        const ok = await UI.confirm('سيتم استبدال بيانات الجهاز الحالية. متأكد؟', 'نعم، استعد', 'إلغاء');
        if (!ok) return;
        DB.restoreObject(snap); this.markAllDone();
        UI.toast('تمت الاستعادة'); setTimeout(() => location.reload(), 600);
      } catch(e){ UI.toast('تعذرت الاستعادة', true); }
    };
    if ($('doff')) $('doff').onclick = async () => {
      if (!(await UI.confirm('إيقاف الحفظ التلقائي؟', 'نعم', 'إلغاء'))) return;
      this.setMode('none'); this.state = 'none'; this.dir = null; this.root = null;
      try { await this.kvDel('dir'); } catch(e){}
      this.chip(); m.close();
    };
  },

  exportCsv(){
    let text = '\ufeff' + this.csvRow(this.CSV_HEAD);
    this.docs().forEach(x => { text += this.docRow(this.info(x)); });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = 'سجل-المعاملات-' + this.ymd(new Date()) + '.csv';
    a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 4000);
  }
};
window.Disk = Disk;
