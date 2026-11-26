Screens.inventory = {
  q:'', selectedId:null, low:false,
  $(id){ return document.getElementById(id); },
  isLow(p){ return (Number(p.qty) || 0) <= (Number(p.min) || 0); },

  render(el){
    const all = DB.list('products');
    if (this.selectedId && !all.some(p => p.id === this.selectedId)) this.selectedId = null;

    el.innerHTML = UI.topBar('أرصدة الأصناف والمخزون') +
      '<div class="box" id="stats"></div>' +
      '<div class="row">' +
        '<button class="btn ok" id="new">صنف جديد</button>' +
        '<button class="btn warn" id="lowBtn"></button>' +
      '</div>' +
      UI.renderProductPicker({ q: this.q, selectedId: this.selectedId }) +
      '<div id="viewZone"></div>';

    this.$('new').onclick = () => this.form(null);
    this.$('lowBtn').onclick = () => {
      this.low = !this.low;
      this.selectedId = null;
      this.draw();
    };

    const qInp = this.$('q');
    const dd = this.$('prodDropdown');
    const predList = this.$('predList');

    dd.onchange = e => {
      const id = e.target.value;
      this.selectedId = id || null;
      this.q = '';
      qInp.value = '';
      predList.classList.add('hide');
      this.draw();
    };

    qInp.oninput = e => {
      this.q = e.target.value;
      this.updatePredictions();
    };

    predList.onclick = e => {
      const btn = e.target.closest('[data-pick-id]');
      if (!btn) return;
      this.selectedId = btn.dataset.pickId;
      this.q = '';
      qInp.value = '';
      dd.value = this.selectedId;
      predList.classList.add('hide');
      this.draw();
    };

    this.$('viewZone').onclick = e => {
      const c = e.target.closest('.card');
      if (c) this.form(DB.getProduct(c.dataset.id));
    };
    this.draw();
  },

  updatePredictions(){
    const predList = this.$('predList');
    if (!predList) return;
    const q = this.q.trim();
    if (!q){
      predList.classList.add('hide');
      predList.innerHTML = '';
      this.draw();
      return;
    }
    const matches = UI.filterProducts(DB.list('products'), q);
    predList.classList.remove('hide');
    predList.innerHTML = matches.length
      ? matches.slice(0, 12).map(p =>
          '<button type="button" class="pred-item' + (this.selectedId === p.id ? ' active' : '') + '" data-pick-id="' + p.id + '">' +
            '<span class="pred-name">' + DB.esc(p.name) + ' <small>(' + DB.esc(p.code) + ')</small></span>' +
            '<span class="pred-meta">بيع: ' + DB.money(p.price) + ' • متاح: ' + DB.round(p.qty) + '</span>' +
          '</button>'
        ).join('')
      : '<div class="pred-empty">لا يوجد صنف مطابق</div>';

    if (matches.length === 1){
      this.selectedId = matches[0].id;
    }
    this.draw();
  },

  draw(){
    const all = DB.list('products');
    const lows = all.filter(p => this.isLow(p));
    const value = DB.round(all.reduce((s,p) => s + (p.buy || 0) * (p.qty || 0), 0));

    this.$('stats').innerHTML = '<div class="big">عدد الأصناف المسجلة: ' + all.length + '</div>' +
      '<div class="big" style="color:var(--warn)">أصناف قاربت على النفاذ: ' + lows.length + '</div>' +
      '<div class="big">قيمة المخزون: ' + DB.money(value) + '</div>';
    this.$('lowBtn').textContent = this.low ? 'إخفاء النواقص' : 'عرض النواقص (' + lows.length + ')';

    const zone = this.$('viewZone');
    if (this.low){
      zone.innerHTML = '<h2 style="margin-top:8px">الأصناف الناقصة (بدون صور — اضغط للتعديل)</h2>' +
        (lows.length
          ? '<div class="grid">' + lows.map(p => UI.card(p)).join('') + '</div>'
          : '<p class="big">لا توجد نواقص حالياً</p>');
      return;
    }

    const p = this.selectedId ? DB.getProduct(this.selectedId) : null;
    if (!p){
      zone.innerHTML = '<div class="box" style="text-align:center;opacity:.85;padding:16px">' +
        'الصور مخفية في هذه الصفحة. اختر الصنف المطلوب من <b>القائمة المنسدلة</b> أو <b>خانة التنبؤ</b> لعرض بياناته وتعديله، أو اضغط على <b>المعرض</b> بالأعلى لتصفح صور المنتجات.' +
      '</div>';
      return;
    }

    zone.innerHTML = '<div style="margin-top:8px">' +
      '<div class="hint" style="margin-bottom:4px">الصنف المطلوب (اضغط على البطاقة لتعديل الأسعار أو الكمية):</div>' +
      UI.card(p) +
    '</div>';
  },

  form(p){
    const isNew = !p;
    const d = p ? Object.assign({}, p) : { code: DB.generateProductCode(), name:'', img:'', buy:'', price:'', qty:'', min:5 };
    let img = d.img || '';
    const m = UI.modal('<h2>' + (isNew ? 'صنف جديد (مع منع التكرار)' : 'تعديل الصنف') + '</h2>' +
      '<div class="codebox">' + DB.esc(d.code) + '</div>' +
      '<label>اسم الصنف</label><input class="inp" id="pn" value="' + DB.esc(d.name) + '" placeholder="اكتب اسم الصنف">' +
      '<div id="dupWarn" class="hint" style="color:var(--bad);font-weight:800"></div>' +
      '<label>سعر الشراء</label><input class="inp" id="pb" type="number" inputmode="decimal" step="any" value="' + d.buy + '">' +
      '<label>سعر البيع</label><input class="inp" id="ps" type="number" inputmode="decimal" step="any" value="' + d.price + '">' +
      '<label>الكمية</label><input class="inp" id="pq" type="number" inputmode="decimal" step="any" value="' + d.qty + '">' +
      '<label>أقل كمية</label><input class="inp" id="pm" type="number" inputmode="decimal" step="any" value="' + d.min + '">' +
      '<div class="box" style="padding:10px;background:var(--soft)">' +
        '<div class="hint" style="margin-bottom:6px">صورة المنتج (تظهر في معرض المنتجات فقط): ' + (img ? '<b>مرفقة</b>' : 'غير مرفقة') + '</div>' +
        '<div class="row" style="margin:0"><button class="btn warn" id="shoot" style="margin:0">تصوير للمعرض</button><button class="btn gray" id="pick" style="margin:0">اختيار صورة للمعرض</button></div>' +
      '</div>' +
      '<input type="file" id="f1" accept="image/*" capture="environment" class="hide">' +
      '<input type="file" id="f2" accept="image/*" class="hide">' +
      '<button class="btn ok" id="ok">حفظ</button>' +
      (isNew ? '' : '<button class="btn bad" id="del">حذف</button>') +
      '<button class="btn gray" id="x">رجوع</button>');
    const $ = id => m.querySelector('#' + id), v = id => $(id).value;

    const checkDup = () => {
      const dup = DB.findDuplicateProduct(v('pn'), d.code, isNew ? null : p.id);
      $('dupWarn').textContent = dup
        ? 'تنبيه: يوجد صنف مسجل بنفس الاسم أو الكود: «' + dup.name + '» (' + dup.code + ')'
        : '';
    };
    $('pn').oninput = checkDup;
    checkDup();

    $('shoot').onclick = () => $('f1').click();
    $('pick').onclick = () => $('f2').click();
    const onFile = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        img = await DB.compressImage(f);
        UI.toast('تم حفظ الصورة (ستظهر في المعرض فقط)');
      } catch(x){ UI.toast('تعذر قراءة الصورة', true); }
      e.target.value = '';
    };
    $('f1').onchange = onFile;
    $('f2').onchange = onFile;
    $('x').onclick = () => m.close();
    $('ok').onclick = () => {
      const name = v('pn').trim(), price = parseFloat(v('ps'));
      if (!name || isNaN(price)) return UI.toast('اكتب الاسم وسعر البيع', true);
      const data = {
        name, img,
        buy: parseFloat(v('pb')) || 0,
        price,
        qty: parseFloat(v('pq')) || 0,
        min: parseFloat(v('pm')) || 0
      };
      const res = isNew
        ? DB.addProduct(Object.assign({ code: d.code }, data))
        : DB.updateProduct(p.id, data);
      if (res && res.error) return UI.toast(res.error, true);
      this.selectedId = res.id;
      m.close();
      this.render(document.getElementById('app'));
      UI.toast('تم الحفظ');
    };
    if (!isNew) $('del').onclick = async () => {
      const hasOps = DB.list('sales').some(s => s.items.some(i => i.productId === p.id)) ||
                     DB.list('purchases').some(s => s.items.some(i => i.productId === p.id));
      if (hasOps) return UI.toast('لا يمكن الحذف: يوجد حركات مسجلة', true);
      if (!await UI.confirm('حذف نهائي؟', 'نعم', 'رجوع')) return;
      DB.save('products', DB.list('products').filter(x => x.id !== p.id));
      if (this.selectedId === p.id) this.selectedId = null;
      m.close();
      this.render(document.getElementById('app'));
      UI.toast('تم الحذف');
    };
  }
};
