(function () {
  var el = document.getElementById("nvBoot");
  if (!el) return;

  var MIN_MS = 420;
  var MAX_MS = 10000;
  var started = Date.now();
  var done = false;

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

  if (document.readyState === "complete") {
    hide();
  } else {
    window.addEventListener("load", hide, { once: true });
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
