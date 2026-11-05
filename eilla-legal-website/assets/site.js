/* Anand Verma & Co. — shared interactions */
(function () {
  "use strict";

  /* mark JS available so CSS can safely hide reveal elements */
  document.documentElement.classList.add("js");

  /* mobile nav toggle */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-nav-toggle]");
    if (t) {
      var nav = document.getElementById("primary-nav");
      if (nav) nav.classList.toggle("is-open");
    }
  });

  /* count-up */
  function runCount(el) {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    var to = parseFloat(el.getAttribute("data-to")) || 0;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { el.textContent = to; return; }
    var start = null, dur = 1500;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * to);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function init() {
    var counts = [].slice.call(document.querySelectorAll("[data-to]"));
    var reveals = [].slice.call(document.querySelectorAll(".reveal"));
    var ticking = false;

    function check() {
      ticking = false;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      counts = counts.filter(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < vh * 0.85 && r.bottom > 0) { runCount(el); return false; }
        return true;
      });
      reveals = reveals.filter(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < vh * 0.9 && r.bottom > 0) { el.classList.add("in"); return false; }
        return true;
      });
    }

    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(check); }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    check();

    /* safety net: never leave content hidden, even if scroll events misbehave */
    setTimeout(check, 400);
    setTimeout(function () {
      reveals.forEach(function (el) { el.classList.add("in"); });
      counts.forEach(runCount);
    }, 2500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
