document.addEventListener('DOMContentLoaded', () => {
  const gallery = document.querySelector('.photo-gallery');
  if (!gallery) return;
  gallery.id = 'photo-contact-sheet';
  const toolbar = document.createElement('div');
  toolbar.className = 'desktop-gallery-toolbar';
  const label = document.createElement('p');
  label.textContent = 'OCHO POSTALES DE NUESTRA CASA · ELEGÍ UNA Y ENTRÁ';
  const buttons = document.createElement('div');
  buttons.className = 'desktop-gallery-buttons';
  const previous = document.createElement('button');
  const next = document.createElement('button');
  for (const [button, text, name] of [[previous, '←', 'Ver fotos anteriores'], [next, '→', 'Ver más fotos']]) {
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', name);
    button.setAttribute('aria-controls', gallery.id);
    buttons.append(button);
  }
  toolbar.append(label, buttons);
  gallery.before(toolbar);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 1100px)');
  function move(direction) {
    const cards = [...gallery.children];
    const current = gallery.scrollLeft;
    const points = cards.map(card => card.offsetLeft - cards[0].offsetLeft);
    const destination = direction > 0 ? points.find(point => point > current + 10) ?? gallery.scrollWidth : points.reverse().find(point => point < current - 10) ?? 0;
    gallery.scrollTo({ left: destination, behavior: reduceMotion.matches || document.documentElement.classList.contains('motion-paused') ? 'auto' : 'smooth' });
  }
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  let frame = 0;
  function update() {
    frame = 0;
    previous.disabled = gallery.scrollLeft <= 2;
    next.disabled = gallery.scrollLeft + gallery.clientWidth >= gallery.scrollWidth - 2;
  }
  gallery.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(update).observe(gallery);
  desktop.addEventListener('change', () => { gallery.scrollLeft = 0; update(); });
  gallery.querySelectorAll('img').forEach(img => img.addEventListener('load', update));
  update();
});
