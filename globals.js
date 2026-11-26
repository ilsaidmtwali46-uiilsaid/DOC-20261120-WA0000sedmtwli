window.Screens = {};
window.UI = {
  toast(msg, bad){
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  },
  modal(html){
    const b = document.createElement('div');
    b.className = 'backdrop';
    b.innerHTML = '<div class="modal">' + html + '</div>';
    document.body.appendChild(b);
    b.close = () => b.remove();
    return b;
  },
  confirm(msg, yes='نعم', no='لا'){
    return new Promise(res => {
      const m = UI.modal(`<p class="big">${msg}</p><div class="row"><button class="btn ok" id="y">${yes}</button><button class="btn bad" id="n">${no}</button></div>`);
      m.querySelector('#y').onclick = () => { m.close(); res(true); };
      m.querySelector('#n').onclick = () => { m.close(); res(false); };
    });
  },

  /* نص رصيد عميل/مورد: الموجب = دين، والسالب = رصيد دائن (بدل عرض رقم سالب غامض) */
  balText(kind, v){
    v = DB.round(v);
    if (kind === 'customers') return v >= 0 ? 'عليه لنا: ' + DB.money(v) : 'رصيد دائن له عندنا: ' + DB.money(-v);
    return v >= 0 ? 'له علينا: ' + DB.money(v) : 'رصيد دائن لنا عنده: ' + DB.money(-v);
  },

  /* بطاقة صنف: inCart = الكمية المضافة للفاتورة (تظهر علامة ✔ فوق البطاقة) */
  card(p, withDel, inCart){
    const q = Number(p.qty) || 0;
    const mn = Number(p.min) || 0;
    const cls = q <= 0 ? 'out' : (q <= mn ? 'low' : '');
    const warn = q <= 0 ? '⛔ نفذت' : (q <= mn ? '⚠️ قليلة: ' + q : 'المتاح: ' + q);
    const inc = Number(inCart) || 0;
    return `<div class="card ${cls}${inc > 0 ? ' sel' : ''}" data-id="${p.id}">
      ${inc > 0 ? `<span class="inc">✔ ${inc}</span>` : ''}
      ${p.img ? `<img src="${p.img}" alt="">` : '<div class="noimg">📦</div>'}
      <div class="code">${DB.esc(p.code)}</div>
      <div class="name">${DB.esc(p.name)}</div>
      <div class="price">${DB.money(p.price)}</div>
      <div class="qty">${warn}</div>
      ${withDel ? `<button type="button" class="xdel" data-del="${p.id}">🗑️ حذف</button>` : ''}</div>`;
  },
  /* تحديث علامة الكمية على بطاقة واحدة بدون إعادة رسم الشبكة */
  mark(grid, id, qty){
    const c = grid && grid.querySelector('.card[data-id="' + id + '"]');
    if (!c) return;
    let b = c.querySelector('.inc');
    if (qty > 0){
      if (!b){ b = document.createElement('span'); b.className = 'inc'; c.insertBefore(b, c.firstChild); }
      b.textContent = '✔ ' + qty;
      c.classList.add('sel');
    } else {
      if (b) b.remove();
      c.classList.remove('sel');
    }
  },

  /* شريط سفلي ثابت: عدد الأصناف والإجمالي + زر للنزول لقائمة الفاتورة. يختفي تلقائياً لما الفاتورة تكون ظاهرة */
  cartBar: {
    el: null, io: null, want: false,
    set(o){
      if (!o || !o.count) return this.hide();
      if (!this.el){
        this.el = document.createElement('div');
        this.el.className = 'cartbar hide';
        document.body.appendChild(this.el);
      }
      this.el.innerHTML = `<div class="cb-info"><b>${o.count} ${o.count === 1 ? 'صنف' : 'أصناف'}</b><span>${DB.money(o.total)}</span></div>` +
        `<button type="button">${o.label || '🧾 عرض الفاتورة والحفظ'}</button>`;
      this.el.querySelector('button').onclick = () => {
        const c = document.getElementById('cart');
        if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      this.want = true;
      this.watch();
    },
    watch(){
      const c = document.getElementById('cart');
      if (!c) return this.hide();
      if (typeof IntersectionObserver === 'undefined') return this.show(true);
      if (this.io) this.io.disconnect();
      this.io = new IntersectionObserver(es => this.show(!es[0].isIntersecting), { rootMargin: '0px 0px -90px 0px', threshold: 0 });
      this.io.observe(c);
    },
    show(on){
      if (!this.el) return;
      const v = !!(on && this.want);
      this.el.classList.toggle('hide', !v);
      document.body.classList.toggle('has-cartbar', v);
    },
    hide(){
      this.want = false;
      if (this.io) { this.io.disconnect(); this.io = null; }
      if (this.el) this.el.classList.add('hide');
      document.body.classList.remove('has-cartbar');
    }
  },

  /* مراجعة الفاتورة قبل الحفظ النهائي: كل صنف بالكمية والسعر والإجمالي */
  confirmInvoice(o){
    return new Promise(res => {
      const rows = o.lines.map(l => `<div class="irow${l.warn ? ' warnrow' : ''}">
          <div class="inm">${DB.esc(l.name)}${l.warn ? `<small class="bad">${DB.esc(l.warn)}</small>` : ''}</div>
          <div class="iq">${DB.round(l.qty)} × ${DB.money(l.unit)}</div>
          <div class="it">${DB.money(l.qty * l.unit)}</div></div>`).join('');
      const extra = (o.extra || []).map(e => `<div class="srow ${e[2] || ''}"><span>${DB.esc(e[0])}</span><b>${DB.esc(e[1])}</b></div>`).join('');
      const m = UI.modal(`<h2>${o.title}</h2><div class="ilist">${rows}</div>
        <div class="itotal"><span>الإجمالي</span><b>${DB.money(o.total)}</b></div>${extra}
        <button class="btn ${o.cls || 'ok'}" id="cy" style="margin-top:10px">✅ ${o.yes || 'تأكيد الحفظ النهائي'}</button>
        <button class="btn gray" id="cn2">↩️ رجوع للتعديل</button>`);
      m.querySelector('#cy').onclick = e => { e.target.disabled = true; m.close(); res(true); };
      m.querySelector('#cn2').onclick = () => { m.close(); res(false); };
    });
  },

  /* عرض تفاصيل فاتورة محفوظة (بيع أو شراء) بالأصناف والكميات والأسعار */
  showDoc(kind, id){
    const sale = kind === 'sale';
    const d = DB.list(sale ? 'sales' : 'purchases').find(x => x.id === id);
    if (!d) return UI.toast('لم يتم العثور على الفاتورة', true);
    const party = sale
      ? (d.customerId ? DB.partyName('customers', d.customerId) : '')
      : (d.supplierId ? DB.partyName('suppliers', d.supplierId, d.supplierName) : (d.supplierName || ''));
    const title = sale
      ? (d.isReturn ? '↩️ مرتجع بيع' : d.type === 'cash' ? '🛒 بيع نقدي' : '📒 بيع آجل')
      : (d.isReturn ? '↩️ مرتجع شراء' : '📥 فاتورة شراء');
    const lines = (d.items || []).map(i => `<div class="irow">
        <div class="inm">${DB.esc(i.name)}</div>
        <div class="iq">${DB.round(i.qty)} × ${DB.money(sale ? i.price : i.cost)}</div>
        <div class="it">${DB.money(i.qty * (sale ? i.price : i.cost))}</div></div>`).join('');
    const extra = [];
    if (party) extra.push([sale ? 'العميل' : 'المورد', party]);
    if (!sale){
      const pd = d.isReturn ? (d.received || 0) : (d.paid || 0);
      extra.push([d.isReturn ? 'المستلم من المورد' : 'المدفوع', DB.money(pd)]);
      const rem = DB.round((d.total || 0) - pd);
      if (rem > 0) extra.push([d.isReturn ? 'خُصم من حساب المورد' : 'الباقي للمورد', DB.money(rem), 'bad']);
    }
    const ex = extra.map(e => `<div class="srow ${e[2] || ''}"><span>${DB.esc(e[0])}</span><b>${DB.esc(e[1])}</b></div>`).join('');
    const m = UI.modal(`<h2>${title}</h2>
      <p class="hint">${new Date(d.date).toLocaleString('ar-EG')}</p>
      <div class="ilist">${lines || '<p class="big" style="padding:10px">لا توجد تفاصيل أصناف</p>'}</div>
      <div class="itotal"><span>الإجمالي</span><b>${DB.money(d.total)}</b></div>${ex}
      ${d.invoiceImg ? `<img class="invimg" src="${d.invoiceImg}" style="width:100%;max-height:260px;object-fit:contain;border-radius:10px;margin-top:8px;cursor:zoom-in" alt="">` : ''}
      <button class="btn gray" id="dx" style="margin-top:10px">رجوع</button>`);
    m.querySelector('#dx').onclick = () => m.close();
    const im = m.querySelector('.invimg');
    if (im) im.onclick = () => {
      const z = UI.modal(`<img src="${im.src}" style="width:100%;border-radius:10px" alt=""><button class="btn gray" id="zx" style="margin-top:10px">رجوع</button>`);
      z.querySelector('#zx').onclick = () => z.close();
    };
  }
};
