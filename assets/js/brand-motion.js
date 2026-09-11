/** Progressive motion: content remains visible without JS or IntersectionObserver. */
document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const button = document.querySelector('.motion-toggle');
  const progress = document.querySelector('.reading-progress');
  let paused = preference.matches;
  const animations = new Set();

  function syncMotion() {
    root.classList.toggle('motion-paused', paused);
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Activar animaciones' : 'Pausar animaciones');
    button.querySelector('.motion-label').textContent = paused ? 'Activar movimiento' : 'Pausar movimiento';
    button.firstElementChild.textContent = paused ? '▷' : 'Ⅱ';
    if (paused) animations.forEach(animation => animation.finish());
    document.dispatchEvent(new CustomEvent('social:motion', { detail: { paused } }));
  }
  button.addEventListener('click', () => { paused = !paused; syncMotion(); });
  preference.addEventListener('change', () => { paused = preference.matches; syncMotion(); });
  syncMotion();

  // A small editorial planner: every choice remains a normal keyboard-operable button.
  const planner = document.querySelector('.social-planner');
  if (planner) {
    const moments = {
      dia: { kicker: '01 / EL GUSTO DE ENCONTRARNOS', title: 'Una boca.\nUna buena pausa.', text: 'Algo para picar, una bebida y una mesa para ponernos al día.', shift: 'Almuerzo' },
      tarde: { kicker: '02 / LA TARDE ES NUESTRA', title: 'Una birra.\nCero prisa.', text: 'Bancas afuera, algo para picar y una conversación que se alarga sola.', shift: 'Tardeada' },
      noche: { kicker: '03 / QUE LA NOCHE NOS ENCUENTRE', title: 'Otra ronda.\nOtra historia.', text: 'Cocteles de la casa, un brindis con tu gente y canciones que nos sabemos todos.', shift: 'Noche' }
    };
    const choices = [...planner.querySelectorAll('button[data-moment]')];
    const ticket = planner.querySelector('.ticket-content');
    let ticketAnimation;
    choices.forEach(choice => choice.addEventListener('click', () => {
      const key = choice.dataset.moment;
      if (planner.dataset.moment === key) return;
      const moment = moments[key];
      planner.dataset.moment = key;
      choices.forEach(item => item.setAttribute('aria-pressed', String(item === choice)));
      planner.querySelectorAll('[data-scene]').forEach(img => img.classList.toggle('scene-active', img.dataset.scene === key));
      ticket.querySelector('.ticket-kicker').textContent = moment.kicker;
      const title = ticket.querySelector('h3');
      title.replaceChildren();
      moment.title.split('\n').forEach((line, index) => {
        if (index) title.append(document.createElement('br'));
        title.append(document.createTextNode(line));
      });
      ticket.querySelector('p').textContent = moment.text;
      planner.querySelector('.ticket-bottom > span:last-child').textContent = `${moment.kicker.slice(0, 2)} — 03`;
      if (ticketAnimation) { animations.delete(ticketAnimation); ticketAnimation.cancel(); }
      if (!paused && !preference.matches && ticket.animate) {
        ticketAnimation = ticket.animate([{ opacity: .25, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 450, easing: 'cubic-bezier(.22,1,.36,1)' });
        animations.add(ticketAnimation);
        const currentAnimation = ticketAnimation;
        currentAnimation.onfinish = () => animations.delete(currentAnimation);
      }
    }));
    planner.querySelector('.ticket-cta').addEventListener('click', () => {
      const select = document.getElementById('res-shift');
      const desired = moments[planner.dataset.moment].shift;
      const option = select && [...select.options].find(item => item.textContent.startsWith(desired));
      if (option) { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  // One frame per pointer update. Touch devices and reduced motion stay still.
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  document.querySelectorAll('.social-photo').forEach(photo => {
    let tiltFrame = 0;
    let pointerX = 0;
    let pointerY = 0;
    const resetTilt = () => {
      cancelAnimationFrame(tiltFrame);
      tiltFrame = 0;
      photo.classList.remove('is-tilting');
    };
    photo.addEventListener('pointermove', event => {
      if (paused || preference.matches || !finePointer.matches) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (tiltFrame) return;
      tiltFrame = requestAnimationFrame(() => {
        tiltFrame = 0;
        const rect = photo.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (pointerX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height));
        photo.style.setProperty('--tilt-x', `${(0.5 - y) * 9}deg`);
        photo.style.setProperty('--tilt-y', `${(x - 0.5) * 9}deg`);
        photo.style.setProperty('--shine-x', `${x * 100}%`);
        photo.style.setProperty('--shine-y', `${y * 100}%`);
        photo.classList.add('is-tilting');
      });
    });
    photo.addEventListener('pointerleave', resetTilt);
    photo.addEventListener('pointercancel', resetTilt);
    document.addEventListener('social:motion', resetTilt);
  });

  let frame = 0;
  function updateProgress() {
    const available = root.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${available > 0 ? Math.min(1, Math.max(0, scrollY / available)) : 0})`;
    frame = 0;
  }
  function scheduleProgress() { if (!frame) frame = requestAnimationFrame(updateProgress); }
  addEventListener('scroll', scheduleProgress, { passive: true });
  addEventListener('resize', scheduleProgress);
  updateProgress();

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (paused || preference.matches || !entry.target.animate) return;
        const animation = entry.target.animate([
          { opacity: .15, transform: 'translateY(28px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 750, easing: 'cubic-bezier(.22,1,.36,1)' });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      });
    }, { threshold: .12 });
    document.querySelectorAll('.section-title, .value-card, .experience-card, .noche-card, .story-img-wrapper').forEach(element => observer.observe(element));
  }
});
