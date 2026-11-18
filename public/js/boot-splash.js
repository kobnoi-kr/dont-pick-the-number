(function () {
  var el = document.getElementById("nvBoot");
  if (!el) return;

  var MIN_MS = 700;
  var MAX_MS = 12000;
  var started = Date.now();
  var pageReady = document.readyState === "complete";
  var logoReady = false;
  var done = false;

  var logo = el.querySelector(".nv-boot-logo");
  function markLogoReady() {
    logoReady = true;
    tryHide();
  }
  if (logo) {
    if (logo.complete && logo.naturalWidth > 0) {
      logoReady = true;
    } else {
      logo.addEventListener("load", markLogoReady, { once: true });
      logo.addEventListener("error", markLogoReady, { once: true });
    }
  } else {
    logoReady = true;
  }

  function hide() {
    if (done) return;
    done = true;
    var wait = Math.max(0, MIN_MS - (Date.now() - started));
    window.setTimeout(function () {
      el.classList.add("is-done");
      el.setAttribute("aria-busy", "false");
      window.setTimeout(function () {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, 420);
    }, wait);
  }

  function tryHide() {
    if (pageReady && logoReady) hide();
  }

  function onPageReady() {
    pageReady = true;
    tryHide();
  }

  if (document.readyState === "complete") {
    onPageReady();
  } else {
    window.addEventListener("load", onPageReady, { once: true });
  }

  window.addEventListener(
    "pageshow",
    function (ev) {
      if (ev.persisted) hide();
    },
    { once: true }
  );

  window.setTimeout(hide, MAX_MS);
})();
