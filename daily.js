Screens.daily = {
  day: null,
  today(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); },
  key(iso){ const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); },
  render(el){
    if (!this.day) this.day = this.today();
    const k = this.day;
    const sales = DB.list('sales').filter(s => this.key(s.date) === k);
    const purs = DB.list('purchases').filter(p => this.key(p.date) === k);
    const pays = DB.get(DB.K.payments, []).filter(p => this.key(p.date) === k);
    const sts = DB.get(DB.K.stocktakes, []).filter(s => this.key(s.date) === k);

    let cashSales = 0, creditSales = 0, cashRet = 0, creditRet = 0, profit = 0;
    sales.forEach(s => {
      const m = s.isReturn ? -1 : 1;
      if (s.isReturn){ if (s.type === 'cash') cashRet += s.total; else creditRet += s.total; }
      else { if (s.type === 'cash') cashSales += s.total; else creditSales += s.total; }
      (s.items || []).forEach(i => { profit += m * (i.price - (i.cost || 0)) * i.qty; });
    });
    const purCash = purs.filter(p => !p.isReturn).reduce((s,p) => s + (p.paid || 0), 0);
    const purTotal = purs.filter(p => !p.isReturn).reduce((s,p) => s + p.total, 0);
    const purRet = purs.filter(p => p.isReturn).reduce((s,p) => s + p.total, 0);
    const purRetCash = purs.filter(p => p.isReturn).reduce((s,p) => s + (p.received || 0), 0);
    const colIn = pays.filter(p => p.kind === 'customers').reduce((s,p) => s + p.amount, 0);
    const payOut = pays.filter(p => p.kind === 'suppliers').reduce((s,p) => s + p.amount, 0);

    const ops = [
      ...sales.map(s => ({ d:s.date, doc:['sale', s.id],
        t:(s.isReturn ? 'مرتجع بيع' : s.type === 'cash' ? 'بيع نقدي' : 'بيع آجل') + (s.customerId ? ' — ' + DB.partyName('customers', s.customerId) : ''),
        a:(s.isReturn ? '-' : '+') + DB.money(s.total) })),
      ...purs.map(p => ({ d:p.date, doc:['purchase', p.id],
        t:(p.isReturn ? 'مرتجع شراء' : 'فاتورة شراء') + ' — ' + DB.partyName('suppliers', p.supplierId, p.supplierName || 'مورد عام'),
        a:(p.isReturn ? '+' : '-') + DB.money(p.total) })),
      ...pays.map(p => ({ d:p.date, t:(p.kind === 'customers' ? 'تحصيل من عميل: ' : 'سداد لمورد: ') + DB.partyName(p.kind, p.party, p.name),
        a:(p.kind === 'customers' ? '+' : '-') + DB.money(p.amount) })),
      ...sts.map(s => ({ d:s.date, t:'جرد مخزون (' + s.items.length + ' صنف)', a:DB.money(s.totalDiffValue) }))
    ].sort((a,b) => b.d.localeCompare(a.d));

    const r = (l, v, c='') => '<div class="line"><div class="n">' + l + '</div><b style="' + (c ? 'color:var(--' + c + ')' : '') + '">' + DB.money(v) + '</b></div>';
    el.innerHTML = UI.topBar('كشف الحساب اليومي', '<button class="btn" onclick="window.print()">طباعة</button>') +
      '<div class="box"><label>اختر اليوم</label><input class="inp" id="d" type="date" value="' + k + '"></div>' +
      '<div class="box"><h2>ملخص اليوم</h2>' +
        r('المبيعات النقدية', cashSales, 'ok') +
        r('المبيعات الآجلة', creditSales, 'blue') +
        r('مرتجع المبيعات (نقدي)', cashRet, 'bad') +
        r('مرتجع المبيعات (آجل)', creditRet, 'warn') +
        r('صافي الربح التقريبي', profit, profit >= 0 ? 'ok' : 'bad') +
        r('إجمالي المشتريات', purTotal) +
        r('المدفوع نقداً للمشتريات', purCash, 'bad') +
        r('مرتجع المشتريات (إجمالي / مستلم نقداً)', purRet, 'blue') +
        r('المستلم نقداً من مرتجع المشتريات', purRetCash, 'ok') +
        r('تحصيلات من العملاء', colIn, 'ok') +
        r('مدفوعات للموردين', payOut, 'bad') +
        r('رصيد الخزنة الحالي', DB.getCash(), 'ok') +
      '</div>' +
      '<div class="box"><h2>حركات اليوم (' + ops.length + ')</h2>' +
        (ops.some(o => o.doc) ? '<p class="hint">اضغط على أي فاتورة لعرض تفاصيلها</p>' : '') +
        (ops.length ? ops.map(o => o.doc
          ? '<button type="button" class="docrow" data-k="' + o.doc[0] + '" data-id="' + o.doc[1] + '"><div class="dt"><span>' + DB.esc(o.t) + '</span><b>' + o.a + '</b></div><div class="dm">' + new Date(o.d).toLocaleTimeString('ar-EG', {hour:'2-digit',minute:'2-digit'}) + '</div></button>'
          : '<div class="line"><div class="n">' + DB.esc(o.t) + '<br><small>' + new Date(o.d).toLocaleTimeString('ar-EG', {hour:'2-digit',minute:'2-digit'}) + '</small></div><b>' + o.a + '</b></div>').join('') : '<p class="big">لا توجد حركات في هذا اليوم</p>') +
      '</div>';
    el.querySelector('#d').onchange = e => { this.day = e.target.value; this.render(el); };
    el.querySelectorAll('.docrow').forEach(b => b.onclick = () => UI.showDoc(b.dataset.k, b.dataset.id));
  }
};
