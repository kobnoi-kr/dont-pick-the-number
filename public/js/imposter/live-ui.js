(function () {
  "use strict";

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function phaseLabel(phase) {
    const map = {
      CARD_PICK: "จั่วการ์ด",
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

  function initialOf(name) {
    const t = String(name || "?").trim();
    return t ? t.slice(0, 1).toUpperCase() : "?";
  }

  function createLiveUi(opts) {
    const root = opts.root;
    const send = opts.send || function () {};
    let lastPrivate = null;
    let lastPublic = null;
    let lastMeta = { players: [], youId: "" };
    let pickedVote = null;
    let popupOpen = false;

    root.innerHTML = `
      <div class="imp-root">
        <div class="imp-phase">
          <h2 class="imp-phase-title" data-imp="phaseTitle">—</h2>
          <div class="imp-timer" data-imp="timer">—</div>
        </div>
        <p class="sub" data-imp="sub"></p>
        <div class="imp-card-grid hidden" data-imp="cardGrid" role="group" aria-label="การ์ดบทบาท"></div>
        <div class="imp-you-profile hidden" data-imp="youProfile" aria-live="polite"></div>
        <div class="imp-roster" data-imp="roster" role="list" aria-label="ผู้เล่นในห้อง"></div>
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
    `;

    // Mount overlay on body so it is never clipped by stage/layout.
    let overlay = document.getElementById("impRoleOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "impRoleOverlay";
      overlay.className = "imp-overlay hidden";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.innerHTML = `
        <div class="imp-popup" data-imp-pop="popup">
          <h2 data-imp-pop="popTitle"></h2>
          <div class="imp-word" data-imp-pop="popWord"></div>
          <p class="imp-hint" data-imp-pop="popHint"></p>
          <button type="button" class="btn" data-imp-pop="popOk">เข้าใจแล้ว</button>
        </div>`;
      document.body.appendChild(overlay);
    }

    const $ = (k) => root.querySelector('[data-imp="' + k + '"]');
    const $p = (k) => overlay.querySelector('[data-imp-pop="' + k + '"]');
    const clueForm = $("clueForm");
    const guessForm = $("guessForm");
    const popup = $p("popup");

    function confirmRole() {
      popupOpen = false;
      overlay.classList.add("hidden");
      send({ t: "imposter:confirm" });
    }

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
    $p("popOk").onclick = confirmRole;

    function playerMeta(id) {
      const list = lastMeta.players || [];
      return list.find((p) => p && String(p.id) === String(id)) || null;
    }

    function avatarHtml(meta, name, cls) {
      const av = meta && meta.avatarUrl ? String(meta.avatarUrl) : "";
      if (av) {
        return `<img class="${cls}" src="${esc(av)}" alt="" loading="lazy">`;
      }
      return `<div class="${cls} is-ph" aria-hidden="true">${esc(initialOf(name))}</div>`;
    }

    function fillRoleCopy(priv, titleEl, wordEl, hintEl) {
      const isImp = priv.role === "imposter";
      if (isImp) {
        titleEl.textContent = "YOU ARE THE IMPOSTER";
        wordEl.textContent = priv.category ? "หมวด: " + priv.category : "คุณคือ Imposter!";
        hintEl.textContent = priv.category
          ? "คุณเห็นแค่หมวดหมู่ — สังเกตคำใบ้แล้วกลมกลืน"
          : "พยายามสังเกตคำใบ้ของผู้เล่นคนอื่น และกลมกลืนไปกับพวกเขา";
      } else {
        titleEl.textContent = "YOUR WORD";
        wordEl.textContent = priv.word || "—";
        hintEl.textContent = "จดจำคำศัพท์ของคุณ และให้คำใบ้โดยไม่พูดคำศัพท์ตรง ๆ";
      }
      return isImp;
    }

    function showPopup(priv) {
      if (!priv || !priv.role) return;
      const isImp = fillRoleCopy(priv, $p("popTitle"), $p("popWord"), $p("popHint"));
      popup.classList.toggle("is-imposter", isImp);
      overlay.classList.remove("hidden");
      popupOpen = true;
    }

    function paintYouProfile(state, priv) {
      const box = $("youProfile");
      if (!box) return;
      const youId = String((opts.youId && opts.youId()) || lastMeta.youId || "");
      const show = !!(priv && priv.role && youId);
      box.classList.toggle("hidden", !show);
      if (!show) {
        box.innerHTML = "";
        return;
      }
      const isImp = priv.role === "imposter";
      const meta = playerMeta(youId);
      const name = (state.names && state.names[youId]) || (meta && meta.name) || "คุณ";
      const needConfirm = state.phase === "ROLE_REVEAL" && !priv.confirmed;
      const secretLabel = isImp ? "บทบาท" : "คำศัพท์";
      const secretValue = isImp ? "Imposter" : priv.word || "—";
      const catRow =
        isImp && priv.category
          ? `<div class="imp-you-stat"><span class="label">หมวดหมู่</span><b>${esc(priv.category)}</b></div>`
          : "";
      box.classList.toggle("is-imposter", isImp);
      box.innerHTML = `
        <div class="imp-you-head">
          ${avatarHtml(meta, name, "imp-you-av")}
          <div class="imp-you-id">
            <p class="imp-you-kicker">${isImp ? "คุณคือ Imposter" : "ผู้เล่นปกติ"}</p>
            <h3>${esc(name)}</h3>
            <p class="sub">โปรไฟล์ของคุณ · คนอื่นมองไม่เห็นข้อมูลนี้</p>
          </div>
        </div>
        <div class="imp-you-stats">
          <div class="imp-you-stat${isImp ? " is-danger" : ""}">
            <span class="label">${secretLabel}</span>
            <b>${esc(secretValue)}</b>
          </div>
          ${catRow}
        </div>
        ${
          needConfirm
            ? `<button type="button" class="btn sm" data-imp="roleOk">เข้าใจแล้ว</button>`
            : ""
        }
      `;
      const ok = box.querySelector('[data-imp="roleOk"]');
      if (ok) ok.onclick = confirmRole;
    }

    function paintRoster(state) {
      const roster = $("roster");
      if (!roster) return;
      const aliveSet = new Set(state.alive || []);
      const youId = String((opts.youId && opts.youId()) || lastMeta.youId || "");
      const turnId =
        state.phase === "CARD_PICK"
          ? state.pickTurnId
          : state.phase === "CLUE_TURN"
            ? state.clueTurnId
            : null;
      roster.innerHTML = (state.order || [])
        .map((id) => {
          const sid = String(id);
          const meta = playerMeta(sid);
          const name = (state.names && state.names[sid]) || (meta && meta.name) || sid;
          const out = !aliveSet.has(sid);
          const mine = youId && sid === youId;
          const turn = turnId && sid === String(turnId);
          const cls =
            "imp-seat" +
            (out ? " is-out" : "") +
            (mine ? " is-you" : "") +
            (turn ? " is-turn" : "");
          let badge = "";
          if (state.phase === "FINISHED" && state.roles && state.roles[sid]) {
            badge =
              state.roles[sid] === "imposter"
                ? `<span class="imp-seat-badge is-imp">Imposter</span>`
                : `<span class="imp-seat-badge">ปกติ</span>`;
          } else if (out) {
            badge = `<span class="imp-seat-badge">ตกรอบ</span>`;
          } else if (turn) {
            badge = `<span class="imp-seat-badge is-turn">ตานี้</span>`;
          }
          return `
            <div class="${cls}" role="listitem">
              ${avatarHtml(meta, name, "imp-seat-av")}
              <div class="imp-seat-meta">
                <span class="imp-seat-name">${esc(name)}${mine ? " (คุณ)" : ""}</span>
                ${badge}
              </div>
            </div>`;
        })
        .join("");
    }

    function paintCards(state) {
      const grid = $("cardGrid");
      if (!grid) return;
      const show = state.phase === "CARD_PICK";
      grid.classList.toggle("hidden", !show);
      if (!show) {
        grid.innerHTML = "";
        return;
      }
      const canPick = !!state.canPickCard;
      grid.innerHTML = (state.cards || [])
        .map((c) => {
          const taken = !!c.taken;
          const cls = "imp-face-card" + (taken ? " is-taken" : canPick ? " is-pickable" : "");
          const label = taken ? esc(c.takenByName || "จั่วแล้ว") : "??";
          const disabled = taken || !canPick ? " disabled" : "";
          return `<button type="button" class="${cls}" data-card="${c.id}"${disabled} aria-label="${
            taken ? "การ์ดถูกจั่วแล้ว" : "จั่วการ์ด"
          }"><span class="imp-face-inner">${label}</span></button>`;
        })
        .join("");
      grid.querySelectorAll("[data-card]").forEach((btn) => {
        btn.onclick = () => {
          if (!canPick || btn.disabled) return;
          send({ t: "imposter:pickCard", cardId: Number(btn.getAttribute("data-card")) });
        };
      });
    }

    function paint(state, priv, meta) {
      lastPublic = state || null;
      if (priv) lastPrivate = priv;
      if (meta) {
        lastMeta = {
          players: Array.isArray(meta.players) ? meta.players : lastMeta.players || [],
          youId: meta.youId != null ? String(meta.youId) : lastMeta.youId || ""
        };
      }
      if (!state) return;

      $("phaseTitle").textContent =
        phaseLabel(state.phase) +
        " · รอบ " +
        (state.round || 1) +
        "/" +
        (state.maxRounds || 1);
      $("timer").textContent = state.phaseEndsAt ? formatLeft(state.phaseLeft) : "—";

      const turnName =
        state.phase === "CARD_PICK"
          ? state.pickTurnId && state.names
            ? state.names[state.pickTurnId] || "—"
            : ""
          : state.clueTurnId && state.names
            ? state.names[state.clueTurnId] || "—"
            : "";
      let sub = "";
      if (state.phase === "CARD_PICK")
        sub = state.canPickCard
          ? "ถึงตาคุณ — เลือกการ์ด 1 ใบ (ซ่อนไว้ ไม่รู้ว่าเป็น Imposter หรือคนปกติ)"
          : "รอ " + turnName + " จั่วการ์ด";
      else if (state.phase === "ROLE_REVEAL") sub = "ดูบทบาทของคุณด้านล่าง / หน้าต่างกลางจอ";
      else if (state.phase === "CLUE_TURN")
        sub = state.yourTurn ? "ถึงตาคุณให้คำใบ้" : "รอ " + turnName + " ให้คำใบ้";
      else if (state.phase === "DISCUSSION") sub = "คุยกันผ่านแชทในห้อง";
      else if (state.phase === "VOTING") sub = "เลือกผู้ต้องสงสัย (โหวตตัวเองไม่ได้)";
      else if (state.phase === "VOTE_RESULT") sub = "สรุปผลโหวต";
      else if (state.phase === "GUESS") sub = "Imposter ที่ถูกจับทายคำศัพท์";
      else if (state.phase === "FINISHED") sub = state.winReason || "";
      $("sub").textContent = sub;

      paintCards(state);
      paintYouProfile(state, lastPrivate);
      paintRoster(state);

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
          .map((t) => `<li><span>${esc(t.name)}</span><b>${t.count} โหวต</b></li>`)
          .join("");
      }

      const guessOn = state.phase === "GUESS" && state.canGuess;
      guessForm.classList.toggle("hidden", state.phase !== "GUESS");
      $("guessInput").disabled = !guessOn;
      guessForm.querySelector("button[type=submit]").disabled = !guessOn;

      if (
        state.phase === "ROLE_REVEAL" &&
        lastPrivate &&
        lastPrivate.role &&
        !lastPrivate.confirmed
      ) {
        if (!popupOpen || overlay.classList.contains("hidden")) showPopup(lastPrivate);
      } else {
        popupOpen = false;
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
