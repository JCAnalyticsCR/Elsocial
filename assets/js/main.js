/**
 * el Social — Client-Side Microinteractions & State Machine
 * Zero external dependencies, vanilla modern ES6+
 *
 * Modules:
 * 1. Sticky Header & Glassmorphism Blur on Scroll (> 30px)
 * 2. Scrollspy Viewport Tracking (IntersectionObserver & Nav Links Active State)
 * 3. Mobile Navigation Drawer (Toggle, Close, Backdrop, Escape, Anchor Clicks)
 * 4. Experience Category Tabs & Card Filtering (data-category)
 * 5. Gallery Lightbox Modal (Zoom, Captions, Backdrop Dismiss, Keyboard Escape)
 * 6. Reservation Form Validation & Toast Notification (Regex, Feedback, Auto-dismiss)
 * 7. Secondary Handlers (Newsletter form, smooth scroll anchors)
 * 8. Hero Photo Relay (crossfade, pausa en pestaña oculta y con movimiento reducido)
 * 9. Cinta de propuesta (la cabecera fija se corre mientras la cinta se ve)
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* =========================================================================
     1. STICKY HEADER & GLASSMORPHISM
     ========================================================================= */
  const header = document.getElementById('main-header');
  const SCROLL_THRESHOLD = 30;

  function updateHeaderState() {
    if (!header) return;
    const isScrolled = window.scrollY > SCROLL_THRESHOLD;
    header.classList.toggle('scrolled', isScrolled);
    header.classList.toggle('header-scrolled', isScrolled);
    header.classList.toggle('backdrop-blur', isScrolled);
  }

  window.addEventListener('scroll', updateHeaderState, { passive: true });
  updateHeaderState(); // Initial check on load

  /* =========================================================================
     2. SCROLLSPY (INTERSECTION OBSERVER & ACTIVE NAV LINKS)
     ========================================================================= */
  const navLinks = Array.from(document.querySelectorAll('#main-header .nav-link, #mobile-drawer .drawer-link'));
  const sectionIds = ['hero', 'historia', 'experiencias', 'galeria', 'horarios', 'contacto', 'reserva'];
  const sections = sectionIds
    .map(id => document.getElementById(id))
    .filter(Boolean);

  function setActiveNavLink(targetId) {
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === `#${targetId}`) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });
  }

  if ('IntersectionObserver' in window && sections.length > 0) {
    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0
    };

    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveNavLink(entry.target.id);
        }
      });
    }, observerOptions);

    sections.forEach(sec => sectionObserver.observe(sec));
  } else {
    // Fallback scroll listener for scrollspy
    window.addEventListener('scroll', () => {
      const scrollPos = window.scrollY + 120;
      for (let i = sections.length - 1; i >= 0; i--) {
        const sec = sections[i];
        if (sec.offsetTop <= scrollPos) {
          setActiveNavLink(sec.id);
          break;
        }
      }
    }, { passive: true });
  }

  /* =========================================================================
     3. MOBILE NAVIGATION DRAWER
     ========================================================================= */
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileDrawer = document.getElementById('mobile-drawer');
  const mobileDrawerClose = document.getElementById('mobile-drawer-close');
  const mobileDrawerBackdrop = document.getElementById('mobile-drawer-backdrop');
  const drawerLinks = Array.from(document.querySelectorAll('#mobile-drawer a'));

  function openMobileDrawer() {
    if (!mobileDrawer || !mobileMenuBtn) return;
    mobileDrawer.classList.add('is-open', 'active');
    mobileDrawer.setAttribute('aria-hidden', 'false');
    mobileMenuBtn.classList.add('is-active', 'active');
    mobileMenuBtn.setAttribute('aria-expanded', 'true');
    if (mobileDrawerBackdrop) {
      mobileDrawerBackdrop.classList.add('is-visible', 'active');
      mobileDrawerBackdrop.setAttribute('aria-hidden', 'false');
    }
    document.body.style.overflow = 'hidden';
  }

  function closeMobileDrawer() {
    if (!mobileDrawer || !mobileMenuBtn) return;
    mobileDrawer.classList.remove('is-open', 'active');
    mobileDrawer.setAttribute('aria-hidden', 'true');
    mobileMenuBtn.classList.remove('is-active', 'active');
    mobileMenuBtn.setAttribute('aria-expanded', 'false');
    if (mobileDrawerBackdrop) {
      mobileDrawerBackdrop.classList.remove('is-visible', 'active');
      mobileDrawerBackdrop.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
  }

  function toggleMobileDrawer() {
    if (!mobileDrawer) return;
    const isOpen = mobileDrawer.classList.contains('is-open') || mobileDrawer.classList.contains('active');
    if (isOpen) {
      closeMobileDrawer();
    } else {
      openMobileDrawer();
    }
  }

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleMobileDrawer();
    });
  }

  if (mobileDrawerClose) {
    mobileDrawerClose.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileDrawer();
    });
  }

  if (mobileDrawerBackdrop) {
    mobileDrawerBackdrop.addEventListener('click', closeMobileDrawer);
  }

  drawerLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeMobileDrawer();
    });
  });

  /* =========================================================================
     4. INTERACTIVE EXPERIENCE CATEGORY TABS & FILTERING
     ========================================================================= */
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn[data-category]'));
  const experienceCards = Array.from(document.querySelectorAll('.experience-card'));

  function filterExperiences(category) {
    experienceCards.forEach(card => {
      const cardCat = card.getAttribute('data-category');
      if (category === 'all' || !category || cardCat === category) {
        card.style.display = 'flex';
        // Add subtle animation cue
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      } else {
        card.style.display = 'none';
      }
    });
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetCategory = btn.getAttribute('data-category');

      // Toggle active states
      tabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      // Filter experience cards
      filterExperiences(targetCategory);
    });
  });

  /* =========================================================================
     5. GALLERY LIGHTBOX MODAL & FOCUS MANAGEMENT
     ========================================================================= */
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxCloseBtn = lightboxClose;
  const lightboxBackdrop = document.getElementById('lightbox-backdrop');
  const galleryCards = Array.from(document.querySelectorAll('.gallery-card'));

  let lastFocusedElement = null;
  const galleryPrevious = document.getElementById('gallery-prev');
  const galleryNext = document.getElementById('gallery-next');
  const galleryPosition = document.getElementById('gallery-position');
  let gallerySequence = [];
  let galleryIndex = 0;

  function updateGalleryPosition() {
    if (galleryPosition) galleryPosition.textContent = `${galleryIndex + 1} / ${gallerySequence.length}`;
    if (galleryPrevious) galleryPrevious.disabled = gallerySequence.length < 2;
    if (galleryNext) galleryNext.disabled = gallerySequence.length < 2;
  }

  function stepGallery(direction) {
    if (lightboxModal?.getAttribute('aria-hidden') !== 'false' || gallerySequence.length < 2) return;
    galleryIndex = (galleryIndex + direction + gallerySequence.length) % gallerySequence.length;
    const card = gallerySequence[galleryIndex];
    const caption = card.getAttribute('data-caption') || card.querySelector('img')?.alt || '';
    lightboxImg.src = card.getAttribute('data-full') || card.querySelector('img').src;
    lightboxImg.alt = caption;
    lightboxCaption.textContent = caption;
    updateGalleryPosition();
  }
  galleryPrevious?.addEventListener('click', () => stepGallery(-1));
  galleryNext?.addEventListener('click', () => stepGallery(1));
  let swipeStart = null;
  lightboxImg?.addEventListener('touchstart', event => {
    swipeStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true });
  lightboxImg?.addEventListener('touchmove', event => {
    if (event.touches.length !== 1) swipeStart = null;
  }, { passive: true });
  lightboxImg?.addEventListener('touchcancel', () => { swipeStart = null; });
  lightboxImg?.addEventListener('touchend', event => {
    if (!swipeStart || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - swipeStart.x;
    const dy = event.changedTouches[0].clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) stepGallery(dx < 0 ? 1 : -1);
  }, { passive: true });

  function openLightboxModal(imgSrc, captionText, triggerEl) {
    if (!lightboxModal) return;
    lastFocusedElement = triggerEl || document.activeElement;
    const group = triggerEl?.closest('.photo-gallery, .campaigns-grid, .carta-cards');
    gallerySequence = group ? Array.from(group.querySelectorAll('.gallery-card')) : galleryCards;
    galleryIndex = Math.max(0, gallerySequence.indexOf(triggerEl));
    updateGalleryPosition();

    if (lightboxImg && imgSrc) {
      const currentSrc = lightboxImg.getAttribute('src');
      if (currentSrc !== imgSrc && !lightboxImg.src.endsWith(imgSrc.replace(/^\.\//, ''))) {
        lightboxImg.src = imgSrc;
      }
      lightboxImg.alt = captionText || 'Vista ampliada de galería';
    }
    if (lightboxCaption && captionText) {
      lightboxCaption.textContent = captionText;
    }
    lightboxModal.classList.add('active', 'is-active', 'is-open');
    lightboxModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (lightboxCloseBtn) {
      lightboxCloseBtn.focus();
    }
  }

  const openLightbox = openLightboxModal;

  function closeLightboxModal() {
    if (!lightboxModal) return;
    lightboxModal.classList.remove('active', 'is-active', 'is-open');
    lightboxModal.setAttribute('aria-hidden', 'true');
    swipeStart = null;
    document.body.style.overflow = '';

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  }

  const closeLightbox = closeLightboxModal;

  galleryCards.forEach(card => {
    function handleCardActivation() {
      const fullSrc = card.getAttribute('data-full') || card.querySelector('img')?.src;
      const caption = card.getAttribute('data-caption') || card.querySelector('.gallery-card-title')?.textContent || '';
      openLightboxModal(fullSrc, caption, card);
    }

    card.addEventListener('click', handleCardActivation);

    // Keyboard accessibility for gallery cards
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCardActivation();
      }
    });
  });

  if (lightboxCloseBtn) {
    lightboxCloseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeLightboxModal();
    });
  }

  if (lightboxBackdrop) {
    lightboxBackdrop.addEventListener('click', closeLightboxModal);
  }

  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) {
        closeLightboxModal();
      }
    });
  }

  /* Global Keyboard Listeners: Tab Trapping inside Lightbox & Escape Dismissal */
  document.addEventListener('keydown', (e) => {
    const isLightboxActive = lightboxModal && (
      lightboxModal.classList.contains('active') ||
      lightboxModal.classList.contains('is-active') ||
      lightboxModal.classList.contains('is-open') ||
      lightboxModal.getAttribute('aria-hidden') === 'false'
    );

    // Modal focus trap for Tab and Shift+Tab
    if (isLightboxActive && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      stepGallery(e.key === 'ArrowRight' ? 1 : -1);
    }
    if (isLightboxActive && e.key === 'Tab') {
      const focusableElements = Array.from(lightboxModal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });

      if (focusableElements.length > 0) {
        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl || !lightboxModal.contains(document.activeElement)) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl || !lightboxModal.contains(document.activeElement)) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      } else {
        e.preventDefault();
      }
    }

    if (e.key === 'Escape' || e.keyCode === 27) {
      // Dismiss lightbox if open
      if (isLightboxActive) {
        closeLightboxModal();
      }
      // Dismiss mobile drawer if open
      if (mobileDrawer && (mobileDrawer.classList.contains('is-open') || mobileDrawer.classList.contains('active'))) {
        closeMobileDrawer();
      }
    }
  });

  /* =========================================================================
     6. RESERVATION FORM VALIDATION & FEEDBACK TOAST
     ========================================================================= */
  const reservationForm = document.getElementById('reservation-form');
  const reservationToast = document.getElementById('reservation-toast');
  const resName = document.getElementById('res-name');
  const resPhone = document.getElementById('res-phone');
  const resEmail = document.getElementById('res-email');
  const resDate = document.getElementById('res-date');

  let toastTimer = null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setFieldValidity(input, isValid) {
    if (!input) return;
    if (isValid) {
      input.classList.remove('is-invalid');
    } else {
      input.classList.add('is-invalid');
    }
  }

  function showReservationToast() {
    if (!reservationToast) return;
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    reservationToast.classList.add('show', 'active', 'is-visible');

    toastTimer = setTimeout(() => {
      reservationToast.classList.remove('show', 'active', 'is-visible');
      toastTimer = null;
    }, 4000);
  }

  if (reservationForm) {
    // Live validation feedback on input / change
    [resName, resPhone, resEmail, resDate].forEach(field => {
      if (!field) return;
      field.addEventListener('input', () => {
        if (field === resEmail) {
          if (emailRegex.test(field.value.trim())) {
            setFieldValidity(field, true);
          }
        } else if (field.value.trim() !== '') {
          setFieldValidity(field, true);
        }
      });
    });

    reservationForm.addEventListener('submit', (e) => {
      e.preventDefault();

      let isFormValid = true;
      let firstInvalidField = null;

      // 1. Validate Name
      if (!resName || resName.value.trim() === '') {
        setFieldValidity(resName, false);
        isFormValid = false;
        firstInvalidField = firstInvalidField || resName;
      } else {
        setFieldValidity(resName, true);
      }

      // 2. Validate Phone
      if (!resPhone || resPhone.value.trim().length < 7) {
        setFieldValidity(resPhone, false);
        isFormValid = false;
        firstInvalidField = firstInvalidField || resPhone;
      } else {
        setFieldValidity(resPhone, true);
      }

      // 3. Validate Email
      if (!resEmail || !emailRegex.test(resEmail.value.trim())) {
        setFieldValidity(resEmail, false);
        isFormValid = false;
        firstInvalidField = firstInvalidField || resEmail;
      } else {
        setFieldValidity(resEmail, true);
      }

      // 4. Validate Date
      if (!resDate || resDate.value.trim() === '') {
        setFieldValidity(resDate, false);
        isFormValid = false;
        firstInvalidField = firstInvalidField || resDate;
      } else {
        setFieldValidity(resDate, true);
      }

      if (!isFormValid) {
        if (firstInvalidField) {
          firstInvalidField.focus();
        }
        return;
      }

      // Form is fully valid
      showReservationToast();
      reservationForm.reset();

      // Clear any remaining validation styling
      [resName, resPhone, resEmail, resDate].forEach(field => {
        setFieldValidity(field, true);
      });
    });
  }

  /* =========================================================================
     7. NEWSLETTER FORM HANDLER
     ========================================================================= */
  const newsletterForm = document.getElementById('newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = newsletterForm.querySelector('input[type="email"]');
      if (emailInput && emailRegex.test(emailInput.value.trim())) {
        emailInput.value = '';
        const submitBtn = newsletterForm.querySelector('button[type="submit"]');
        if (submitBtn) {
          const originalText = submitBtn.textContent;
          submitBtn.textContent = '¡Suscrito!';
          setTimeout(() => {
            submitBtn.textContent = originalText;
          }, 3000);
        }
      }
    });
  }

  /* =========================================================================
     8. RELEVO DE FOTOGRAFÍAS DEL HERO
     ========================================================================= */
  const heroSlides = Array.from(document.querySelectorAll('.hero-slide'));

  if (heroSlides.length > 1) {
    const RELEVO_MS = 6500;
    const quietud = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = heroSlides.findIndex(s => s.classList.contains('is-active'));
    let temporizador = null;
    let pausaManual = false;

    if (visible < 0) {
      visible = 0;
      heroSlides[0].classList.add('is-active');
    }

    function avanzarSlide() {
      heroSlides[visible].classList.remove('is-active');
      visible = (visible + 1) % heroSlides.length;
      heroSlides[visible].classList.add('is-active');
    }

    function arrancarRelevo() {
      // Quien pidió menos movimiento se queda con la primera fotografía fija.
      if (temporizador || quietud.matches || pausaManual || document.hidden) return;
      temporizador = setInterval(avanzarSlide, RELEVO_MS);
    }

    function detenerRelevo() {
      if (!temporizador) return;
      clearInterval(temporizador);
      temporizador = null;
    }

    arrancarRelevo();

    document.addEventListener('social:motion', event => {
      pausaManual = event.detail.paused;
      if (pausaManual) detenerRelevo();
      else arrancarRelevo();
    });

    // Sin esto el relevo sigue corriendo —y repintando— con la pestaña oculta.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        detenerRelevo();
      } else {
        arrancarRelevo();
      }
    });

    // El sistema puede cambiar la preferencia con la página ya abierta.
    const alCambiarQuietud = () => (quietud.matches ? detenerRelevo() : arrancarRelevo());
    if (typeof quietud.addEventListener === 'function') {
      quietud.addEventListener('change', alCambiarQuietud);
    } else if (typeof quietud.addListener === 'function') {
      quietud.addListener(alCambiarQuietud);
    }
  }

  /* =========================================================================
     9. CINTA DE PROPUESTA Y CABECERA FIJA
     ========================================================================= */
  const cintaPropuesta = document.querySelector('.cinta-propuesta');

  if (cintaPropuesta && header) {
    // La cinta puede ocupar una o dos líneas según el ancho: se mide, no se
    // asume. La cabecera baja mientras quede cinta visible y sube al pasarla.
    const acomodarCabecera = () => {
      const alto = cintaPropuesta.offsetHeight;
      const visible = Math.max(0, Math.min(alto, cintaPropuesta.getBoundingClientRect().bottom));
      header.style.top = visible + 'px';
    };

    acomodarCabecera();
    window.addEventListener('scroll', acomodarCabecera, { passive: true });
    window.addEventListener('resize', acomodarCabecera);

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(acomodarCabecera).observe(cintaPropuesta);
    }
  }
});
