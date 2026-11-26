Screens.gallery = {
  idx: 0,
  items: [],
  fsZoom: 1,
  fsPanX: 0,
  fsPanY: 0,
  _drag: null,
  _gb: false,
  _lastTap: 0,
  _touchAt: 0,
  _lastEdgeToast: 0,

  $(id){ return document.getElementById(id); },

  available(){
    return DB.list('products').filter(p => (Number(p.qty) || 0) > 0);
  },

  render(el){
    document.body.style.overflow = '';
    this.resetZoom();
    this.items = this.available();
    if (this.idx >= this.items.length) this.idx = Math.max(0, this.items.length - 1);

    if (!this.items.length){
      el.innerHTML = UI.topBar('معرض المنتجات') +
        '<div class="box" style="text-align:center;padding:30px 16px">' +
          '<h2>معرض المنتجات المتاحة</h2>' +
          '<p class="big">لا توجد منتجات متاحة حالياً في المخزون.</p>' +
          '<button class="btn ok" onclick="go(\'inventory\')">الذهاب للمخزون</button>' +
        '</div>';
      return;
    }

    const opts = this.items.map((p, i) => '<option value="' + i + '">' + (i + 1) + '. ' + DB.esc(p.name) + ' (' + DB.money(p.price) + ')</option>').join('');

    el.innerHTML = UI.topBar('معرض المنتجات', '<button class="btn" id="galFullBtn">ملء الشاشة</button>') +
      '<div class="gallery-wrap">' +
        '<div class="row" style="margin-bottom:2px">' +
          '<select class="inp" id="galJump" style="margin:0">' + opts + '</select>' +
          '<div class="gallery-counter" id="galCounter" style="flex:none"></div>' +
        '</div>' +
        '<div class="gallery-stage" id="galStage">' +
          '<button class="gal-arrow gal-prev" id="galPrev" title="السابق">&#10095;</button>' +
          '<div class="gal-slide" id="galSlide"></div>' +
          '<button class="gal-arrow gal-next" id="galNext" title="التالي">&#10094;</button>' +
        '</div>' +
        '<div class="gallery-edge-bar" id="galEdge"></div>' +
        '<div class="gallery-controls">' +
          '<button class="btn gray" style="margin:0" id="galFirst">بداية المعرض</button>' +
          '<button class="btn gray" style="margin:0" id="galLast">نهاية المعرض</button>' +
        '</div>' +
      '</div>' +
      '<div class="gal-fullscreen hide" id="galFs">' +
        '<div class="gal-fs-top">' +
          '<button class="gal-fs-btn" id="fsClose">إغلاق</button>' +
          '<span class="gal-fs-title" id="fsTitle"></span>' +
          '<div class="gal-fs-zoom-grp">' +
            '<button class="gal-fs-btn" id="fsZoomOut">−</button>' +
            '<span id="fsZoomVal">100%</span>' +
            '<button class="gal-fs-btn" id="fsZoomIn">+</button>' +
            '<button class="gal-fs-btn" id="fsReset">↺</button>' +
          '</div>' +
        '</div>' +
        '<div class="gal-fs-viewport" id="fsViewport">' +
          '<div class="gal-fs-content" id="fsContent"></div>' +
        '</div>' +
        '<div class="gal-fs-bottom">' +
          '<button class="gal-fs-nav" id="fsPrev">السابق</button>' +
          '<div class="gal-fs-info" id="fsInfo"></div>' +
          '<button class="gal-fs-nav" id="fsNext">التالي</button>' +
        '</div>' +
      '</div>';

    this.bindGlobal();
    this.bindEvents(el);
    this.draw();
  },

  bindGlobal(){
    if (this._gb) return;
    this._gb = true;
    window.addEventListener('mousemove', e => {
      if (!this._drag) return;
      this.fsPanX = e.clientX - this._drag.x;
      this.fsPanY = e.clientY - this._drag.y;
      this.applyZoom();
      this._drag.x = e.clientX - this.fsPanX;
      this._drag.y = e.clientY - this.fsPanY;
    });
    window.addEventListener('mouseup', () => { this._drag = null; });
    document.addEventListener('keydown', e => {
      if (!this.$('galStage')) return;
      if (e.key === 'ArrowLeft') this.step(1);
      else if (e.key === 'ArrowRight') this.step(-1);
      else if (e.key === 'Escape') this.closeFs();
    });
  },

  step(d){
    const n = this.idx + d;
    const now = Date.now();
    if (n < 0){
      if (now - this._lastEdgeToast > 1500){
        this._lastEdgeToast = now;
        UI.toast('أنت في بداية المعرض');
      }
      return;
    }
    if (n >= this.items.length){
      if (now - this._lastEdgeToast > 1500){
        this._lastEdgeToast = now;
        UI.toast('أنت في نهاية المعرض');
      }
      return;
    }
    this.idx = n;
    this.resetZoom();
    this.draw();
  },
  goTo(i){ this.idx = i; this.resetZoom(); this.draw(); },

  openFs(){
    const fs = this.$('galFs');
    if (!fs) return;
    this.resetZoom();
    fs.classList.remove('hide');
    document.body.style.overflow = 'hidden';
    if (window._Nav && window._Nav.push) window._Nav.push('galFs');
    this.drawFs();
  },
  closeFs(fromPop){
    const fs = this.$('galFs');
    if (!fs || fs.classList.contains('hide')) return;
    fs.classList.add('hide');
    document.body.style.overflow = '';
    this.resetZoom();
    if (!fromPop && window._Nav && window._Nav.popSilent) window._Nav.popSilent();
  },

  bindEvents(el){
    const $ = id => el.querySelector('#' + id);

    $('galJump').onchange = e => this.goTo(parseInt(e.target.value, 10) || 0);
    $('galPrev').onclick = () => this.step(-1);
    $('galNext').onclick = () => this.step(1);
    $('galFirst').onclick = () => this.goTo(0);
    $('galLast').onclick = () => this.goTo(this.items.length - 1);
    $('galFullBtn').onclick = () => this.openFs();
    $('galSlide').onclick = () => this.openFs();
    $('fsClose').onclick = () => this.closeFs();
    $('fsPrev').onclick = () => this.step(-1);
    $('fsNext').onclick = () => this.step(1);
    $('fsZoomIn').onclick = () => this.setZoom(this.fsZoom + 0.4);
    $('fsZoomOut').onclick = () => this.setZoom(this.fsZoom - 0.4);
    $('fsReset').onclick = () => { this.resetZoom(); this.applyZoom(); };

    const stage = $('galStage');
    let sx = null, sy = 0;
    stage.addEventListener('touchstart', e => {
      if (e.touches.length === 1){ sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
      else sx = null;
    }, { passive: true });
    stage.addEventListener('touchend', e => {
      if (sx === null || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      sx = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)){
        this.step(dx > 0 ? -1 : 1);
      }
    });

    const vp = $('fsViewport');
    let tx = null, ty = 0, pinchDist = 0, baseZoom = 1, pan = null;

    vp.addEventListener('dblclick', () => {
      if (Date.now() - this._touchAt < 700) return;
      this.toggleZoom();
    });
    vp.addEventListener('wheel', e => {
      e.preventDefault();
      this.setZoom(this.fsZoom + (e.deltaY < 0 ? 0.25 : -0.25));
    }, { passive: false });
    vp.addEventListener('mousedown', e => {
      if (this.fsZoom <= 1) return;
      this._drag = { x: e.clientX - this.fsPanX, y: e.clientY - this.fsPanY };
    });

    vp.addEventListener('touchstart', e => {
      this._touchAt = Date.now();
      if (e.touches.length === 2){
        pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        baseZoom = this.fsZoom;
        tx = null; pan = null;
      } else if (e.touches.length === 1){
        tx = e.touches[0].clientX; ty = e.touches[0].clientY;
        pan = { x: tx - this.fsPanX, y: ty - this.fsPanY };
      }
    }, { passive: true });

    vp.addEventListener('touchmove', e => {
      this._touchAt = Date.now();
      if (e.touches.length === 2 && pinchDist > 0){
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this.setZoom(baseZoom * (dist / pinchDist));
      } else if (e.touches.length === 1 && this.fsZoom > 1 && pan){
        e.preventDefault();
        this.fsPanX = e.touches[0].clientX - pan.x;
        this.fsPanY = e.touches[0].clientY - pan.y;
        this.applyZoom();
        pan = { x: e.touches[0].clientX - this.fsPanX, y: e.touches[0].clientY - this.fsPanY };
      }
    }, { passive: false });

    vp.addEventListener('touchend', e => {
      this._touchAt = Date.now();
      if (e.touches.length < 2) pinchDist = 0;
      if (e.touches.length === 0 && e.changedTouches.length === 1 && tx !== null){
        const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
        const tap = Math.abs(dx) < 10 && Math.abs(dy) < 10;
        if (tap){
          const now = Date.now();
          if (now - this._lastTap < 320){ this._lastTap = 0; this.toggleZoom(); }
          else this._lastTap = now;
        } else if (this.fsZoom === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)){
          this.step(dx > 0 ? -1 : 1);
        }
      }
      tx = null; pan = null;
    });
  },

  toggleZoom(){
    if (this.fsZoom > 1) this.resetZoom();
    else this.fsZoom = 2.2;
    this.applyZoom();
  },

  resetZoom(){
    this.fsZoom = 1;
    this.fsPanX = 0;
    this.fsPanY = 0;
  },

  setZoom(z){
    this.fsZoom = Math.min(4, Math.max(1, Number(z.toFixed(2))));
    if (this.fsZoom === 1){
      this.fsPanX = 0;
      this.fsPanY = 0;
    }
    this.applyZoom();
  },

  applyZoom(){
    const img = this.$('fsZoomImg');
    const lbl = this.$('fsZoomVal');
    const vp = this.$('fsViewport');
    if (img){
      if (vp && this.fsZoom > 1){
        const maxX = Math.max(0, (img.offsetWidth * this.fsZoom - vp.clientWidth) / 2);
        const maxY = Math.max(0, (img.offsetHeight * this.fsZoom - vp.clientHeight) / 2);
        this.fsPanX = Math.min(maxX, Math.max(-maxX, this.fsPanX));
        this.fsPanY = Math.min(maxY, Math.max(-maxY, this.fsPanY));
      }
      img.style.transform = 'translate(' + this.fsPanX + 'px, ' + this.fsPanY + 'px) scale(' + this.fsZoom + ')';
    }
    if (lbl) lbl.textContent = Math.round(this.fsZoom * 100) + '%';
  },

  draw(){
    const total = this.items.length;
    const p = this.items[this.idx];
    if (!p) return;
    const isStart = this.idx === 0;
    const isEnd = this.idx === total - 1;

    if (this.$('galJump')) this.$('galJump').value = String(this.idx);
    this.$('galCounter').textContent = (this.idx + 1) + ' من ' + total;
    this.$('galPrev').disabled = isStart;
    this.$('galNext').disabled = isEnd;
    this.$('galFirst').disabled = isStart;
    this.$('galLast').disabled = isEnd;

    let edgeMsg = '', edgeCls = '';
    if (isStart && isEnd){ edgeMsg = 'بداية ونهاية المعرض'; edgeCls = 'start end'; }
    else if (isStart){ edgeMsg = 'بداية المعرض — اسحب لليسار أو اضغط التالي'; edgeCls = 'start'; }
    else if (isEnd){ edgeMsg = 'نهاية المعرض — اسحب لليمين أو اضغط السابق'; edgeCls = 'end'; }
    else edgeMsg = 'اسحب لليمين أو اليسار للتنقل • اضغط على الصورة لملء الشاشة';
    const eb = this.$('galEdge');
    eb.textContent = edgeMsg;
    eb.className = 'gallery-edge-bar ' + edgeCls;

    this.$('galSlide').innerHTML = '<div class="gal-img-box">' +
        (p.img ? '<img src="' + p.img + '" alt="' + DB.esc(p.name) + '">' : '<div class="gal-noimg">&#128230;<br><small>لا توجد صورة</small></div>') +
      '</div>' +
      '<div class="gal-meta">' +
        '<div class="gal-code">' + DB.esc(p.code) + '</div>' +
        '<div class="gal-name">' + DB.esc(p.name) + '</div>' +
        '<div class="gal-badges">' +
          '<span class="gal-badge price">السعر: ' + DB.money(p.price) + '</span>' +
          '<span class="gal-badge qty">المتاح: ' + DB.esc(p.qty) + '</span>' +
        '</div>' +
      '</div>';

    const fs = this.$('galFs');
    if (fs && !fs.classList.contains('hide')) this.drawFs();
  },

  drawFs(){
    const total = this.items.length;
    const p = this.items[this.idx];
    if (!p) return;
    const isStart = this.idx === 0;
    const isEnd = this.idx === total - 1;

    this.$('fsTitle').textContent = p.name + ' (' + (this.idx + 1) + '/' + total + ')';
    this.$('fsPrev').disabled = isStart;
    this.$('fsNext').disabled = isEnd;

    let edgeTag = '';
    if (isStart && isEnd) edgeTag = ' | بداية ونهاية المعرض';
    else if (isStart) edgeTag = ' | بداية المعرض';
    else if (isEnd) edgeTag = ' | نهاية المعرض';

    this.$('fsInfo').innerHTML = '<b>' + DB.esc(p.name) + '</b> — السعر: <span style="color:#7ef29a">' + DB.money(p.price) + '</span> — الكمية المتاحة: <span style="color:#ffd166">' + DB.esc(p.qty) + '</span>' + edgeTag;

    this.$('fsContent').innerHTML = p.img
      ? '<img id="fsZoomImg" src="' + p.img + '" alt="' + DB.esc(p.name) + '" draggable="false">'
      : '<div id="fsZoomImg" class="gal-fs-noimg">&#128230;<br>' + DB.esc(p.name) + '</div>';

    this.applyZoom();
  }
};
