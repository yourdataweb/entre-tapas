/* ==========================================================================
   Entre Tapas — progressive enhancement
   Content is server-rendered in every locale, so this file only adds
   behaviour: sticky header, mobile drawer, current year.
   Nothing here is required to read the page.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- header ---------- */
  function initHeader() {
    const header = $('.site-header');
    const toggle = $('.nav-toggle');
    const drawer = $('#mobile-nav');
    if (!header) return;

    const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    if (!toggle || !drawer) return;

    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      const labelOpen = toggle.dataset.labelOpen || 'Open menu';
      const labelClose = toggle.dataset.labelClose || 'Close menu';
      toggle.setAttribute('aria-label', open ? labelClose : labelOpen);
      drawer.hidden = !open;
      document.body.classList.toggle('nav-open', open);
    };

    toggle.addEventListener('click', () => {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    drawer.addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });

    // close the drawer if the viewport grows past the mobile breakpoint
    const mq = window.matchMedia('(min-width: 781px)');
    const onChange = (e) => { if (e.matches) setOpen(false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
  }

  /* ---------- misc ---------- */
  function initMisc() {
    const y = $('#year');
    if (y) y.textContent = String(new Date().getFullYear());

    // External links: make the "new tab" behaviour explicit for assistive tech.
    $$('a[target="_blank"]').forEach((a) => {
      if (!a.getAttribute('rel')?.includes('noopener')) {
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  function boot() {
    initHeader();
    initMisc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
