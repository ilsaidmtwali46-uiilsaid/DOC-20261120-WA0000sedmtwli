Screens.purchases = {
  cart:{}, q:'', ret:false, supplierId:null, paid:null, invoiceImg:'', _busy:false,
  payPlan:'once', installmentsCount:2, collectionDates:[], returnPayMethod:'cash', returnCollectionDate:'',
  $(id){ return document.getElementById(id); },

  todayStr(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  },
  addMonthsStr(dateStr, months){
    const base = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
    base.setMonth(base.getMonth() + months);
    return base.getFullYear() + '-' + String(base.getMonth()+1).padStart(2,'0') + '-' + String(base.getDate()).padStart(2,'0');
  },
  ensureDates(){
    if (!this.returnCollectionDate) this.returnCollectionDate = this.addMonthsStr(this.todayStr(), 1);
    if (this.payPlan === 'once'){
      if (!this.collectionDates.length) this.collectionDates = [this.addMonthsStr(this.todayStr(), 1)];
    } else {
      const cnt = Math.max(2, parseInt(this.installmentsCount, 10) || 2);
      this.installmentsCount = cnt;
      const start = this.collectionDates[0] || this.addMonthsStr(this.todayStr(), 1);
      const next = [];
      for (let i = 0; i < cnt; i++){
        next.push(this.collectionDates[i] || this.addMonthsStr(start, i));
      }
      this.collectionDates = next;
    }
  },

  total(){
    return DB.round(Object.keys(this.cart).reduce((s,id) => s + this.cart[id].qty * this.cart[id].cost, 0));
  },
  prune(){
    const ids = new Set(DB.list('products').map(p => p.id));
    Object.keys(this.cart).forEach(id => { if (!ids.has(id)) delete this.cart[id]; });
  },
  render(el){
    this.prune();
    this.ensureDates();
    el.innerHTML = `<div class="row noprint" style="margin-bottom:10px">
        <button class="btn gray" onclick="go('home')" style="margin:0">⬅️ رجوع للرئيسية</button>
        <button class="btn ${this.ret ? 'ok' : 'warn'}" onclick="openQuick('purchases', {ret:${!this.ret}})" style="margin:0">${this.ret ? '📥 الانتقال لفواتير المشتريات' : '↩️ الانتقال لمرتجع المشتريات'}</button>
      </div>
      <div class="sale"><section>
        <div class="row" style="margin-bottom:4px">
          <input class="inp" style="margin:0" id="q" placeholder="🔍 اكتب اسم الصنف هنا" value="${DB.esc(this.q)}">
          <button type="button" class="btn ok" id="addItemBtn" style="flex:none;width:auto;margin:0;padding:11px 16px">➕ صنف</button>
        </div>
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


    this.$('q').oninput = e => { this.q = e.target.value; this.drawGrid(); };
    this.$('addItemBtn').onclick = () => this.openQuickAddItem();
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
      else if (a === 'planOnce'){ this.payPlan = 'once'; this.ensureDates(); this.drawCart(); }
      else if (a === 'planInst'){ this.payPlan = 'installments'; this.ensureDates(); this.drawCart(); }
      else if (a === 'save') this.save();
      else if (a === 'top'){ const q = this.$('q'); if (q && q.scrollIntoView) q.scrollIntoView({ behavior:'smooth', block:'center' }); }
    };
    cart.oninput = e => {
      const t = e.target;
      if (t.id === 'paid') this.paid = t.value === '' ? null : (parseFloat(t.value) || 0);
      else if (t.id === 'instCount'){
        this.installmentsCount = Math.max(2, parseInt(t.value, 10) || 2);
        this.ensureDates();
        this.renderDatesBox();
      } else if (t.dataset.cdate !== undefined){
        const idx = parseInt(t.dataset.cdate, 10);
        this.collectionDates[idx] = t.value;
      } else if (t.id === 'retPayMethod'){
        this.returnPayMethod = t.value;
      } else if (t.id === 'retColDate'){
        this.returnCollectionDate = t.value;
      } else if (t.dataset.f && this.cart[t.dataset.id]){
        this.cart[t.dataset.id][t.dataset.f] = parseFloat(t.value) || 0;
        if (t.dataset.f === 'cost') t.classList.toggle('bad', !(this.cart[t.dataset.id].cost > 0));
        else UI.mark(this.$('grid'), t.dataset.id, this.cart[t.dataset.id].qty);
      }
      this.drawTotals();
    };
    this.drawGrid();
    this.drawCart();
  },

  openQuickAddItem(){
    const qName = (this.$('q') && this.$('q').value.trim()) || '';
    const code = DB.generateProductCode();
    const m = UI.modal(`<h2>➕ إضافة صنف للفاتورة</h2>
      <div class="codebox">${DB.esc(code)}</div>
      <label>اسم الصنف</label><input class="inp" id="qn" value="${DB.esc(qName)}" placeholder="مثال: سكر 1 كجم">
      <label>سعر الشراء (سعر الوحدة)</label><input class="inp" id="qb" type="number" inputmode="decimal" step="any" placeholder="0">
      <label>سعر البيع</label><input class="inp" id="qs" type="number" inputmode="decimal" step="any" placeholder="0">
      <label>الكمية المبدئية (العدد)</label><input class="inp" id="qq" type="number" inputmode="decimal" step="any" value="1">
      <button class="btn ok" id="qsave">💾 حفظ وإضافة للفاتورة</button>
      <button class="btn gray" id="qcancel">إلغاء</button>`);
    m.querySelector('#qcancel').onclick = () => m.close();
    m.querySelector('#qsave').onclick = () => {
      const name = m.querySelector('#qn').value.trim();
      const cost = parseFloat(m.querySelector('#qb').value) || 0;
      const price = parseFloat(m.querySelector('#qs').value);
      const qty = Math.max(1, parseFloat(m.querySelector('#qq').value) || 1);
      if (!name || isNaN(price)) return UI.toast('اكتب اسم الصنف وسعر البيع', true);
      const prod = DB.addProduct({ code, name, img:'', buy:cost, price, qty:0, min:5 });
      this.cart[prod.id] = { qty, cost, buyPrice:cost };
      m.close();
      this.drawGrid();
      this.drawCart();
      UI.toast('تمت إضافة الصنف ✔');
    };
  },

  drawGrid(){
    const q = this.q.trim().toLowerCase();
    const list = DB.list('products').filter(p => !q || p.name.toLowerCase().includes(q) || String(p.code).toLowerCase().includes(q));
    this.$('grid').innerHTML = list.length
      ? list.map(p => UI.card(p, false, this.cart[p.id] ? this.cart[p.id].qty : 0)).join('')
      : '<p class="big">لا توجد أصناف. أضفها من المخزون أو اضغط + صنف</p>';
  },

  add(id){
    const p = DB.getProduct(id); if (!p) return;
    const cur = this.cart[id];
    if (this.ret && (cur ? cur.qty : 0) + 1 > p.qty) return UI.toast('الكمية لا تكفي للمرتجع', true);
    if (cur) cur.qty = DB.round(cur.qty + 1);
    else this.cart[id] = { qty:1, cost:p.buy || 0, buyPrice:p.buy || 0 };
    UI.mark(this.$('grid'), id, this.cart[id].qty);
    this.drawCart();
  },

  defPaid(t){
    if (!this.ret) return t;
    const s = this.supInfo(), owed = s ? Math.max(0, Number(s.balance) || 0) : 0;
    return DB.round(Math.max(0, t - owed));
  },
  supInfo(){ return DB.list('suppliers').find(x => x.id === this.supplierId) || null; },
  supName(){ const s = this.supInfo(); return s ? s.name : 'اضغط لاختيار المورد'; },

  renderDatesBox(){
    const box = this.$('datesBox');
    if (!box) return;
    this.ensureDates();
    if (this.payPlan === 'once'){
      box.innerHTML = `<label>تاريخ التحصيل (دفعة واحدة)</label>
        <input class="inp" type="date" data-cdate="0" value="${DB.esc(this.collectionDates[0] || '')}">`;
    } else {
      const inputs = this.collectionDates.map((dt, i) => `
        <label>تاريخ تحصيل الدفعة (${i + 1})</label>
        <input class="inp" type="date" data-cdate="${i}" value="${DB.esc(dt)}">
      `).join('');
      box.innerHTML = `<label>عدد الدفعات</label>
        <input class="inp" id="instCount" type="number" min="2" max="60" step="1" value="${this.installmentsCount}">
        ${inputs}`;
    }
  },

  drawCart(){
    const r = this.ret, ids = Object.keys(this.cart), s = this.supInfo();
    this.ensureDates();


    const rows = ids.map(id => {
      const p = DB.getProduct(id), c = this.cart[id];
      const buyUnit = c.buyPrice !== undefined ? c.buyPrice : (p.buy || 0);
      if (r){
        return `<div class="cline">
          <div class="top">
            <div class="nm">${DB.esc(p.name)}<small>المتاح: ${DB.round(p.qty)} — سعر شراء الوحدة: ${DB.money(buyUnit)}</small></div>
            <button type="button" class="rm" data-act="del" data-id="${id}" aria-label="حذف الصنف">🗑️</button>
          </div>
          <div class="flds">
            <div class="fld"><label>العدد</label><input class="inp" type="number" inputmode="decimal" step="any" data-id="${id}" data-f="qty" value="${c.qty}"></div>
            <div class="fld"><label>سعر شراء الوحدة</label><input class="inp" type="number" inputmode="decimal" step="any" disabled value="${buyUnit}"></div>
            <div class="fld"><label>سعر المرتجع للوحدة</label><input class="inp${c.cost > 0 ? '' : ' bad'}" type="number" inputmode="decimal" step="any" data-id="${id}" data-f="cost" value="${c.cost}"></div>
          </div>
          <div class="lt"><span>إجمالي الصنف</span><b data-lt="${id}">${DB.money(c.qty * c.cost)}</b></div>
        </div>`;
      }
      return `<div class="cline">
        <div class="top">
          <div class="nm">${DB.esc(p.name)}<small>المتاح الآن: ${DB.round(p.qty)} — آخر سعر شراء: ${DB.money(p.buy || 0)}</small></div>
          <button type="button" class="rm" data-act="del" data-id="${id}" aria-label="حذف الصنف">🗑️</button>
        </div>
        <div class="flds">
          <div class="fld"><label>سعر الوحدة</label><input class="inp${c.cost > 0 ? '' : ' bad'}" type="number" inputmode="decimal" step="any" data-id="${id}" data-f="cost" value="${c.cost}"></div>
          <div class="fld"><label>العدد</label><input class="inp" type="number" inputmode="decimal" step="any" data-id="${id}" data-f="qty" value="${c.qty}"></div>
        </div>
        <div class="lt"><span>إجمالي السعر</span><b data-lt="${id}">${DB.money(c.qty * c.cost)}</b></div>
      </div>`;
    }).join('');

    const cart = this.$('cart');
    cart.className = 'cart' + (r ? ' ret' : '');

    if (r){
      cart.innerHTML = `<div class="cart-head"><h2>↩️ مرتجع مشتريات</h2>
          ${ids.length ? '<button type="button" data-act="top">⬆️ إضافة أصناف</button>' : ''}</div>
        <div class="box" style="margin:0 0 10px 0;padding:10px">
          <label style="margin-top:0">🚚 المورد (اختيار أو إضافة مورد)</label>
          <button type="button" class="btn ${s ? 'ok' : 'gray'}" data-act="sup" id="supBtn" style="margin:4px 0">🚚 ${DB.esc(this.supName())}</button>
          ${s ? `<p class="big" style="font-size:.95rem;margin:4px 0 0">📞 ${DB.esc(s.phone || '—')} | 📍 ${DB.esc(s.address || '—')}</p>` : ''}
        </div>
        ${rows || '<p class="big">اضغط على صورة الصنف لإضافته</p>'}
        <div class="box" id="summaryBox" style="margin:10px 0"></div>
        <label>المبلغ المستلم نقداً من المورد</label>
        <input class="inp" id="paid" type="number" inputmode="decimal" step="any">
        <label>طريقة الدفع</label>
        <select class="inp" id="retPayMethod">
          <option value="cash" ${this.returnPayMethod === 'cash' ? 'selected' : ''}>نقدي</option>
          <option value="credit" ${this.returnPayMethod === 'credit' ? 'selected' : ''}>خصم من حساب المورد / آجل</option>
          <option value="installments" ${this.returnPayMethod === 'installments' ? 'selected' : ''}>على دفعات</option>
        </select>
        <label>تاريخ التحصيل</label>
        <input class="inp" id="retColDate" type="date" value="${DB.esc(this.returnCollectionDate)}">
        <div class="hint" id="cashNote"></div>
        <button class="btn warn" data-act="save">✅ مراجعة وحفظ المرتجع</button>`;
    } else {
      cart.innerHTML = `<div class="cart-head"><h2>📥 فاتورة شراء</h2>
          ${ids.length ? '<button type="button" data-act="top">⬆️ إضافة أصناف</button>' : ''}</div>
        <div class="box" style="margin:0 0 10px 0;padding:10px">
          <label style="margin-top:0">🚚 المورد (اختيار أو إضافة مورد)</label>
          <button type="button" class="btn ${s ? 'ok' : 'gray'}" data-act="sup" id="supBtn" style="margin:4px 0">🚚 ${DB.esc(this.supName())}</button>
          ${s ? `<p class="big" style="font-size:.95rem;margin:4px 0 0">📞 ${DB.esc(s.phone || '—')} | 📍 ${DB.esc(s.address || '—')}</p>` : ''}
        </div>
        ${rows || '<p class="big">اضغط على صورة الصنف لإضافته</p>'}
        <div class="box" id="summaryBox" style="margin:10px 0"></div>
        <label>المدفوع الآن</label>
        <input class="inp" id="paid" type="number" inputmode="decimal" step="any">
        <label>نظام الدفع</label>
        <div class="seg" style="margin-bottom:8px">
          <button type="button" data-act="planOnce" class="${this.payPlan === 'once' ? 'on' : ''}">دفعة واحدة</button>
          <button type="button" data-act="planInst" class="${this.payPlan === 'installments' ? 'on' : ''}">على دفعات</button>
        </div>
        <div id="datesBox"></div>
        <div class="hint" id="cashNote"></div>
        <button class="btn ok" data-act="save">✅ مراجعة وحفظ الشراء</button>`;
      this.renderDatesBox();
    }

    if (this.paid !== null) this.$('paid').value = this.paid;
    this.drawTotals();
  },

  drawTotals(){
    const ids = Object.keys(this.cart);
    const itemsCount = ids.length;
    const t = this.total();
    const paid = this.paid === null ? this.defPaid(t) : this.paid;
    const rem = DB.round(t - paid);
    if (this.paid === null && this.$('paid')) this.$('paid').value = paid || '';

    const sb = this.$('summaryBox');
    if (sb){
      sb.innerHTML = `
        <div class="line"><div class="n">عدد الأصناف</div><b>${itemsCount}</b></div>
        <div class="line"><div class="n">إجمالي المبلغ</div><b style="color:var(--ok)">${DB.money(t)}</b></div>
        <div class="line"><div class="n">${this.ret ? 'المستلم' : 'المدفوع'}</div><b>${DB.money(paid)}</b></div>
        <div class="line"><div class="n">${this.ret ? 'يُخصم من حساب المورد' : 'الباقي'}</div><b style="color:${rem > 0 ? 'var(--bad)' : 'inherit'}">${DB.money(rem)}</b></div>
      `;
    }

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
    UI.cartBar.set({ count: itemsCount, total: t, label: this.ret ? '↩️ عرض المرتجع والحفظ' : '🧾 عرض الفاتورة والحفظ' });
  },

  pickSupplier(){
    const sups = DB.list('suppliers');
    const m = UI.modal(`<h2>🚚 اختر المورد</h2>
      ${sups.length ? sups.map(s => `<button class="btn" data-s="${s.id}">${DB.esc(s.name)}<br><small>${UI.balText('suppliers', s.balance)} ${s.phone ? '— ' + DB.esc(s.phone) : ''}</small></button>`).join('') : '<p class="hint">لا يوجد موردون مسجلون بعد — أضف مورداً جديداً بالأسفل</p>'}
      <h2>➕ إضافة مورد جديد</h2>
      <input class="inp" id="sn" placeholder="اسم المورد (إلزامي)">
      <input class="inp" id="sp" type="tel" placeholder="رقم الهاتف">
      <input class="inp" id="sa" placeholder="العنوان">
      <button class="btn ok" id="sadd">💾 حفظ واختيار المورد</button>
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

  save(){
    this.ensureDates();
    const its = Object.keys(this.cart).map(id => {
      const p = DB.getProduct(id);
      return {
        id,
        qty: this.cart[id].qty,
        cost: this.cart[id].cost,
        buyPrice: this.cart[id].buyPrice !== undefined ? this.cart[id].buyPrice : (p ? (p.buy || 0) : 0)
      };
    });
    if (!its.length) return UI.toast('الفاتورة فارغة', true);
    if (its.some(i => !(i.qty > 0))) return UI.toast('راجع الكميات', true);
    if (its.some(i => !(i.cost >= 0))) return UI.toast('راجع الأسعار', true);
    const t = this.total(), paid = DB.round(this.paid === null ? this.defPaid(t) : this.paid);
    if (paid < 0) return UI.toast('المبلغ لا يمكن أن يكون سالبًا', true);
    if (paid > t) return UI.toast('المبلغ أكبر من إجمالي الفاتورة', true);
    if (!this.supplierId) return UI.toast('يجب اختيار المورد أو إضافة مورد جديد أولاً', true);
    if (!this.ret && paid > DB.getCash()) return UI.toast('رصيد الخزنة (' + DB.money(DB.getCash()) + ') لا يكفي — قلّل المدفوع واترك الباقي على المورد', true);
    if (this.ret && its.some(i => {
      const p = DB.getProduct(i.id);
      return !p || i.qty > p.qty;
    })) return UI.toast('كمية المرتجع أكبر من الموجود', true);

    const s = this.supInfo(), rem = DB.round(t - paid);
    const lines = its.map(i => {
      const p = DB.getProduct(i.id);
      const warn = this.ret
        ? ('سعر شراء الوحدة: ' + DB.money(i.buyPrice))
        : (i.cost > 0 ? '' : '⚠️ سعر الشراء = 0');
      return { name:p.name, qty:i.qty, unit:i.cost, warn };
    });

    const extra = [
      ['عدد الأصناف', String(its.length)],
      ['المورد', s ? s.name : 'بدون مورد (نقدي)'],
      [this.ret ? 'المستلم من المورد' : 'المدفوع الآن', DB.money(paid)]
    ];
    if (rem > 0 || this.ret) extra.push([this.ret ? 'يُخصم من حساب المورد' : 'الباقي', DB.money(rem), rem > 0 ? 'bad' : '']);

    if (this.ret){
      const payLabel = this.returnPayMethod === 'cash' ? 'نقدي' : (this.returnPayMethod === 'installments' ? 'على دفعات' : 'خصم من حساب المورد / آجل');
      extra.push(['طريقة الدفع', payLabel]);
      extra.push(['تاريخ التحصيل', this.returnCollectionDate || '—']);
    } else {
      extra.push(['نظام الدفع', this.payPlan === 'once' ? 'دفعة واحدة' : ('على دفعات (' + this.installmentsCount + ')')]);
      extra.push(['تواريخ التحصيل', (this.collectionDates || []).join(' ، ') || '—']);
    }

    if (s){
      const nb = DB.round((Number(s.balance) || 0) + (this.ret ? -rem : rem));
      extra.push(['رصيد المورد بعد العملية', UI.balText('suppliers', nb), nb < 0 ? 'bad' : '']);
    }
    if (this.invoiceImg) extra.push(['صورة الفاتورة', 'مرفقة ✔']);

    UI.confirmInvoice({
      title: this.ret ? '↩️ مراجعة مرتجع الشراء' : '📥 مراجعة فاتورة الشراء',
      lines, total:t, extra, cls: this.ret ? 'warn' : 'ok',
      yes: this.ret ? 'تأكيد حفظ المرتجع نهائياً' : 'تأكيد حفظ الفاتورة نهائياً'
    }).then(ok => { if (ok) this.commit(its, paid, s); });
  },

  commit(its, paid, s){
    if (this._busy) return;
    this._busy = true;
    try {
      const meta = {
        invoiceImg: this.invoiceImg || '',
        supplierName: s ? s.name : '',
        supplierPhone: s ? s.phone : '',
        supplierAddress: s ? s.address : '',
        paymentPlan: this.ret ? this.returnPayMethod : this.payPlan,
        installmentsCount: this.ret ? 1 : (this.payPlan === 'once' ? 1 : this.installmentsCount),
        collectionDates: this.ret ? [this.returnCollectionDate] : this.collectionDates.slice()
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
