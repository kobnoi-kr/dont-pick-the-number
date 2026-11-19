(function () {
  "use strict";

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function phaseLabel(phase) {
    const map = {
      ROLE_REVEAL: "เปิดบทบาท",
      CLUE_TURN: "ให้คำใบ้",
      DISCUSSION: "พูดคุย",
      VOTING: "โหวต",
      VOTE_RESULT: "ผลโหวต",
      GUESS: "Imposter ทายคำ",
      FINISHED: "จบเกม"
    };
    return map[phase] || phase || "—";
  }

  function formatLeft(ms) {
    const s = Math.max(0, Math.ceil((ms || 0) / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? m + ":" + String(r).padStart(2, "0") : String(s) + "s";
  }

  function createLiveUi(opts) {
    const root = opts.root;
    const send = opts.send || function () {};
    let lastPrivate = null;
    let lastPublic = null;
    let pickedVote = null;
    let popupShownForRound = "";

    root.innerHTML = `
      <div class="imp-root">
        <div class="imp-phase">
          <h2 class="imp-phase-title" data-imp="phaseTitle">—</h2>
          <div class="imp-timer" data-imp="timer">—</div>
        </div>
        <p class="sub" data-imp="sub"></p>
        <div class="imp-alive" data-imp="alive"></div>
        <ul class="imp-clue-board" data-imp="clues"></ul>
        <form class="imp-clue-form hidden" data-imp="clueForm" autocomplete="off">
          <input data-imp="clueInput" maxlength="32" placeholder="พิมพ์คำใบ้ 1 คำ/สั้นๆ" aria-label="คำใบ้">
          <button class="btn" type="submit">ส่งคำใบ้</button>
          <button class="btn ghost" type="button" data-imp="skipClue">ข้าม</button>
        </form>
        <div class="imp-vote-grid hidden" data-imp="votes"></div>
        <button class="btn ghost hidden" type="button" data-imp="abstain">งดโหวต</button>
        <ul class="imp-tallies hidden" data-imp="tallies"></ul>
        <form class="imp-guess-form hidden" data-imp="guessForm" autocomplete="off">
          <input data-imp="guessInput" maxlength="48" placeholder="ทายคำศัพท์" aria-label="ทายคำ">
          <button class="btn" type="submit">ทายคำ</button>
        </form>
      </div>
      <div class="imp-overlay hidden" data-imp="overlay" role="dialog" aria-modal="true">
        <div class="imp-popup" data-imp="popup">
          <h2 data-imp="popTitle"></h2>
          <div class="imp-word" data-imp="popWord"></div>
          <p class="imp-hint" data-imp="popHint"></p>
          <button type="button" class="btn" data-imp="popOk">เข้าใจแล้ว</button>
        </div>
      </div>
    `;

    const $ = (k) => root.querySelector('[data-imp="' + k + '"]');
    const clueForm = $("clueForm");
    const guessForm = $("guessForm");
    const overlay = $("overlay");
    const popup = $("popup");

    clueForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = ($("clueInput").value || "").trim();
      send({ t: "imposter:clue", text });
      $("clueInput").value = "";
    });
    $("skipClue").onclick = () => send({ t: "imposter:skipClue" });
    $("abstain").onclick = () => send({ t: "imposter:vote", targetId: null });
    guessForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const word = ($("guessInput").value || "").trim();
      send({ t: "imposter:guess", word });
      $("guessInput").value = "";
    });
    $("popOk").onclick = () => {
      overlay.classList.add("hidden");
      send({ t: "imposter:confirm" });
    };

    function showPopup(priv) {
      if (!priv) return;
      const isImp = priv.role === "imposter";
      popup.classList.toggle("is-imposter", isImp);
      if (isImp) {
        $("popTitle").textContent = "YOU ARE THE IMPOSTER";
        $("popWord").textContent = priv.category ? "หมวด: " + priv.category : "คุณคือ Imposter!";
        $("popHint").textContent = priv.category
          ? "คุณเห็นแค่หมวดหมู่ — สังเกตคำใบ้แล้วกลมกลืน"
          : "พยายามสังเกตคำใบ้ของผู้เล่นคนอื่น และกลมกลืนไปกับพวกเขา";
      } else {
        $("popTitle").textContent = "YOUR WORD";
        $("popWord").textContent = priv.word || "—";
        $("popHint").textContent = "จดจำคำศัพท์ของคุณ และให้คำใบ้โดยไม่พูดคำศัพท์ตรง ๆ";
      }
      overlay.classList.remove("hidden");
    }

    function paint(state, priv) {
      lastPublic = state || null;
      lastPrivate = priv || lastPrivate;
      if (!state) return;

      $("phaseTitle").textContent = phaseLabel(state.phase) + " · รอบ " + (state.round || 1);
      $("timer").textContent = state.phaseEndsAt ? formatLeft(state.phaseLeft) : "—";

      const turnName =
        state.clueTurnId && state.names ? state.names[state.clueTurnId] || "—" : "";
      let sub = "";
      if (state.phase === "ROLE_REVEAL") sub = "ดูบทบาทของคุณในหน้าต่างกลางจอ";
      else if (state.phase === "CLUE_TURN")
        sub = state.yourTurn ? "ถึงตาคุณให้คำใบ้" : "รอ " + turnName + " ให้คำใบ้";
      else if (state.phase === "DISCUSSION") sub = "คุยกันผ่านแชทในห้อง";
      else if (state.phase === "VOTING") sub = "เลือกผู้ต้องสงสัย (โหวตตัวเองไม่ได้)";
      else if (state.phase === "VOTE_RESULT") sub = "สรุปผลโหวต";
      else if (state.phase === "GUESS") sub = "Imposter ที่ถูกจับทายคำศัพท์";
      else if (state.phase === "FINISHED") sub = state.winReason || "";
      $("sub").textContent = sub;

      const aliveSet = new Set(state.alive || []);
      $("alive").innerHTML = (state.order || [])
        .map((id) => {
          const name = (state.names && state.names[id]) || id;
          return `<span class="${aliveSet.has(id) ? "" : "is-out"}">${esc(name)}</span>`;
        })
        .join("");

      $("clues").innerHTML = (state.clues || [])
        .map(
          (c) =>
            `<li><span class="who">${esc(c.name)}</span><span class="text">${esc(c.text)}</span></li>`
        )
        .join("");

      const clueOn = state.phase === "CLUE_TURN" && state.yourTurn;
      clueForm.classList.toggle("hidden", !clueOn);

      const voteOn = state.phase === "VOTING" && state.canVote;
      $("votes").classList.toggle("hidden", state.phase !== "VOTING");
      $("abstain").classList.toggle("hidden", !voteOn);
      if (state.phase === "VOTING") {
        $("votes").innerHTML = (state.alive || [])
          .filter((id) => id !== (opts.youId && opts.youId()))
          .map((id) => {
            const name = (state.names && state.names[id]) || id;
            const on = pickedVote === id ? " is-picked" : "";
            const disabled = voteOn ? "" : " disabled";
            return `<button type="button" class="btn ghost${on}" data-vote="${esc(id)}"${disabled}>${esc(
              name
            )}</button>`;
          })
          .join("");
        $("votes").querySelectorAll("[data-vote]").forEach((btn) => {
          btn.onclick = () => {
            if (!voteOn) return;
            pickedVote = btn.getAttribute("data-vote");
            send({ t: "imposter:vote", targetId: pickedVote });
          };
        });
      } else {
        pickedVote = null;
      }

      const tallies = state.voteTallies && state.voteTallies.entries;
      $("tallies").classList.toggle(
        "hidden",
        !(state.phase === "VOTE_RESULT" || state.phase === "FINISHED") || !tallies
      );
      if (tallies) {
        $("tallies").innerHTML = tallies
          .map(
            (t) =>
              `<li><span>${esc(t.name)}</span><b>${t.count} โหวต</b></li>`
          )
          .join("");
      }

      const guessOn = state.phase === "GUESS" && state.canGuess;
      guessForm.classList.toggle("hidden", state.phase !== "GUESS");
      $("guessInput").disabled = !guessOn;
      guessForm.querySelector("button[type=submit]").disabled = !guessOn;

      const key = (state.round || 1) + ":" + (state.phase || "");
      if (state.phase === "ROLE_REVEAL" && lastPrivate && popupShownForRound !== key) {
        if (!lastPrivate.confirmed) {
          showPopup(lastPrivate);
          popupShownForRound = key;
        }
      }
      if (state.phase !== "ROLE_REVEAL") {
        overlay.classList.add("hidden");
      }
    }

    function tickClock() {
      if (!lastPublic || !lastPublic.phaseEndsAt) return;
      const left = Math.max(0, lastPublic.phaseEndsAt - Date.now());
      $("timer").textContent = formatLeft(left);
    }
    setInterval(tickClock, 250);

    return {
      paint,
      setYouId(fn) {
        opts.youId = fn;
      }
    };
  }

  window.NVImposter = { createLiveUi };
})();
