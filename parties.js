window.makeParties = function(cfg){
  const $ = id => document.getElementById(id);
  return {
    q: '',
    all(){ return DB.list(cfg.key); },

    render(el){
      el.innerHTML = UI.topBar(cfg.title) +
        '<button class="btn ok" id="new">' + cfg.addLabel + '</button>' +
        '<input class="inp" id="q" placeholder="اكتب الاسم أو رقم الهاتف" value="' + DB.esc(this.q) + '">' +
        '<div id="list"></div>';
      $('new').onclick = () => this.form(null);
      $('q').oninput = e => { this.q = e.target.value; this.draw(); };
      $('list').onclick = e => { const b = e.target.closest('[data-id]'); if (b) this.detail(b.dataset.id); };
      this.draw();
    },

    draw(){
      const q = this.q.trim().toLowerCase(), all = this.all();
      const sum = DB.round(all.reduce((s, x) => s + Math.max(0, x.balance || 0), 0));
      const credits = DB.round(all.reduce((s, x) => s + Math.max(0, -(x.balance || 0)), 0));
      const list = all.filter(x => !q || (x.name + ' ' + (x.phone || '')).toLowerCase().includes(q));
      $('list').innerHTML = '<div class="box big">' + cfg.sumLabel + ': ' + DB.money(sum) + (credits > 0 ? '<br><small>أرصدة دائنة: ' + DB.money(credits) + '</small>' : '') + '</div>' +
        (list.map(x => '<button class="btn" data-id="' + x.id + '" style="background:var(--' + ((x.balance || 0) > 0 ? 'warn' : 'ok') + ')">' +
          DB.esc(x.name) + '<br><small>' + UI.balText(cfg.key, x.balance) + '</small></button>').join('') || '<p class="big">لا يوجد أحد بعد</p>');
    },

    ops(id){
      const rows = [];
      cfg.docs().filter(d => d[cfg.link] === id).forEach(d => {
        let extra = '';
        if (cfg.key === 'suppliers') extra = d.isReturn ? ' (استلمنا ' + DB.money(d.received || 0) + ')' : ' (دفعنا ' + DB.money(d.paid || 0) + ')';
        else if (!d.isReturn && d.type === 'credit' && (Number(d.paid) || 0) > 0) extra = ' (دفع ' + DB.money(d.paid) + ')';
        rows.push({ date: d.date, doc: (cfg.key === 'suppliers' ? 'purchase:' : 'sale:') + d.id, t: (d.isReturn ? 'مرتجع ' : cfg.docLabel + ' ') + DB.money(d.total) + extra });
      });
      DB.get(DB.K.payments, []).filter(p => p.party === id && p.kind === cfg.key).forEach(p =>
        rows.push({ date: p.date, t: cfg.payDone + ' ' + DB.money(p.amount) }));
      rows.sort((a, b) => b.date.localeCompare(a.date));
      return rows.slice(0, 30).map(r => r.doc
        ? '<button type="button" class="docrow" data-doc="' + r.doc + '"><div class="dt"><span>' + r.t + '</span></div><div class="dm">' + new Date(r.date).toLocaleDateString('ar-EG') + ' • اضغط للتفاصيل</div></button>'
        : '<div class="line"><div class="n">' + new Date(r.date).toLocaleDateString('ar-EG') + '<br>' + r.t + '</div></div>').join('') || '<p>لا توجد عمليات بعد</p>';
    },

    detail(id){
      const x = this.all().find(i => i.id === id);
      if (!x) return;
      const m = UI.modal('<h2>' + DB.esc(x.name) + '</h2>' +
        '<div class="total" style="font-size:' + ((x.balance || 0) < 0 ? '1.4rem' : '2rem') + '">' + UI.balText(cfg.key, x.balance) + '</div>' +
        '<p>' + DB.esc(x.phone || '') + ' ' + DB.esc(x.address || '') + '<br>' + DB.esc(x.notes || '') + '</p>' +
        '<button class="btn ok" id="pay">' + cfg.payLabel + '</button>' +
        (x.phone ? '<a class="btn" style="display:block;text-align:center;text-decoration:none;padding-top:16px" href="tel:' + DB.esc(x.phone) + '">اتصال</a>' : '') +
        '<button class="btn gray" id="edit">تعديل</button>' +
        '<h2>كشف الحساب</h2>' + this.ops(id) +
        '<button class="btn gray" id="x">رجوع</button>');
      m.querySelector('#x').onclick = () => m.close();
      m.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => { const p = b.dataset.doc.split(':'); UI.showDoc(p[0], p[1]); });
      m.querySelector('#edit').onclick = () => { m.close(); this.form(x); };
      m.querySelector('#pay').onclick = () => this.pay(x, m);
    },

    pay(x, m){
      const p = UI.modal('<h2>' + cfg.payLabel + '</h2><p class="big">' + UI.balText(cfg.key, x.balance) + '</p>' +
        '<input class="inp" id="amt" type="number" inputmode="decimal" step="any" placeholder="المبلغ">' +
        '<button class="btn ok" id="go">تأكيد</button><button class="btn gray" id="no">رجوع</button>');
      p.querySelector('#no').onclick = () => p.close();
      p.querySelector('#go').onclick = () => {
        const a = DB.round(parseFloat(p.querySelector('#amt').value));
        if (!(a > 0)) return UI.toast('اكتب المبلغ', true);
        const cur = this.all().find(i => i.id === x.id);
        if (!cur) return UI.toast('غير موجود', true);
        const bal = Number(cur.balance) || 0;
        if (bal > 0 && a > bal) return UI.toast('المبلغ أكبر من الرصيد المستحق', true);
        if (cfg.cashSign < 0 && a > DB.getCash()) return UI.toast('رصيد الخزنة لا يكفي', true);
        const res = DB.atomic(() => {
          if (!DB.addBalance(cfg.key, x.id, -a)) return { error: 'تعذر تحديث الرصيد' };
          DB.addCash(cfg.cashSign * a);
          const pays = DB.get(DB.K.payments, []);
          pays.push({ id: DB.newId('pay'), date:new Date().toISOString(), kind: cfg.key, party: x.id, amount: a });
          DB.set(DB.K.payments, pays);
          return { ok:true };
        });
        if (res.error) return UI.toast(res.error, true);
        p.close(); m.close(); this.draw();
        UI.toast('تم التسجيل');
      };
    },

    form(x){
      const n = !x, d = x || { name:'', phone:'', address:'', balance:0, notes:'' };
      const m = UI.modal('<h2>' + (n ? cfg.addLabel : 'تعديل') + '</h2>' +
        '<label>الاسم</label><input class="inp" id="fn" value="' + DB.esc(d.name) + '">' +
        '<label>رقم الهاتف</label><input class="inp" id="fp" type="tel" value="' + DB.esc(d.phone) + '">' +
        '<label>العنوان</label><input class="inp" id="fa" value="' + DB.esc(d.address) + '">' +
        '<label>' + cfg.balLabel + ' (الرصيد)</label><input class="inp" id="fb" type="number" inputmode="decimal" step="any" value="' + d.balance + '">' +
        '<label>ملاحظات</label><input class="inp" id="fo" value="' + DB.esc(d.notes) + '">' +
        '<button class="btn ok" id="ok">حفظ</button>' +
        (n ? '' : '<button class="btn bad" id="del">حذف</button>') +
        '<button class="btn gray" id="x">رجوع</button>');
      const v = id => m.querySelector('#' + id).value;
      m.querySelector('#x').onclick = () => m.close();
      m.querySelector('#ok').onclick = () => {
        const name = v('fn').trim();
        if (!name) return UI.toast('اكتب الاسم', true);
        const data = {
          name,
          phone: v('fp').trim(),
          address: v('fa').trim(),
          balance: DB.round(parseFloat(v('fb')) || 0),
          notes: v('fo').trim()
        };
        if (n) cfg.add(data);
        else {
          const a = this.all(), i = a.findIndex(i => i.id === x.id);
          if (i < 0) return UI.toast('غير موجود', true);
          Object.assign(a[i], data);
          DB.save(cfg.key, a);
        }
        m.close(); this.draw();
        UI.toast('تم الحفظ');
      };
      if (!n) m.querySelector('#del').onclick = async () => {
        if (Math.abs(Number(x.balance) || 0) > 0 || DB.partyHasOps(cfg.key, x.id)){
          return UI.toast('لا يمكن الحذف لوجود رصيد أو عمليات', true);
        }
        if (!await UI.confirm('حذف نهائي؟', 'نعم', 'رجوع')) return;
        DB.save(cfg.key, this.all().filter(i => i.id !== x.id));
        m.close(); this.draw();
        UI.toast('تم الحذف');
      };
    }
  };
};
