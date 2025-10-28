(function () {
  const N = 5; // 5x5 grid
  let hideTimer = null;

  // Track which lines were complete on the previous check
  // IDs: r0..r4 (rows), c0..c4 (cols), d0,d1 (diagonals)
  let prevCompleted = new Set();

  function isChecked(btn) {
    return btn.classList.contains('checked');
  }

  function getButtons() {
    return Array.from(document.querySelectorAll('main button.cell'));
  }

  function getCompletedLines() {
    const btns = getButtons();
    const done = new Set();
    if (btns.length < N * N) return done;

    // rows & cols
    for (let r = 0; r < N; r++) {
      let rowAll = true;
      let colAll = true;
      for (let c = 0; c < N; c++) {
        rowAll &&= isChecked(btns[r * N + c]);
        colAll &&= isChecked(btns[c * N + r]);
      }
      if (rowAll) done.add(`r${r}`);
      if (colAll) done.add(`c${r}`);
    }

    // diagonals
    let d1 = true;
    let d2 = true;
    for (let i = 0; i < N; i++) {
      d1 &&= isChecked(btns[i * N + i]);
      d2 &&= isChecked(btns[i * N + (N - 1 - i)]);
    }
    if (d1) done.add('d0');
    if (d2) done.add('d1');

    return done;
  }

  function launchConfetti(mult) {
    if (typeof confetti !== 'function') return;

    const base = 180;
    const burst = Math.min(600, Math.floor(base * Math.max(1, mult)));
    const duration = 1500 * (1 + 0.5 * Math.max(0, mult - 1));
    const end = Date.now() + duration;

    (function frame() {
      const sideCount = Math.max(3, Math.floor(3 * Math.max(1, mult)));
      confetti({ particleCount: sideCount, angle: 60, spread: 60, origin: { x: 0 } });
      confetti({ particleCount: sideCount, angle: 120, spread: 60, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();

    confetti({ particleCount: burst, spread: 75, startVelocity: 45, origin: { y: 0.6 } });
  }

  function updateSmingoText(mult) {
    const textEl = document.getElementById('smingoText');
    if (!textEl) return;

    textEl.textContent = mult >= 2 ? `${mult}x SMINGO` : 'SMINGO';

    const scale = Math.min(2.2, 1 + 0.28 * (mult - 1));
    const spinDur = Math.max(0.75, 2.5 / (1 + 0.25 * (mult - 1)));
    const hueDur = Math.max(1.2, 6 / (1 + 0.2 * (mult - 1)));
    const twist = Math.min(28, 8 * (mult - 1));

    textEl.style.setProperty('--scale', String(scale));
    textEl.style.setProperty('--spinDur', `${spinDur.toFixed(2)}s`);
    textEl.style.setProperty('--hueDur', `${hueDur.toFixed(2)}s`);
    textEl.style.setProperty('--twist', `${twist}deg`);
  }

  function showSmingo(mult) {
    const overlay = document.getElementById('smingoOverlay');
    if (!overlay) return;

    updateSmingoText(mult);
    overlay.removeAttribute('hidden');

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideSmingo, 10000);

    launchConfetti(mult);
  }

  function hideSmingo() {
    const overlay = document.getElementById('smingoOverlay');
    if (!overlay) return;
    overlay.setAttribute('hidden', '');
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  // Click anywhere inside overlay hides it
  window.addEventListener('click', (e) => {
    const overlay = document.getElementById('smingoOverlay');
    if (!overlay || overlay.hasAttribute('hidden')) return;
    if (overlay.contains(e.target)) hideSmingo();
  });

  // Public: called after each click + on load via hyperscript
  window.checkBingo = function () {
    const current = getCompletedLines();

    // Lines that just transitioned from incomplete -> complete
    let added = 0;
    for (const id of current) {
      if (!prevCompleted.has(id)) added++;
    }

    if (added > 0) {
      // Multiplier = number of lines currently complete
      const multiplier = current.size;
      showSmingo(multiplier);
    }

    // If nothing is complete, hide overlay
    if (current.size === 0) hideSmingo();

    // Store snapshot for next comparison
    prevCompleted = new Set(current);
  };

  // Initial check (celebrates any existing lines on load)
  window.addEventListener('DOMContentLoaded', () => setTimeout(window.checkBingo, 0));
})();
