(function(){
  const sizes = { standard: '16px', large: '20px', xlarge: '24px', xxlarge: '32px' };
  const scaleFactors = { standard: 1, large: 1.25, xlarge: 1.5, xxlarge: 2 };
  const order = Object.keys(sizes);

  function applySizeToEmbeds(size) {
    const scale = scaleFactors[size] || 1;
    ['healthRecordsFrame', 'resourcesFrame'].forEach(id => {
      const frame = document.getElementById(id);
      if (!frame) return;
      frame.style.transformOrigin = '0 0';
      frame.style.transform = `scale(${scale})`;
      frame.style.width = (100 / scale) + '%';
      frame.style.height = (window.innerHeight / scale) + 'px';
      try {
        if (frame.contentWindow && typeof frame.contentWindow.applyTextSize === 'function') {
          frame.contentWindow.applyTextSize(size);
        }
      } catch (e) {}
    });
  }

  window.getCurrentScale = function() {
    const current = localStorage.getItem('ikey_text_size') || 'standard';
    return scaleFactors[current] || 1;
  };

  window.applyTextSize = function(size) {
    document.documentElement.style.fontSize = sizes[size] || sizes.standard;
    applySizeToEmbeds(size);
  };

  window.changeTextSize = function(delta) {
    const current = localStorage.getItem('ikey_text_size') || 'standard';
    const nextIndex = Math.min(Math.max(order.indexOf(current) + delta, 0), order.length - 1);
    const next = order[nextIndex];
    localStorage.setItem('ikey_text_size', next);
    applyTextSize(next);
  };

  window.addEventListener('storage', e => {
    if (e.key === 'ikey_text_size') {
      applyTextSize(e.newValue);
    }
  });

  const savedSize = localStorage.getItem('ikey_text_size') || 'standard';
  applyTextSize(savedSize);
})();
