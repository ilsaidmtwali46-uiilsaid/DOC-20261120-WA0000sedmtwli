window.Screens = {};
window.UI = {
  _modals: [],

  /* شريط علوي موحد وثابت: زر الرئيسية + عنوان الصفحة */
  topBar(title, rightHtml){
    return '<div class="sticky-pagebar noprint">' +
      '<button type="button" class="btn gray" onclick="go(\'home\')">الرئيسية</button>' +
      '<div class="page-title">' + DB.esc(title) + '</div>' +
      (rightHtml || '<div class="page-spacer"></div>') +
    '</div>';
  },

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

    let closed = false;
    const close = (fromPop) => {
      if (closed) return;
      closed = true;
      const idx = UI._modals.indexOf(b);
      if (idx >= 0) UI._modals.splice(idx, 1);
      b.remove();
      if (!fromPop && window._Nav && window._Nav.popSilent){
        window._Nav.popSilent();
      }
    };
    b.close = close;
    UI._modals.push(b);
    if (window._Nav && window._Nav.push){
      window._Nav.push('modal');
    }
    return b;
  },

  closeTopModal(){
    if (!UI._modals.length) return false;
    const top = UI._modals[UI._modals.length - 1];
    top.close(true);
    return true;
  },

  confirm(msg, yes='نعم', no='لا'){
    return new Promise(res => {
      const m = UI.modal('<p class="big">' + msg + '</p><div class="row"><button class="btn ok" id="y">' + yes + '</button><button class="btn bad" id="n">' + no + '</button></div>');
      m.querySelector('#y').onclick = () => { m.close(); res(true); };
      m.querySelector('#n').onclick = () => { m.close(); res(false); };
    });
  },
  balText(kind, v){
    v = DB.round(v);
    if (kind === 'customers') return v >= 0 ? 'عليه لنا: ' + DB.money(v) : 'رصيد دائن له عندنا: ' + DB.money(-v);
    return v >= 0 ? 'له علينا: ' + DB.money(v) : 'رصيد دائن لنا عنده: ' + DB.money(-v);
  },
  card(p, withDel, inCart){
    const q = Number(p.qty) || 0;
    const mn = Number(p.min) || 0;
    const cls = q <= 0 ? 'out' : (q <= mn ? 'low' : '');
    const warn = q <= 0 ? 'نفذت' : (q <= mn ? 'قليلة: ' + q : 'المتاح: ' + q);
    const inc = Number(inCart) || 0;
    return '<div class="card ' + cls + (inc > 0 ? ' sel' : '') + '" data-id="' + p.id + '">' +
      (inc > 0 ? '<span class="inc">' + inc + '</span>' : '') +
      (p.img ? '<img src="' + p.img + '" alt="">' : '<div class="noimg">&#128230;</div>') +
      '<div class="code">' + DB.esc(p.code) + '</div>' +
      '<div class="name">' + DB.esc(p.name) + '</div>' +
      '<div class="price">' + DB.money(p.price) + '</div>' +
      '<div class="qty">' + warn + '</div>' +
      (withDel ? '<button type="button" class="xdel" data-del="' + p.id + '">حذف</button>' : '') + '</div>';
  },
  mark(grid, id, qty){
    const c = grid && grid.querySelector('.card[data-id="' + id + '"]');
    if (!c) return;
    let b = c.querySelector('.inc');
    if (qty > 0){
      if (!b){ b = document.createElement('span'); b.className = 'inc'; c.insertBefore(b, c.firstChild); }
      b.textContent = qty;
      c.classList.add('sel');
    } else {
      if (b) b.remove();
      c.classList.remove('sel');
    }
  },
  cartBar: {
    el: null, io: null, want: false,
    set(o){
      if (!o || !o.count) return this.hide();
      if (!this.el){
        this.el = document.createElement('div');
        this.el.className = 'cartbar hide';
        document.body.appendChild(this.el);
      }
      this.el.innerHTML = '<div class="cb-info"><b>' + o.count + ' صنف</b><span>' + DB.money(o.total) + '</span></div>' +
        '<button type="button">' + (o.label || 'عرض الفاتورة') + '</button>';
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
  confirmInvoice(o){
    return new Promise(res => {
      const rows = o.lines.map(l => '<div class="irow' + (l.warn ? ' warnrow' : '') + '">' +
          '<div class="inm">' + DB.esc(l.name) + (l.warn ? '<small class="bad">' + DB.esc(l.warn) + '</small>' : '') + '</div>' +
          '<div class="iq">' + DB.round(l.qty) + ' × ' + DB.money(l.unit) + '</div>' +
          '<div class="it">' + DB.money(l.qty * l.unit) + '</div></div>').join('');
      const extra = (o.extra || []).map(e => '<div class="srow ' + (e[2] || '') + '"><span>' + DB.esc(e[0]) + '</span><b>' + DB.esc(e[1]) + '</b></div>').join('');
      const m = UI.modal('<h2>' + o.title + '</h2><div class="ilist">' + rows + '</div>' +
        '<div class="itotal"><span>الإجمالي</span><b>' + DB.money(o.total) + '</b></div>' + extra +
        '<button class="btn ' + (o.cls || 'ok') + '" id="cy" style="margin-top:10px">' + (o.yes || 'تأكيد') + '</button>' +
        '<button class="btn gray" id="cn2">رجوع</button>');
      m.querySelector('#cy').onclick = e => { e.target.disabled = true; m.close(); res(true); };
      m.querySelector('#cn2').onclick = () => { m.close(); res(false); };
    });
  },
  showDoc(kind, id){
    const sale = kind === 'sale';
    const d = DB.list(sale ? 'sales' : 'purchases').find(x => x.id === id);
    if (!d) return UI.toast('لم يتم العثور على الفاتورة', true);
    const party = sale
      ? (d.customerId ? DB.partyName('customers', d.customerId) : '')
      : (d.supplierId ? DB.partyName('suppliers', d.supplierId, d.supplierName) : (d.supplierName || ''));
    const title = sale
      ? (d.isReturn ? 'مرتجع بيع' : d.type === 'cash' ? 'بيع نقدي' : 'بيع آجل')
      : (d.isReturn ? 'مرتجع شراء' : 'فاتورة شراء');
    const lines = (d.items || []).map(i => '<div class="irow">' +
        '<div class="inm">' + DB.esc(i.name) + '</div>' +
        '<div class="iq">' + DB.round(i.qty) + ' × ' + DB.money(sale ? i.price : i.cost) + '</div>' +
        '<div class="it">' + DB.money(i.qty * (sale ? i.price : i.cost)) + '</div></div>').join('');
    const extra = [];
    if (party) extra.push([sale ? 'العميل' : 'المورد', party]);
    if (sale && !d.isReturn && d.type === 'credit'){
      const pd = Number(d.paid) || 0;
      const rem = d.remaining !== undefined ? Number(d.remaining) : DB.round((d.total || 0) - pd);
      extra.push(['المدفوع نقداً', DB.money(pd)]);
      extra.push(['الباقي على العميل', DB.money(rem), rem > 0 ? 'bad' : '']);
    }
    if (!sale){
      const pd = d.isReturn ? (d.received || 0) : (d.paid || 0);
      extra.push([d.isReturn ? 'المستلم من المورد' : 'المدفوع', DB.money(pd)]);
      const rem = DB.round((d.total || 0) - pd);
      if (rem > 0) extra.push([d.isReturn ? 'خُصم من حساب المورد' : 'الباقي للمورد', DB.money(rem), 'bad']);
    }
    const ex = extra.map(e => '<div class="srow ' + (e[2] || '') + '"><span>' + DB.esc(e[0]) + '</span><b>' + DB.esc(e[1]) + '</b></div>').join('');
    const m = UI.modal('<h2>' + title + '</h2>' +
      '<p class="hint">' + new Date(d.date).toLocaleString('ar-EG') + '</p>' +
      '<div class="ilist">' + (lines || '<p class="big" style="padding:10px">لا توجد تفاصيل أصناف</p>') + '</div>' +
      '<div class="itotal"><span>الإجمالي</span><b>' + DB.money(d.total) + '</b></div>' + ex +
      '<button class="btn gray" id="dx" style="margin-top:10px">رجوع</button>');
    m.querySelector('#dx').onclick = () => m.close();
  }
};
