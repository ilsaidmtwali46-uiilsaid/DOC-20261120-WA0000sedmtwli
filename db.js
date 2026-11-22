const DB = {
  K: {
    setup:'gs_setup', cash:'gs_cash', products:'gs_products',
    sales:'gs_sales', purchases:'gs_purchases',
    suppliers:'gs_suppliers', customers:'gs_customers',
    draft:'gs_draft', payments:'gs_payments', stocktakes:'gs_stocktakes',
    theme:'gs_theme', license:'gs_license', licenseCheck:'gs_license_check',
    licenseId:'gs_license_id', licenseT:'gs_license_t',
    device:'gs_device', lastBackup:'gs_last_backup', seenAt:'gs_seen_at'
  },
  _tx: null, _txFail: false,

  get(k, d){
    try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); }
    catch(e){ return d; }
  },
  set(k, v){
    try {
      if (this._tx && !(k in this._tx)) this._tx[k] = localStorage.getItem(k);
      localStorage.setItem(k, JSON.stringify(v));
      this.checkStorageDebounced();
      if (window.Disk && this.isDataKey(k)) Disk.touch();
      return true;
    } catch(e){
      if (this._tx) this._txFail = true;           // داخل عملية: نتراجع ونعرض رسالة واحدة من الشاشة
      else alert('الذاكرة ممتلئة! قم بنسخة احتياطية واحذف بعض الصور.');
      return false;
    }
  },

  /* تنفيذ عملية محاسبية كاملة أو لا شيء: لو فشل أي حفظ نرجّع كل المفاتيح كما كانت */
  atomic(fn){
    if (this._tx) return fn();
    const snap = {};
    this._tx = snap; this._txFail = false;
    let res;
    try { res = fn(); }
    catch(e){ console.error(e); this._txFail = true; }
    this._tx = null;
    if (this._txFail){
      this._txFail = false;
      Object.keys(snap).forEach(k => {
        try {
          if (snap[k] === null) localStorage.removeItem(k);
          else localStorage.setItem(k, snap[k]);
        } catch(_){}
      });
      return { error: 'تعذر الحفظ (الذاكرة ممتلئة). لم تُسجَّل العملية — اعمل نسخة احتياطية واحذف بعض الصور.' };
    }
    return res;
  },

  list(name){ return this.get(this.K[name], []); },
  save(name, arr){ return this.set(this.K[name], arr); },
  newId(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2,6); },
  esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  },
  round(n){ return Math.round((Number(n)||0)*100)/100; },
  money(n){
    const v = this.round(n);
    return (Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/,'')) + ' جنيه';
  },

  partyName(key, id, fallback){
    if (!id) return fallback || '—';
    const x = this.list(key).find(i => i.id === id);
    return (x && x.name) ? x.name : (fallback || '—');
  },

  storageSize(){
    let total = 0;
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      total += k.length + (localStorage.getItem(k) || '').length;
    }
    return total;
  },
  checkStorage(){
    const size = this.storageSize() * 2;
    const limit = 5 * 1024 * 1024;
    if (size > limit * 0.85 && !this._warned){
      this._warned = true;
      alert('⚠️ تنبيه: مساحة التخزين تقترب من الامتلاء (' + Math.round(size/1024) + ' كيلوبايت).\nيُنصح بنسخة احتياطية ثم حذف الصور القديمة.');
    }
  },
  checkStorageDebounced(){
    clearTimeout(this._stT);
    this._stT = setTimeout(() => this.checkStorage(), 400);
  },

  /* مفاتيح البيانات التي تدخل في النسخة الاحتياطية (بدون التفعيل ورقم الجهاز) */
  isDataKey(k){
    return typeof k === 'string' && k.startsWith('gs_') &&
      k !== this.K.license && k !== this.K.device && k !== this.K.licenseId && k !== this.K.licenseT && !k.startsWith('gs_fs_');
  },

  /* لقطة كاملة من بيانات المحل (تُستخدم في النسخة الاحتياطية والحفظ على الجهاز) */
  snapshot(){
    const data = {};
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (this.isDataKey(k)){
        try { data[k] = JSON.parse(localStorage.getItem(k)); }
        catch(e){ data[k] = localStorage.getItem(k); }
      }
    }
    return { v:1, at:new Date().toISOString(), data };
  },

  exportBackup(){
    const blob = new Blob([JSON.stringify(this.snapshot(), null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    a.href = url;
    a.download = 'نسخة-احتياطية-' + stamp + '.json';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
    this.set(this.K.lastBackup, new Date().toISOString());
    if (window.UI) UI.toast('تم تجهيز النسخة الاحتياطية ✔');
  },

  /* استبدال كل بيانات المحل بمحتوى نسخة (مع التراجع لو فشل الحفظ) */
  restoreObject(obj){
    if (!obj || obj.v !== 1 || !obj.data || typeof obj.data !== 'object') throw new Error('ملف غير صالح');
    const keys = Object.keys(obj.data).filter(k => this.isDataKey(k));
    if (!keys.length) throw new Error('ملف غير صالح');
    const old = {};
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (this.isDataKey(k)) old[k] = localStorage.getItem(k);
    }
    try {
      Object.keys(old).forEach(k => localStorage.removeItem(k));
      keys.forEach(k => localStorage.setItem(k, JSON.stringify(obj.data[k])));
    } catch(e){
      keys.forEach(k => localStorage.removeItem(k));
      Object.keys(old).forEach(k => { try { localStorage.setItem(k, old[k]); } catch(_){} });
      throw new Error('full');
    }
    return true;
  },

  async importBackup(file){
    const obj = JSON.parse(await file.text());
    if (!obj || obj.v !== 1 || !obj.data || typeof obj.data !== 'object') throw new Error('ملف غير صالح');
    if (!await UI.confirm('سيتم استبدال كل البيانات الحالية. متأكد؟', 'نعم، استعد', 'إلغاء')) return false;
    return this.restoreObject(obj);
  },

  isSetupDone(){ return this.get(this.K.setup, false) === true; },
  finishSetup(){ this.set(this.K.setup, true); localStorage.removeItem(this.K.draft); },

  getCash(){ return Number(this.get(this.K.cash, 0)) || 0; },
  setCash(n){ this.set(this.K.cash, Number(n) || 0); },
  addCash(n){ this.setCash(this.round(this.getCash() + n)); },

  generateProductCode(list){
    let max = 1000;
    (list || this.list('products')).forEach(p => {
      const n = parseInt(String(p.code).replace(/\D/g,''), 10);
      if (n > max) max = n;
    });
    return 'PRD-' + (max + 1);
  },
  getProduct(id){ return this.list('products').find(p => p.id === id); },
  addProduct(p){
    const all = this.list('products');
    p.id = p.id || this.newId('p');
    p.code = p.code || this.generateProductCode(all);
    all.push(p); this.save('products', all); return p;
  },
  updateProduct(id, changes){
    const all = this.list('products'), i = all.findIndex(p => p.id === id);
    if (i < 0) return null;
    Object.assign(all[i], changes);
    this.save('products', all); return all[i];
  },

  addSupplier(s){
    const a = this.list('suppliers');
    s.id = s.id || this.newId('s');
    a.push(s); this.save('suppliers', a); return s;
  },
  addCustomer(c){
    const a = this.list('customers');
    c.id = c.id || this.newId('c');
    a.push(c); this.save('customers', a); return c;
  },
  addBalance(name, id, delta){
    const a = this.list(name), x = a.find(i => i.id === id);
    if (!x) return false;
    x.balance = this.round((Number(x.balance) || 0) + delta);
    this.save(name, a);
    return true;
  },
  partyHasOps(key, id){
    const sales = key === 'customers' && this.list('sales').some(s => s.customerId === id);
    const purs = key === 'suppliers' && this.list('purchases').some(p => p.supplierId === id);
    const pays = this.get(this.K.payments, []).some(p => p.party === id && p.kind === key);
    return !!(sales || purs || pays);
  },

  /* ============ المبيعات ============ */
  completeSale(items, type, customerId){
    return this.atomic(() => {
      if (!items || !items.length) return { error: 'الفاتورة فارغة' };
      if (type !== 'cash' && !this.list('customers').some(c => c.id === customerId)) return { error: 'العميل غير موجود' };
      const prods = this.list('products');
      let total = 0;
      const lines = [], missing = [];
      for (const it of items){
        const qty = Number(it.qty);
        if (!(qty > 0)) return { error: 'كمية غير صحيحة' };
        const p = prods.find(x => x.id === it.id);
        if (!p) { missing.push(it.id); continue; }
        if ((Number(p.qty) || 0) < qty) return { error: 'الكمية المتاحة لا تكفي: ' + p.name };
        p.qty = this.round((Number(p.qty) || 0) - qty);
        total += p.price * qty;
        lines.push({ productId:p.id, code:p.code, name:p.name, qty, price:p.price, cost:p.buy });
      }
      if (missing.length) return { error: 'أصناف غير موجودة في المخزون', missing };
      total = this.round(total);
      this.save('products', prods);
      if (type === 'cash') this.addCash(total);
      else this.addBalance('customers', customerId, total);
      const sales = this.list('sales');
      const sale = { id:this.newId('sale'), date:new Date().toISOString(), type, customerId:customerId||null, items:lines, total };
      sales.push(sale); this.save('sales', sales);
      return { sale };
    });
  },
  returnSale(items, type, customerId){
    return this.atomic(() => {
      if (!items || !items.length) return { error: 'الفاتورة فارغة' };
      if (type !== 'cash' && !this.list('customers').some(c => c.id === customerId)) return { error: 'العميل غير موجود' };
      const prods = this.list('products');
      let total = 0;
      const lines = [], missing = [];
      for (const it of items){
        const qty = Number(it.qty);
        if (!(qty > 0)) return { error: 'كمية غير صحيحة' };
        const p = prods.find(x => x.id === it.id);
        if (!p) { missing.push(it.id); continue; }
        p.qty = this.round((Number(p.qty) || 0) + qty);
        total += p.price * qty;
        lines.push({ productId:p.id, code:p.code, name:p.name, qty, price:p.price, cost:p.buy });
      }
      if (missing.length) return { error: 'أصناف غير موجودة في المخزون', missing };
      total = this.round(total);
      if (type === 'cash' && total > this.getCash()) return { error: 'رصيد الخزنة لا يكفي لرد المبلغ (المتاح ' + this.money(this.getCash()) + ')' };
      this.save('products', prods);
      if (type === 'cash') this.addCash(-total);
      else this.addBalance('customers', customerId, -total);
      const a = this.list('sales');
      const r = { id:this.newId('ret'), date:new Date().toISOString(), isReturn:true, type, customerId:customerId||null, items:lines, total };
      a.push(r); this.save('sales', a);
      return { sale: r };
    });
  },

  /* ============ المشتريات ============ */
  completePurchase(supplierId, items, paid, meta){
    return this.atomic(() => {
      if (!items || !items.length) return { error: 'الفاتورة فارغة' };
      if (supplierId && !this.list('suppliers').some(s => s.id === supplierId)) return { error: 'المورد غير موجود' };
      const prods = this.list('products');
      let total = 0;
      const lines = [], missing = [];
      for (const it of items){
        const qty = Number(it.qty), cost = Number(it.cost);
        if (!(qty > 0) || !(cost >= 0)) return { error: 'راجع الكميات والأسعار' };
        const p = prods.find(x => x.id === it.id);
        if (!p) { missing.push(it.id); continue; }
        const oldQty = Math.max(0, Number(p.qty) || 0);
        const newQty = oldQty + qty;
        p.qty = this.round((Number(p.qty) || 0) + qty);
        p.buy = this.round(((oldQty * (Number(p.buy) || 0)) + (qty * cost)) / (newQty || 1));
        total += cost * qty;
        lines.push({ productId:p.id, name:p.name, qty, cost });
      }
      if (missing.length) return { error: 'أصناف غير موجودة في المخزون', missing };
      total = this.round(total);
      paid = this.round(paid);
      if (paid < 0 || paid > total) return { error: 'المبلغ المدفوع غير صحيح' };
      if (paid < total && !supplierId) return { error: 'اختر المورد لتسجيل الباقي عليه' };
      if (paid > this.getCash()) return { error: 'رصيد الخزنة لا يكفي (المتاح ' + this.money(this.getCash()) + '). قلّل المبلغ المدفوع واترك الباقي على المورد.' };
      this.save('products', prods);
      this.addCash(-paid);
      if (supplierId) this.addBalance('suppliers', supplierId, total - paid);
      const a = this.list('purchases');
      const pur = Object.assign({
        id:this.newId('pur'), date:new Date().toISOString(),
        supplierId:supplierId||null, items:lines, total, paid, received:0
      }, meta || {});
      a.push(pur); this.save('purchases', a);
      return { purchase: pur };
    });
  },
  returnPurchase(supplierId, items, received, meta){
    return this.atomic(() => {
      if (!items || !items.length) return { error: 'الفاتورة فارغة' };
      if (supplierId && !this.list('suppliers').some(s => s.id === supplierId)) return { error: 'المورد غير موجود' };
      const prods = this.list('products');
      let total = 0;
      const lines = [], missing = [];
      for (const it of items){
        const qty = Number(it.qty), cost = Number(it.cost);
        if (!(qty > 0) || !(cost >= 0)) return { error: 'راجع الكميات والأسعار' };
        const p = prods.find(x => x.id === it.id);
        if (!p) { missing.push(it.id); continue; }
        if ((Number(p.qty) || 0) < qty) return { error: 'كمية المرتجع أكبر من الموجود: ' + p.name };
        p.qty = this.round((Number(p.qty) || 0) - qty);
        total += cost * qty;
        lines.push({ productId:p.id, name:p.name, qty, cost });
      }
      if (missing.length) return { error: 'أصناف غير موجودة في المخزون', missing };
      total = this.round(total);
      received = this.round(received);
      if (received < 0 || received > total) return { error: 'المبلغ المستلم غير صحيح' };
      if (received < total && !supplierId) return { error: 'اختر المورد لتسجيل الباقي عليه' };
      this.save('products', prods);
      this.addCash(received);
      if (supplierId) this.addBalance('suppliers', supplierId, -(total - received));
      const a = this.list('purchases');
      const r = Object.assign({
        id:this.newId('pret'), date:new Date().toISOString(),
        isReturn:true, supplierId:supplierId||null, items:lines,
        total, received
      }, meta || {});
      a.push(r); this.save('purchases', a);
      return { purchase: r };
    });
  },

  getTheme(){ return this.get(this.K.theme, { name:'sage' }); },
  setTheme(t){ this.set(this.K.theme, t); },

  compressImage(file, max=360, quality=0.7){
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const r = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * r);
          c.height = Math.round(img.height * r);
          const x = c.getContext('2d');
          x.fillStyle = '#fff';
          x.fillRect(0, 0, c.width, c.height);
          x.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
};
window.DB = DB;
