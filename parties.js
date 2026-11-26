function makeParties(cfg){
  return {
    q: '',
    render(el){
      const all = DB.list(cfg.key);
      const q = this.q.trim().toLowerCase();
      const list = q ? all.filter(x => x.name.toLowerCase().includes(q) || (x.phone || '').includes(q)) : all;
      const tot = DB.round(all.reduce((s,x) => s + (Number(x.balance) || 0), 0));
      el.innerHTML = UI.topBar(cfg.title, '<button class="btn ok" id="add">+ جديد</button>') +
        '<div class="box big">' + cfg.totLabel + ': ' + DB.money(tot) + '</div>' +
        '<input class="inp" id="q" placeholder="بحث بالاسم أو الهاتف..." value="' + DB.esc(this.q) + '">' +
        (list.length ? list.map(x => {
          const b = DB.round(x.balance);
          return '<div class="box" data-id="' + x.id + '" style="cursor:pointer">' +
            '<div class="big">' + DB.esc(x.name) + '</div>' +
            (x.phone ? '<div class="hint">' + DB.esc(x.phone) + '</div>' : '') +
            '<div class="big" style="color:var(--' + (b >= 0 ? cfg.posColor : 'bad') + ')">' + UI.balText(cfg.key, b) + '</div>' +
          '</div>';
        }).join('') : '<p class="big">لا يوجد بيانات</p>');
      el.querySelector('#add').onclick = () => this.form(null);
      el.querySelector('#q').oninput = e => { this.q = e.target.value; this.render(el); };
      el.querySelectorAll('[data-id]').forEach(c => c.onclick = () => this.open(c.dataset.id));
    },
    form(x){
      const isNew = !x;
      const d = x || { name:'', phone:'', address:'', balance:0, notes:'' };
      const m = UI.modal('<h2>' + (isNew ? cfg.newTitle : 'تعديل البيانات') + '</h2>' +
        '<label>الاسم</label><input class="inp" id="n" value="' + DB.esc(d.name) + '">' +
        '<label>الهاتف</label><input class="inp" id="p" type="tel" value="' + DB.esc(d.phone) + '">' +
        '<label>العنوان</label><input class="inp" id="a" value="' + DB.esc(d.address) + '">' +
        (isNew ? '<label>' + cfg.balLabel + '</label><input class="inp" id="b" type="number" inputmode="decimal" step="any" value="0">' : '') +
        '<label>ملاحظات</label><input class="inp" id="o" value="' + DB.esc(d.notes) + '">' +
        '<button class="btn ok" id="ok">حفظ</button><button class="btn gray" id="c">رجوع</button>');
      const $ = id => m.querySelector('#' + id);
      $('c').onclick = () => m.close();
      $('ok').onclick = () => {
        const name = $('n').value.trim();
        if (!name) return UI.toast('اكتب الاسم', true);
        const all = DB.list(cfg.key);
        if (isNew){
          all.push({ id:DB.newId(cfg.key[0]), name, phone:$('p').value.trim(), address:$('a').value.trim(),
            balance:parseFloat($('b').value) || 0, notes:$('o').value.trim() });
        } else {
          const t = all.find(i => i.id === x.id);
          if (t) Object.assign(t, { name, phone:$('p').value.trim(), address:$('a').value.trim(), notes:$('o').value.trim() });
        }
        DB.save(cfg.key, all); m.close(); this.render(document.getElementById('app')); UI.toast('تم الحفظ');
      };
    },
    open(id){
      const x = DB.list(cfg.key).find(i => i.id === id); if (!x) return;
      const docs = DB.list(cfg.docKey).filter(d => d[cfg.link] === id);
      const pays = DB.get(DB.K.payments, []).filter(p => p.party === id && p.kind === cfg.key);
      const allOps = [
        ...docs.map(d => {
          const isRet = !!d.isReturn;
          const label = isRet ? cfg.retLabel : cfg.docLabel;
          const total = Number(d.total) || 0;
          const paidNow = isRet ? (Number(d.received) || 0) : (Number(d.paid) || 0);
          const rem = d.remaining !== undefined ? Number(d.remaining) : DB.round(total - paidNow);
          const sub = isRet
            ? 'المستلم: ' + DB.money(paidNow)
            : 'المدفوع: ' + DB.money(paidNow) + ' | الباقي: ' + DB.money(rem);
          return {
            ts: d.date,
            isDoc: true,
            docKind: cfg.docKey === 'sales' ? 'sale' : 'purchase',
            docId: d.id,
            title: label + ' (' + (d.items || []).length + ' صنف)',
            sub,
            amount: total,
            cls: isRet ? 'bad' : 'ok'
          };
        }),
        ...pays.map(p => ({
          ts: p.date,
          isDoc: false,
          title: cfg.payLabel + (p.note ? ' — ' + p.note : ''),
          sub: 'قيد مالي مباشر في الخزنة',
          amount: Number(p.amount) || 0,
          cls: 'blue'
        }))
      ].sort((a,b) => String(b.ts).localeCompare(String(a.ts)));

      const histHtml = allOps.length ? allOps.map(op => {
        const dtStr = new Date(op.ts).toLocaleString('ar-EG', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        if (op.isDoc){
          return '<button type="button" class="docrow" data-dk="' + op.docKind + '" data-did="' + op.docId + '">' +
            '<div class="dt"><span>' + DB.esc(op.title) + '</span><b style="color:var(--' + op.cls + ')">' + DB.money(op.amount) + '</b></div>' +
            '<div class="dm">' + dtStr + ' • ' + DB.esc(op.sub) + '</div>' +
          '</button>';
        }
        return '<div class="line">' +
          '<div class="n">' + DB.esc(op.title) + '<br><small>' + dtStr + ' • ' + DB.esc(op.sub) + '</small></div>' +
          '<b style="color:var(--' + op.cls + ')">' + DB.money(op.amount) + '</b>' +
        '</div>';
      }).join('') : '<p class="big" style="opacity:.8">لا توجد عمليات مسجلة لهذا الحساب بعد</p>';

      const m = UI.modal('<h2>' + DB.esc(x.name) + '</h2>' +
        (x.phone ? '<div class="hint">' + DB.esc(x.phone) + '</div>' : '') +
        (x.address ? '<div class="hint">' + DB.esc(x.address) + '</div>' : '') +
        (x.notes ? '<div class="hint">' + DB.esc(x.notes) + '</div>' : '') +
        '<div class="box big">' + UI.balText(cfg.key, x.balance) + '</div>' +
        '<label>' + cfg.payLabel + '</label>' +
        '<input class="inp" id="amt" type="number" inputmode="decimal" step="any" placeholder="المبلغ">' +
        '<input class="inp" id="note" placeholder="ملاحظة (اختياري)">' +
        '<button class="btn ok" id="pay">تسجيل المبلغ</button>' +
        '<h3 style="margin:12px 0 6px;font-size:1.05rem">كشف الحساب والعمليات (' + allOps.length + ')</h3>' +
        '<div style="max-height:240px;overflow-y:auto;margin-bottom:8px">' + histHtml + '</div>' +
        '<div class="row"><button class="btn" id="ed">تعديل</button><button class="btn bad" id="del">حذف</button></div>' +
        '<button class="btn gray" id="c">رجوع</button>');
      const $ = k => m.querySelector('#' + k);
      $('c').onclick = () => m.close();
      $('ed').onclick = () => { m.close(); this.form(x); };
      m.querySelectorAll('[data-did]').forEach(btn => {
        btn.onclick = () => UI.showDoc(btn.dataset.dk, btn.dataset.did);
      });
      $('pay').onclick = () => {
        const a = DB.round(parseFloat($('amt').value));
        if (!(a > 0)) return UI.toast('اكتب مبلغ صحيح', true);
        if (cfg.cashDir < 0 && a > DB.getCash()) return UI.toast('رصيد الخزنة لا يكفي', true);
        const res = DB.atomic(() => {
          DB.addBalance(cfg.key, id, -a);
          DB.addCash(cfg.cashDir * a);
          const p = DB.get(DB.K.payments, []);
          p.push({ id:DB.newId('pay'), date:new Date().toISOString(), kind:cfg.key, party:id, name:x.name, amount:a, note:$('note').value.trim() });
          DB.set(DB.K.payments, p);
          return { ok:true };
        });
        if (res.error) return UI.toast(res.error, true);
        m.close(); this.render(document.getElementById('app')); UI.toast('تم التسجيل');
      };
      $('del').onclick = async () => {
        if (DB.round(x.balance) !== 0) return UI.toast('لا يمكن الحذف: الرصيد غير صفر', true);
        if (DB.partyHasOps(cfg.key, id)) return UI.toast('لا يمكن الحذف: يوجد فواتير أو مدفوعات مسجلة', true);
        if (!await UI.confirm('حذف نهائي؟', 'نعم', 'رجوع')) return;
        DB.save(cfg.key, DB.list(cfg.key).filter(i => i.id !== id));
        m.close(); this.render(document.getElementById('app')); UI.toast('تم الحذف');
      };
    }
  };
}
window.makeParties = makeParties;
