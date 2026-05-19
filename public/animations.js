(function exposeSpeedLabAnimations() {
  const DEFAULT_STEP_DURATION_MS = 12000;
  const MIN_STEP_DURATION_MS = 7000;
  const MAX_STEP_DURATION_MS = 25000;
  const FIRST_STEP_STALL_MULTIPLIER = 1.65;
  const SCORE_GEAR_BASE_ANGLE_DEG = 0;
  const SCORE_GEAR_TARGET_SPEED_DEG = 52;
  const SCORE_GEAR_ACCELERATION_MS = 720;
  const SCORE_GEAR_DECELERATION_MS = 1100;
  const SCORE_GEAR_STOP_EPSILON = 0.12;
  const SCORE_GEAR_MAX_FRAME_MS = 48;

  function createAnimationController({ clamp, isExecutionActive } = {}) {
    if (typeof clamp !== "function" || typeof isExecutionActive !== "function") {
      throw new Error("SpeedLab animations require clamp and isExecutionActive.");
    }

    let progressAnimationFrame = null;
    let scoreGearAnimationFrame = null;

    const progressAnimationStates = new Map();
    const scoreGearAnimationStates = new Map();

    function clearProgressAnimation() {
      if (progressAnimationFrame) {
        window.cancelAnimationFrame(progressAnimationFrame);
        progressAnimationFrame = null;
      }
    }

    function clearScoreGearAnimation() {
      if (scoreGearAnimationFrame) {
        window.cancelAnimationFrame(scoreGearAnimationFrame);
        scoreGearAnimationFrame = null;
      }
      scoreGearAnimationStates.clear();
    }

    function getRunCompletionTimestamps(runs) {
      return (runs || [])
        .map((run) => Date.parse(run.createdAt))
        .filter((value) => Number.isFinite(value) && value > 0);
    }

    function deriveStepDurationFromRuns(runs) {
      const timestamps = getRunCompletionTimestamps(runs);
      if (timestamps.length < 2) {
        return null;
      }

      let totalDelta = 0;
      let count = 0;

      for (let index = 1; index < timestamps.length; index += 1) {
        const delta = timestamps[index] - timestamps[index - 1];
        if (delta > 0) {
          totalDelta += delta;
          count += 1;
        }
      }

      if (!count) {
        return null;
      }

      return clamp(totalDelta / count, MIN_STEP_DURATION_MS, MAX_STEP_DURATION_MS);
    }

    function deriveActiveStepStartedAt(test, completed, runs) {
      const timestamps = getRunCompletionTimestamps(runs);
      const mainRunsCompleted = Math.max(0, completed - (test?.warmup ? 1 : 0));

      if (!mainRunsCompleted || !timestamps.length) {
        return Date.now();
      }

      return timestamps[Math.min(mainRunsCompleted, timestamps.length) - 1] || Date.now();
    }

    function createProgressAnimationState(test, progress, runs) {
      const total = Math.max(1, Number(progress?.total || 1));
      const completed = Math.max(0, Math.min(total, Number(progress?.current || 0)));
      const measuredStepDurationMs = deriveStepDurationFromRuns(runs);

      return {
        testId: test.id,
        total,
        serverCompleted: completed,
        stepStartedAt: deriveActiveStepStartedAt(test, completed, runs),
        lockedStepDurationMs: measuredStepDurationMs,
        status: test.status || ""
      };
    }

    function getFirstStepFill(elapsedMs, durationMs) {
      if (elapsedMs <= 0) {
        return 0;
      }

      const acceleratedDuration = durationMs * 0.35;
      const slowdownDuration = durationMs;
      const stallDuration = durationMs * FIRST_STEP_STALL_MULTIPLIER;

      if (elapsedMs <= acceleratedDuration) {
        return 0.5 * (elapsedMs / acceleratedDuration);
      }

      if (elapsedMs <= slowdownDuration) {
        const phaseProgress = (elapsedMs - acceleratedDuration) / Math.max(1, slowdownDuration - acceleratedDuration);
        return 0.5 + 0.4 * (1 - Math.pow(1 - phaseProgress, 2));
      }

      if (elapsedMs <= stallDuration) {
        const phaseProgress = (elapsedMs - slowdownDuration) / Math.max(1, stallDuration - slowdownDuration);
        return 0.9 + 0.05 * (1 - Math.pow(1 - phaseProgress, 3));
      }

      return 0.95;
    }

    function getMeasuredStepFill(elapsedMs, durationMs) {
      if (elapsedMs <= 0) {
        return 0;
      }

      return Math.min((elapsedMs / durationMs) * 0.99, 0.99);
    }

    function getActiveStepFill(state, now) {
      const elapsedMs = Math.max(0, now - state.stepStartedAt);

      if (state.lockedStepDurationMs == null) {
        return getFirstStepFill(elapsedMs, DEFAULT_STEP_DURATION_MS);
      }

      return getMeasuredStepFill(
        elapsedMs,
        clamp(state.lockedStepDurationMs, MIN_STEP_DURATION_MS, MAX_STEP_DURATION_MS)
      );
    }

    function createScoreGearAnimationState(testId, status) {
      return {
        testId,
        angle: SCORE_GEAR_BASE_ANGLE_DEG,
        velocity: 0,
        targetVelocity: isExecutionActive(status) ? SCORE_GEAR_TARGET_SPEED_DEG : 0,
        active: isExecutionActive(status),
        lastFrameAt: null
      };
    }

    function getScoreGearAnimationState(testId, status) {
      let state = scoreGearAnimationStates.get(testId);
      if (!state) {
        state = createScoreGearAnimationState(testId, status);
        scoreGearAnimationStates.set(testId, state);
      }

      state.active = isExecutionActive(status);
      state.targetVelocity = state.active ? SCORE_GEAR_TARGET_SPEED_DEG : 0;
      return state;
    }

    function paintScoreGear(testId) {
      const state = scoreGearAnimationStates.get(testId);
      if (!state) {
        return;
      }

      const gearNode = document.querySelector(`[data-score-hero][data-test-id="${testId}"] .score-hero-gear`);
      if (!gearNode) {
        return;
      }

      gearNode.style.transform = `rotate(${state.angle.toFixed(3)}deg)`;
    }

    function tickScoreGear(testId, frameNow) {
      const state = scoreGearAnimationStates.get(testId);
      if (!state) {
        return false;
      }

      if (state.lastFrameAt == null) {
        state.lastFrameAt = frameNow;
        paintScoreGear(testId);
        return state.active || Math.abs(state.velocity) > SCORE_GEAR_STOP_EPSILON;
      }

      const deltaMs = Math.min(
        SCORE_GEAR_MAX_FRAME_MS,
        Math.max(0, frameNow - state.lastFrameAt)
      );
      state.lastFrameAt = frameNow;

      const easingWindowMs = state.targetVelocity > state.velocity
        ? SCORE_GEAR_ACCELERATION_MS
        : SCORE_GEAR_DECELERATION_MS;
      const blend = deltaMs <= 0 ? 0 : 1 - Math.exp(-deltaMs / easingWindowMs);

      state.velocity += (state.targetVelocity - state.velocity) * blend;
      if (!state.active && Math.abs(state.velocity) < SCORE_GEAR_STOP_EPSILON) {
        state.velocity = 0;
      }

      state.angle += (state.velocity * deltaMs) / 1000;
      if (Math.abs(state.angle) > 360000) {
        state.angle %= 360;
      }

      paintScoreGear(testId);
      return state.active || Math.abs(state.velocity) > SCORE_GEAR_STOP_EPSILON;
    }

    function startScoreGearAnimation() {
      if (scoreGearAnimationFrame) {
        return;
      }

      const tick = (frameNow) => {
        let keepRunning = false;

        scoreGearAnimationStates.forEach((_, testId) => {
          if (tickScoreGear(testId, frameNow)) {
            keepRunning = true;
          }
        });

        if (!keepRunning) {
          scoreGearAnimationFrame = null;
          return;
        }

        scoreGearAnimationFrame = window.requestAnimationFrame(tick);
      };

      scoreGearAnimationFrame = window.requestAnimationFrame(tick);
    }

    function syncScoreGearAnimation(test) {
      if (!test || test.id == null) {
        return;
      }

      const state = getScoreGearAnimationState(test.id, test.status);
      paintScoreGear(test.id);

      if (state.active || Math.abs(state.velocity) > SCORE_GEAR_STOP_EPSILON) {
        startScoreGearAnimation();
      }
    }

    function getProgressVisualState(test, progress, runs) {
      const total = Math.max(1, Number(progress?.total || 1));
      const completed = Math.max(0, Math.min(total, Number(progress?.current || 0)));
      const active = isExecutionActive(test.status);
      const now = Date.now();

      let state = progressAnimationStates.get(test.id);
      if (!state || state.total !== total) {
        state = createProgressAnimationState(test, progress, runs);
        progressAnimationStates.set(test.id, state);
      }

      if (completed < state.serverCompleted) {
        state = createProgressAnimationState(test, progress, runs);
        progressAnimationStates.set(test.id, state);
      }

      if (completed > state.serverCompleted) {
        if (state.lockedStepDurationMs == null) {
          const observedDuration = now - state.stepStartedAt;
          const completedDelta = completed - state.serverCompleted;
          if (observedDuration > 0 && completedDelta > 0) {
            state.lockedStepDurationMs = clamp(
              observedDuration / completedDelta,
              MIN_STEP_DURATION_MS,
              MAX_STEP_DURATION_MS
            );
          }
        }

        state.serverCompleted = completed;
        state.stepStartedAt = now;
      }

      state.status = test.status || "";
      state.total = total;

      if (!active || completed >= total) {
        return {
          completed,
          total,
          activeFill: 0,
          totalFill: completed / total
        };
      }

      const activeFill = getActiveStepFill(state, now);
      return {
        completed,
        total,
        activeIndex: completed,
        activeFill,
        totalFill: (completed + activeFill) / total
      };
    }

    function splitProgressVisualState(test, progressVisual) {
      const includesWarmup = Boolean(test?.warmup)
        && progressVisual.total === Number(test?.runsRequested || 0) + 1;
      const mainTotal = Math.max(
        1,
        includesWarmup ? Number(test?.runsRequested || progressVisual.total - 1 || 1) : progressVisual.total
      );

      if (!includesWarmup) {
        return {
          includesWarmup,
          warmupCompleted: 0,
          warmupFill: 0,
          mainCompleted: progressVisual.completed,
          mainTotal,
          mainFill: progressVisual.totalFill
        };
      }

      const completed = Math.max(0, progressVisual.completed);
      const total = Math.max(1, progressVisual.total);
      const activeFill = clamp(Number(progressVisual.activeFill || 0), 0, 1);
      const mainCompleted = Math.max(0, Math.min(mainTotal, completed - 1));
      const warmupCompleted = completed > 0 ? 1 : 0;

      let warmupFill = warmupCompleted ? 1 : 0;
      let mainFill = completed >= total ? 1 : mainCompleted / mainTotal;

      if (progressVisual.activeIndex != null && completed < total) {
        if (completed === 0) {
          warmupFill = activeFill;
        } else {
          mainFill = (mainCompleted + activeFill) / mainTotal;
        }
      }

      return {
        includesWarmup,
        warmupCompleted,
        warmupFill: clamp(warmupFill, 0, 1),
        mainCompleted,
        mainTotal,
        mainFill: clamp(mainFill, 0, 1)
      };
    }

    function paintProgressBar(testId) {
      const track = document.querySelector(`[data-progress-track][data-test-id="${testId}"]`);
      const state = progressAnimationStates.get(testId);

      if (!track || !state) {
        return false;
      }

      const total = Math.max(1, Number(state.total || 1));
      const completed = Math.max(0, Math.min(total, Number(state.serverCompleted || 0)));
      const activeIndex = isExecutionActive(state.status) && completed < total ? completed : -1;
      const activeFill = activeIndex === -1 ? 0 : getActiveStepFill(state, Date.now());
      const includesWarmup = track.dataset.includesWarmup === "true";
      const mainTotal = Math.max(1, Number(track.dataset.mainTotal || total));
      const trackFillNode = track.querySelector("[data-progress-main-fill]");
      const warmupFillNode = document.querySelector(`[data-progress-warmup-fill][data-test-id="${testId}"]`);

      let mainFill = 0;
      let warmupFill = 0;

      if (!includesWarmup) {
        mainFill = activeIndex === -1
          ? completed / mainTotal
          : (completed + activeFill) / mainTotal;
      } else {
        const mainCompleted = Math.max(0, Math.min(mainTotal, completed - 1));
        warmupFill = completed > 0 ? 1 : 0;
        mainFill = completed >= total ? 1 : mainCompleted / mainTotal;

        if (activeIndex !== -1) {
          if (completed === 0) {
            warmupFill = activeFill;
          } else {
            mainFill = (mainCompleted + activeFill) / mainTotal;
          }
        }
      }

      if (trackFillNode) {
        trackFillNode.setAttribute("width", (1000 * clamp(mainFill, 0, 1)).toFixed(2));
      }
      if (warmupFillNode) {
        warmupFillNode.style.width = `${(clamp(warmupFill, 0, 1) * 100).toFixed(2)}%`;
      }

      return activeIndex !== -1;
    }

    function startProgressAnimation(testId) {
      clearProgressAnimation();

      const tick = () => {
        if (!paintProgressBar(testId)) {
          progressAnimationFrame = null;
          return;
        }

        progressAnimationFrame = window.requestAnimationFrame(tick);
      };

      progressAnimationFrame = window.requestAnimationFrame(tick);
    }

    return Object.freeze({
      clearProgressAnimation,
      clearScoreGearAnimation,
      getProgressVisualState,
      getScoreGearAnimationState,
      paintProgressBar,
      splitProgressVisualState,
      startProgressAnimation,
      syncScoreGearAnimation
    });
  }

  window.SpeedLabAnimations = Object.freeze({
    createAnimationController
  });
})();
