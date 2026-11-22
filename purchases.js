Screens.purchases = {
  cart:{}, q:'', ret:false, supplierId:null, paid:null, invoiceImg:'', _busy:false,
  $(id){ return document.getElementById(id); },
  total(){
    return DB.round(Object.keys(this.cart).reduce((s,id) => s + this.cart[id].qty * this.cart[id].cost, 0));
  },
  prune(){
    const ids = new Set(DB.list('products').map(p => p.id));
    Object.keys(this.cart).forEach(id => { if (!ids.has(id)) delete this.cart[id]; });
  },
  render(el){
    this.prune();
    el.innerHTML = `<button class="btn gray noprint" onclick="go('home')" style="margin-bottom:10px">⬅️ رجوع للرئيسية</button>
      <button class="btn warn" id="retBtn"></button>
      <div class="sale"><section>
        <input class="inp" id="q" placeholder="🔍 اكتب اسم الصنف هنا" value="${DB.esc(this.q)}">
        <div class="grid" id="grid"></div>
        <div class="box" style="margin-top:14px">
          <h2>🧾 صورة الفاتورة</h2>
          <img id="invPrev" class="preview ${this.invoiceImg ? '' : 'hide'}" ${this.invoiceImg ? `src="${this.invoiceImg}"` : ''} alt="">
          <div class="row">
            <button class="btn warn" id="invShoot">📷 تصوير</button>
            <button class="btn gray" id="invPick">🖼️ اختيار</button>
          </div>
          <input type="file" id="invF1" accept="image/*" capture="environment" class="hide">
          <input type="file" id="invF2" accept="image/*" class="hide">
          <button class="btn gray" id="viewInvs">📂 سجل فواتير المشتريات</button>
        </div>
      </section>
      <aside class="cart" id="cart"></aside></div>`;

    this.$('retBtn').onclick = () => { this.ret = !this.ret; this.cart = {}; this.paid = null; this.drawGrid(); this.drawCart(); };
    this.$('q').oninput = e => { this.q = e.target.value; this.drawGrid(); };
    this.$('grid').onclick = e => { const c = e.target.closest('.card'); if (c) this.add(c.dataset.id); };

    this.$('invShoot').onclick = () => this.$('invF1').click();
    this.$('invPick').onclick = () => this.$('invF2').click();
    const onInv = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        this.invoiceImg = await DB.compressImage(f, 640, 0.72);
        this.$('invPrev').src = this.invoiceImg;
        this.$('invPrev').classList.remove('hide');
        UI.toast('تم إرفاق الفاتورة ✔');
      } catch(x){ UI.toast('تعذر قراءة الصورة', true); }
      e.target.value = '';
    };
    this.$('invF1').onchange = onInv;
    this.$('invF2').onchange = onInv;
    this.$('viewInvs').onclick = () => this.showInvoices();

    const cart = this.$('cart');
    cart.onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'del'){ delete this.cart[b.dataset.id]; UI.mark(this.$('grid'), b.dataset.id, 0); this.drawCart(); }
      else if (a === 'sup') this.pickSupplier();
      else if (a === 'save') this.save();
      else if (a === 'top'){ const q = this.$('q'); if (q && q.scrollIntoView) q.scrollIntoView({ behavior:'smooth', block:'center' }); }
    };
    cart.oninput = e => {
      const t = e.target;
      if (t.id === 'paid') this.paid = t.value === '' ? null : (parseFloat(t.value) || 0);
      else if (t.dataset.f && this.cart[t.dataset.id]){
        this.cart[t.dataset.id][t.dataset.f] = parseFloat(t.value) || 0;
        if (t.dataset.f === 'cost') t.classList.toggle('bad', !(this.cart[t.dataset.id].cost > 0));
        else UI.mark(this.$('grid'), t.dataset.id, this.cart[t.dataset.id].qty);
      }
      this.drawTotals();
    };
    this.drawGrid();
    this.drawCart();
  },

  drawGrid(){
    const q = this.q.trim().toLowerCase();
    const list = DB.list('products').filter(p => !q || p.name.toLowerCase().includes(q) || String(p.code).toLowerCase().includes(q));
    this.$('grid').innerHTML = list.length
      ? list.map(p => UI.card(p, false, this.cart[p.id] ? this.cart[p.id].qty : 0)).join('')
      : '<p class="big">لا توجد أصناف. أضفها من المخزون</p>';
  },

  add(id){
    const p = DB.getProduct(id); if (!p) return;
    const cur = this.cart[id];
    if (this.ret && (cur ? cur.qty : 0) + 1 > p.qty) return UI.toast('الكمية لا تكفي للمرتجع', true);
    if (cur) cur.qty = DB.round(cur.qty + 1);
    else this.cart[id] = { qty:1, cost:p.buy || 0 };
    UI.mark(this.$('grid'), id, this.cart[id].qty);
    this.drawCart();
  },

  /* المرتجع يُخصم أولاً من ما علينا للمورد، وما يزيد يُستلم نقداً (بدل افتراض استلام كامل المبلغ نقداً) */
  defPaid(t){
    if (!this.ret) return t;
    const s = this.supInfo(), owed = s ? Math.max(0, Number(s.balance) || 0) : 0;
    return DB.round(Math.max(0, t - owed));
  },
  supInfo(){ return DB.list('suppliers').find(x => x.id === this.supplierId) || null; },
  supName(){ const s = this.supInfo(); return s ? s.name : 'اضغط لاختيار المورد'; },

  drawCart(){
    const r = this.ret, ids = Object.keys(this.cart), s = this.supInfo();
    this.$('retBtn').textContent = r ? '📥 رجوع للشراء العادي' : '↩️ مرتجع شراء';
    const rows = ids.map(id => {
      const p = DB.getProduct(id), c = this.cart[id];
      return `<div class="cline">
        <div class="top">
          <div class="nm">${DB.esc(p.name)}<small>المتاح الآن: ${DB.round(p.qty)} — آخر سعر شراء: ${DB.money(p.buy || 0)}</small></div>
          <button type="button" class="rm" data-act="del" data-id="${id}" aria-label="حذف الصنف">🗑️</button>
        </div>
        <div class="flds">
          <div class="fld"><label>الكمية</label><input class="inp" type="number" inputmode="decimal" step="any" data-id="${id}" data-f="qty" value="${c.qty}"></div>
          <div class="fld"><label>${r ? 'سعر الإرجاع للواحد' : 'سعر الشراء للواحد'}</label><input class="inp${c.cost > 0 ? '' : ' bad'}" type="number" inputmode="decimal" step="any" data-id="${id}" data-f="cost" value="${c.cost}"></div>
        </div>
        <div class="lt"><span>إجمالي الصنف</span><b data-lt="${id}">${DB.money(c.qty * c.cost)}</b></div>
      </div>`;
    }).join('');
    const cart = this.$('cart');
    cart.className = 'cart' + (r ? ' ret' : '');
    cart.innerHTML = `<div class="cart-head"><h2>${r ? '↩️ مرتجع شراء' : '📥 فاتورة شراء'}</h2>
        ${ids.length ? '<button type="button" data-act="top">⬆️ إضافة أصناف</button>' : ''}</div>
      ${rows || '<p class="big">اضغط على صورة الصنف لإضافته</p>'}
      <div class="total" id="tot"></div>
      <button class="btn gray" data-act="sup" id="supBtn">🚚 ${DB.esc(this.supName())}</button>
      ${s ? `<p class="big" style="font-size:.95rem">📞 ${DB.esc(s.phone || '—')} | 📍 ${DB.esc(s.address || '—')}</p>` : ''}
      <label>${r ? 'المبلغ المستلم نقداً من المورد' : 'المبلغ المدفوع الآن'}</label>
      <input class="inp" id="paid" type="number" inputmode="decimal" step="any">
      ${r ? '<p class="hint">ℹ️ المرتجع يُخصم أولاً مما علينا للمورد، وما يزيد عن ذلك يُستلم نقداً وتزيد به الخزنة.</p>' : ''}
      <div class="hint" id="cashNote"></div>
      <div class="big" id="rem"></div>
      <button class="btn ${r ? 'warn' : 'ok'}" data-act="save">✅ ${r ? 'مراجعة وحفظ المرتجع' : 'مراجعة وحفظ الشراء'}</button>`;
    if (this.paid !== null) this.$('paid').value = this.paid;
    this.drawTotals();
  },

  drawTotals(){
    const t = this.total(), paid = this.paid === null ? this.defPaid(t) : this.paid, rem = DB.round(t - paid);
    this.$('tot').textContent = DB.money(t);
    if (this.paid === null) this.$('paid').value = paid || '';
    this.$('rem').textContent = (this.ret ? 'يُخصم من حساب المورد: ' : 'الباقي للمورد: ') + DB.money(rem);
    const cn = this.$('cashNote');
    if (cn){
      const low = !this.ret && paid > DB.getCash();
      cn.textContent = '💰 رصيد الخزنة الآن: ' + DB.money(DB.getCash()) + (low ? ' — ⚠️ المدفوع أكبر من رصيد الخزنة' : '');
      cn.style.color = low ? 'var(--bad)' : '';
      cn.style.fontWeight = low ? '800' : '';
    }
    Object.keys(this.cart).forEach(id => {
      const el = this.$('cart').querySelector('[data-lt="' + id + '"]');
      if (el) el.textContent = DB.money(this.cart[id].qty * this.cart[id].cost);
    });
    UI.cartBar.set({ count: Object.keys(this.cart).length, total: t, label: this.ret ? '↩️ عرض المرتجع والحفظ' : '🧾 عرض الفاتورة والحفظ' });
  },

  pickSupplier(){
    const sups = DB.list('suppliers');
    const m = UI.modal(`<h2>اختر المورد</h2>
      ${sups.map(s => `<button class="btn" data-s="${s.id}">${DB.esc(s.name)}<br><small>${UI.balText('suppliers', s.balance)} ${s.phone ? '— ' + DB.esc(s.phone) : ''}</small></button>`).join('')}
      <button class="btn gray" data-s="">بدون مورد (نقدي)</button>
      <h2>➕ مورد جديد</h2>
      <input class="inp" id="sn" placeholder="الاسم">
      <input class="inp" id="sp" type="tel" placeholder="رقم الهاتف">
      <input class="inp" id="sa" placeholder="العنوان">
      <button class="btn ok" id="sadd">حفظ واختيار</button>
      <button class="btn gray" id="sx">رجوع</button>`);
    const pick = id => { this.supplierId = id || null; m.close(); this.drawCart(); };
    m.querySelectorAll('[data-s]').forEach(b => b.onclick = () => pick(b.dataset.s));
    m.querySelector('#sx').onclick = () => m.close();
    m.querySelector('#sadd').onclick = () => {
      const n = m.querySelector('#sn').value.trim();
      if (!n) return UI.toast('اكتب اسم المورد', true);
      pick(DB.addSupplier({
        name:n,
        phone:m.querySelector('#sp').value.trim(),
        address:m.querySelector('#sa').value.trim(),
        balance:0, notes:''
      }).id);
    };
  },

  /* سجل كل فواتير المشتريات (وليس المصوّرة فقط) — اضغط على أي فاتورة لرؤية الأصناف والكميات والأسعار */
  showInvoices(onlyImg){
    const sups = DB.list('suppliers');
    let list = DB.list('purchases').slice().reverse();
    if (onlyImg) list = list.filter(p => p.invoiceImg);
    const body = list.length ? list.slice(0, 60).map(p => {
      const s = sups.find(x => x.id === p.supplierId);
      const name = (s && s.name) || p.supplierName || 'مورد عام';
      return `<button type="button" class="docrow" data-id="${p.id}">
        <div class="dt"><span>${p.isReturn ? '↩️ مرتجع' : '📥 شراء'} — ${DB.esc(name)}</span><b>${DB.money(p.total)}</b></div>
        <div class="dm">${new Date(p.date).toLocaleString('ar-EG')} • ${(p.items || []).length} صنف${p.invoiceImg ? ' • 🖼️ صورة' : ''}</div></button>`;
    }).join('') : '<p class="big">لا توجد فواتير</p>';
    const m = UI.modal(`<h2>📂 سجل فواتير المشتريات</h2>
      <div class="seg"><button type="button" id="fAll" class="${onlyImg ? '' : 'on'}">الكل</button><button type="button" id="fImg" class="${onlyImg ? 'on' : ''}">🖼️ المصوّرة فقط</button></div>
      ${list.length ? '<p class="hint">اضغط على الفاتورة لعرض الأصناف والكميات والأسعار</p>' : ''}${body}
      <button class="btn gray" id="x">رجوع</button>`);
    m.querySelector('#x').onclick = () => m.close();
    m.querySelector('#fAll').onclick = () => { m.close(); this.showInvoices(false); };
    m.querySelector('#fImg').onclick = () => { m.close(); this.showInvoices(true); };
    m.querySelectorAll('.docrow').forEach(b => b.onclick = () => UI.showDoc('purchase', b.dataset.id));
  },

  /* الخطوة 1: فحص البيانات ثم عرض شاشة المراجعة */
  save(){
    const its = Object.keys(this.cart).map(id => ({ id, qty:this.cart[id].qty, cost:this.cart[id].cost }));
    if (!its.length) return UI.toast('الفاتورة فارغة', true);
    if (its.some(i => !(i.qty > 0))) return UI.toast('راجع الكميات', true);
    if (its.some(i => !(i.cost >= 0))) return UI.toast('راجع الأسعار', true);
    const t = this.total(), paid = DB.round(this.paid === null ? this.defPaid(t) : this.paid);
    if (paid < 0) return UI.toast('المبلغ لا يمكن أن يكون سالبًا', true);
    if (paid > t) return UI.toast('المبلغ أكبر من إجمالي الفاتورة', true);
    if (paid < t && !this.supplierId) return UI.toast('اختر المورد لتسجيل الباقي عليه', true);
    if (!this.ret && paid > DB.getCash()) return UI.toast('رصيد الخزنة (' + DB.money(DB.getCash()) + ') لا يكفي — قلّل المدفوع واترك الباقي على المورد', true);
    if (this.ret && its.some(i => {
      const p = DB.getProduct(i.id);
      return !p || i.qty > p.qty;
    })) return UI.toast('كمية المرتجع أكبر من الموجود', true);

    const s = this.supInfo(), rem = DB.round(t - paid);
    const lines = its.map(i => {
      const p = DB.getProduct(i.id);
      return { name:p.name, qty:i.qty, unit:i.cost, warn: i.cost > 0 ? '' : '⚠️ سعر الشراء = 0' };
    });
    const extra = [
      ['المورد', s ? s.name : 'بدون مورد (نقدي)'],
      [this.ret ? 'المستلم من المورد' : 'المدفوع الآن', DB.money(paid)]
    ];
    if (rem > 0 || this.ret) extra.push([this.ret ? 'يُخصم من حساب المورد' : 'الباقي للمورد', DB.money(rem), rem > 0 ? 'bad' : '']);
    if (s){ const nb = DB.round((Number(s.balance) || 0) + (this.ret ? -rem : rem)); extra.push(['رصيد المورد بعد العملية', UI.balText('suppliers', nb), nb < 0 ? 'bad' : '']); }
    if (this.invoiceImg) extra.push(['صورة الفاتورة', 'مرفقة ✔']);
    UI.confirmInvoice({
      title: this.ret ? '↩️ مراجعة مرتجع الشراء' : '📥 مراجعة فاتورة الشراء',
      lines, total:t, extra, cls: this.ret ? 'warn' : 'ok',
      yes: this.ret ? 'تأكيد حفظ المرتجع نهائياً' : 'تأكيد حفظ الفاتورة نهائياً'
    }).then(ok => { if (ok) this.commit(its, paid, s); });
  },

  /* الخطوة 2: الحفظ النهائي */
  commit(its, paid, s){
    if (this._busy) return;
    this._busy = true;
    try {
      const meta = {
        invoiceImg: this.invoiceImg || '',
        supplierName: s ? s.name : '',
        supplierPhone: s ? s.phone : '',
        supplierAddress: s ? s.address : ''
      };
      const r = this.ret
        ? DB.returnPurchase(this.supplierId, its, paid, meta)
        : DB.completePurchase(this.supplierId, its, paid, meta);
      if (r.error) return UI.toast(r.error, true);

      UI.toast(this.ret ? 'تم حفظ المرتجع ✔' : 'تم حفظ الفاتورة نهائياً ✔');
      this.cart = {}; this.supplierId = null; this.paid = null; this.invoiceImg = '';
      this.render(document.getElementById('app'));
      window.scrollTo(0, 0);
    } finally { this._busy = false; }
  }
};
