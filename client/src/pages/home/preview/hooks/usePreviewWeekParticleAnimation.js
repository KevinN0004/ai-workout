/**
 * The preview week chapter's closing dissolve: the table breaks into particles
 * and chunks that drift up and fade, played as one animejs timeline, after
 * which the walkthrough moves on to the dashboard. Called by PreviewStage.
 */
import { createTimeline } from "animejs";
import { useCallback, useEffect } from "react";
import {
  PREVIEW_WEEK_PARTICLE_DENSITY_PX,
  PREVIEW_WEEK_PARTICLE_MIN_COUNT,
  PREVIEW_WEEK_PARTICLE_MAX_COUNT,
  PREVIEW_WEEK_PARTICLE_MAX_TOTAL,
  PREVIEW_WEEK_CHUNK_MAX_TOTAL,
  PREVIEW_WEEK_PARTICLE_MIN_SIZE_PX,
  PREVIEW_WEEK_PARTICLE_MAX_SIZE_PX,
  PREVIEW_WEEK_PARTICLE_MIN_DURATION_MS,
  PREVIEW_WEEK_PARTICLE_MAX_DURATION_MS,
  PREVIEW_WEEK_PARTICLE_ROW_DELAY_MS,
  PREVIEW_WEEK_PARTICLE_JITTER_MS,
  PREVIEW_WEEK_PARTICLE_TOTAL_DURATION_MS,
  PREVIEW_DASHBOARD_AUTO_ADVANCE_MS
} from "../constants";
import { clamp, randomBetween } from "../utils";

/**
 * Plays the dissolve when the week chapter reaches stage 6, unless the visitor
 * prefers reduced motion. It measures each th, td, p, li and h3 of the table
 * in `previewWeekTableWrapRef` with getBoundingClientRect, scatters particles
 * over each and chunks over each cell into `previewWeekParticleLayerRef`,
 * coloured from the element's computed style, and draws their positions,
 * sizes, drifts and timings from Math.random, mostly through randomBetween. The
 * dissolve runs down the table from the top. If it finds nothing to break up
 * it starts nothing, and the walkthrough does not move on by itself.
 *
 * On completion it sets stage 7, which leaves the dissolved table as it ended,
 * and, while the week is still the current chapter (`previewStepIndexRef`),
 * schedules the move to the dashboard on `previewFillTimeoutsRef`, the list
 * usePreviewChapterFlow clears on every chapter change. Leaving the chapter, or
 * a stage below 6, cancels the timeline, strips the inline styles it set and
 * empties the layer. Returns that clear function, for PreviewStage's unmount.
 */
export default function usePreviewWeekParticleAnimation({
  activePreviewChapterId,
  previewWeekStage,
  previewWeekTableWrapRef,
  previewWeekParticleLayerRef,
  previewWeekParticlePlayersRef,
  previewWeekParticleTargetsRef,
  previewFillTimeoutsRef,
  dashboardPreviewChapterIndex,
  workoutWeekChapterIndex,
  previewStepIndexRef,
  scrollToChapter,
  setPreviewWeekStage
}) {
  const clearPreviewWeekParticleAnimation = useCallback(() => {
    if (previewWeekParticlePlayersRef.current.length) {
      previewWeekParticlePlayersRef.current.forEach((player) => {
        player?.cancel?.();
      });
      previewWeekParticlePlayersRef.current = [];
    }

    if (previewWeekParticleTargetsRef.current.length) {
      previewWeekParticleTargetsRef.current.forEach((target) => {
        if (!target) return;
        target.style.opacity = "";
        target.style.transform = "";
        target.style.filter = "";
        target.style.clipPath = "";
        target.style.willChange = "";
        target.style.transformOrigin = "";
      });
      previewWeekParticleTargetsRef.current = [];
    }

    if (previewWeekParticleLayerRef.current) {
      previewWeekParticleLayerRef.current.replaceChildren();
    }
  }, [previewWeekParticleLayerRef, previewWeekParticlePlayersRef, previewWeekParticleTargetsRef]);

  useEffect(() => {
    // ---- Whether to play ----------------------------------------------------
    // Stage 7 is the completed dissolve, left as it ended.
    if (activePreviewChapterId !== "workout-week" || previewWeekStage < 6) {
      clearPreviewWeekParticleAnimation();
      return undefined;
    }
    if (previewWeekStage > 6) {
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      clearPreviewWeekParticleAnimation();
      return undefined;
    }

    const wrapEl = previewWeekTableWrapRef.current;
    const layerEl = previewWeekParticleLayerRef.current;
    const tableEl = wrapEl?.querySelector(".preview-week-table");
    if (!wrapEl || !layerEl || !tableEl) return undefined;

    clearPreviewWeekParticleAnimation();

    const wrapRect = wrapEl.getBoundingClientRect();
    if (!wrapRect.width || !wrapRect.height) return undefined;

    // ---- Measure the table ----------------------------------------------------
    // Every element with a size that overlaps the wrap, placed relative to it.
    // Its row and column progress, 0 at the top or left edge and 1 at the
    // other, are what stagger the dissolve.
    const contentEntries = Array.from(tableEl.querySelectorAll("th, td, p, li, h3"))
      .map((targetEl) => {
        const rect = targetEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        const relativeLeft = rect.left - wrapRect.left;
        const relativeTop = rect.top - wrapRect.top;
        if (relativeLeft > wrapRect.width || relativeTop > wrapRect.height) return null;
        if (relativeLeft + rect.width < 0 || relativeTop + rect.height < 0) return null;

        const centerX = relativeLeft + rect.width / 2;
        const centerY = relativeTop + rect.height / 2;
        const rowProgress = clamp(centerY / Math.max(wrapRect.height, 1), 0, 1);
        const colProgress = clamp(centerX / Math.max(wrapRect.width, 1), 0, 1);
        const targetStyle = window.getComputedStyle(targetEl);

        return {
          targetEl,
          rect,
          relativeLeft,
          relativeTop,
          rowProgress,
          colProgress,
          particleColor: targetStyle.color || "rgba(255, 255, 255, 0.9)"
        };
      })
      .filter(Boolean);
    const cellEntries = contentEntries.filter((entry) => entry.targetEl.matches("th, td"));
    const textEntries = contentEntries.filter((entry) => !entry.targetEl.matches("th, td"));
    const contentTargets = contentEntries.map((entry) => entry.targetEl);
    const cellTargets = cellEntries.map((entry) => entry.targetEl);
    const textTargets = textEntries.map((entry) => entry.targetEl);
    const sourceTargets = [tableEl, ...contentTargets];
    const particles = [];
    const particleMeta = [];
    const chunks = [];
    const chunkMeta = [];
    const cellMeta = [];
    const textMeta = [];
    const fragment = document.createDocumentFragment();

    // ---- Particles: over each element in its text colour, up to a cap ------
    contentEntries.forEach((entry) => {
      const { rect, relativeLeft, relativeTop, rowProgress, particleColor } = entry;
      // One per PREVIEW_WEEK_PARTICLE_DENSITY_PX of area, between the
      // per-element minimum and maximum, but never more than the table's total
      // has left.
      const particleCount = Math.min(
        PREVIEW_WEEK_PARTICLE_MAX_TOTAL - particles.length,
        clamp(
          Math.round((rect.width * rect.height) / PREVIEW_WEEK_PARTICLE_DENSITY_PX),
          PREVIEW_WEEK_PARTICLE_MIN_COUNT,
          PREVIEW_WEEK_PARTICLE_MAX_COUNT
        )
      );
      if (particleCount <= 0) return;

      // Each lands at a random point in the element, and its delay follows its
      // height within the element as well as the element's place down the
      // table, plus a random jitter.
      for (let index = 0; index < particleCount; index += 1) {
        const particleEl = document.createElement("span");
        particleEl.className = "preview-week-particle";

        const size = randomBetween(
          PREVIEW_WEEK_PARTICLE_MIN_SIZE_PX,
          PREVIEW_WEEK_PARTICLE_MAX_SIZE_PX
        );
        const particleX = relativeLeft + randomBetween(0, rect.width);
        const particleY = relativeTop + randomBetween(0, rect.height);
        const localRowProgress = clamp((particleY - relativeTop) / Math.max(rect.height, 1), 0, 1);
        const particleRowProgress = clamp(rowProgress + (localRowProgress - 0.5) * 0.09, 0, 1);

        particleEl.style.left = `${particleX.toFixed(2)}px`;
        particleEl.style.top = `${particleY.toFixed(2)}px`;
        particleEl.style.width = `${size.toFixed(2)}px`;
        particleEl.style.height = `${size.toFixed(2)}px`;
        particleEl.style.opacity = randomBetween(0.5, 1).toFixed(3);
        particleEl.style.backgroundColor = particleColor;
        particleEl.style.borderRadius = Math.random() > 0.75 ? "50%" : "1px";

        fragment.appendChild(particleEl);
        particles.push(particleEl);
        particleMeta.push({
          delay: Math.round(
            particleRowProgress * PREVIEW_WEEK_PARTICLE_ROW_DELAY_MS +
              randomBetween(0, PREVIEW_WEEK_PARTICLE_JITTER_MS)
          ),
          duration: Math.round(
            randomBetween(
              PREVIEW_WEEK_PARTICLE_MIN_DURATION_MS,
              PREVIEW_WEEK_PARTICLE_MAX_DURATION_MS
            )
          ),
          driftX: randomBetween(-72, 72),
          driftY: randomBetween(-188, -84),
          rotate: randomBetween(-110, 110),
          scale: randomBetween(0.42, 1.36)
        });
      }
    });

    // ---- Chunks: over each cell in its background colour, up to a cap -------
    cellEntries.forEach((entry) => {
      const { targetEl, rect, relativeLeft, relativeTop, rowProgress, colProgress } = entry;

      const targetStyle = window.getComputedStyle(targetEl);
      const chunkBaseColor =
        targetStyle.backgroundColor && targetStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
          ? targetStyle.backgroundColor
          : targetEl.tagName === "TH"
            ? "rgba(255, 255, 255, 0.13)"
            : "rgba(255, 255, 255, 0.08)";
      const chunkBorderColor = targetStyle.borderTopColor || "rgba(255, 255, 255, 0.16)";
      const chunkCount = Math.min(
        PREVIEW_WEEK_CHUNK_MAX_TOTAL - chunks.length,
        clamp(Math.round((rect.width * rect.height) / 2600), 4, 10)
      );
      if (chunkCount <= 0) return;
      const baseDelay = Math.round(
        rowProgress * PREVIEW_WEEK_PARTICLE_ROW_DELAY_MS + colProgress * 24
      );

      // The cell's own drift, clip and fade, staggered down the table and a
      // little across it. A cell past the chunk cap has returned above without
      // one, so the timeline's fallbacks, with no delay, apply to it.
      cellMeta.push({
        delay: baseDelay,
        duration: Math.round(randomBetween(1250, 1820)),
        driftX: randomBetween(-14, 14),
        driftY: randomBetween(-28, -12),
        rotate: randomBetween(-6, 6),
        scale: randomBetween(0.88, 0.98),
        clipTop: randomBetween(14, 42),
        clipBottom: randomBetween(30, 68),
        clipSide: randomBetween(4, 24)
      });

      // Pieces of the cell at random points inside it, about half of them
      // bordered, staggered like the particles.
      for (let index = 0; index < chunkCount; index += 1) {
        const chunkEl = document.createElement("span");
        chunkEl.className = "preview-week-chunk";

        const chunkWidth = randomBetween(6, Math.max(9, Math.min(22, rect.width * 0.34)));
        const chunkHeight = randomBetween(5, Math.max(8, Math.min(18, rect.height * 0.32)));
        const chunkX = relativeLeft + randomBetween(0, Math.max(rect.width - chunkWidth, 0));
        const chunkY = relativeTop + randomBetween(0, Math.max(rect.height - chunkHeight, 0));
        const chunkLocalProgress = clamp((chunkY - relativeTop) / Math.max(rect.height, 1), 0, 1);
        const chunkRowProgress = clamp(rowProgress + (chunkLocalProgress - 0.5) * 0.12, 0, 1);

        chunkEl.style.left = `${chunkX.toFixed(2)}px`;
        chunkEl.style.top = `${chunkY.toFixed(2)}px`;
        chunkEl.style.width = `${chunkWidth.toFixed(2)}px`;
        chunkEl.style.height = `${chunkHeight.toFixed(2)}px`;
        chunkEl.style.backgroundColor = chunkBaseColor;
        chunkEl.style.border = Math.random() > 0.48 ? `1px solid ${chunkBorderColor}` : "none";
        chunkEl.style.opacity = randomBetween(0.52, 0.9).toFixed(3);

        fragment.appendChild(chunkEl);
        chunks.push(chunkEl);
        chunkMeta.push({
          delay: Math.round(
            chunkRowProgress * PREVIEW_WEEK_PARTICLE_ROW_DELAY_MS +
              randomBetween(0, PREVIEW_WEEK_PARTICLE_JITTER_MS)
          ),
          duration: Math.round(randomBetween(1380, 2480)),
          driftX: randomBetween(-64, 64),
          driftY: randomBetween(-196, -86),
          rotate: randomBetween(-48, 48),
          scale: randomBetween(0.18, 1.18)
        });
      }
    });

    // ---- Text: each rises and fades, lower rows a little further ------------
    textEntries.forEach((entry) => {
      textMeta.push({
        delay: Math.round(
          entry.rowProgress * PREVIEW_WEEK_PARTICLE_ROW_DELAY_MS + entry.colProgress * 20
        ),
        rise: -16 - entry.rowProgress * 12
      });
    });

    if (!particles.length && !chunks.length) return undefined;

    // ---- Play -----------------------------------------------------------------
    // The elements the timeline styles are recorded first, so that a clear can
    // strip those styles again.
    layerEl.appendChild(fragment);
    previewWeekParticleTargetsRef.current = sourceTargets;
    tableEl.style.transformOrigin = "center top";
    cellTargets.forEach((target) => {
      target.style.transformOrigin = "center center";
      target.style.willChange = "transform, opacity, clip-path";
    });
    textTargets.forEach((target) => {
      target.style.willChange = "transform, opacity";
    });

    // Set on completion, so the cleanup before the re-run that stage 7 causes
    // keeps the dissolved frame instead of clearing it.
    let keepCompletionFrame = false;

    // The table rises and fades as a whole from a fixed offset; the cells, text,
    // chunks and particles are all placed at the start, each held back by its
    // own delay.
    const dissolveTimeline = createTimeline({
      defaults: { ease: "inOutSine" },
      onComplete: () => {
        keepCompletionFrame = true;
        setPreviewWeekStage((current) => (current < 7 ? 7 : current));
        if (
          dashboardPreviewChapterIndex >= 0 &&
          previewStepIndexRef.current === workoutWeekChapterIndex
        ) {
          const dashboardAdvanceTimeoutId = window.setTimeout(() => {
            scrollToChapter(dashboardPreviewChapterIndex);
          }, PREVIEW_DASHBOARD_AUTO_ADVANCE_MS);
          previewFillTimeoutsRef.current.push(dashboardAdvanceTimeoutId);
        }
      }
    })
      .add(
        tableEl,
        {
          translateY: [0, -46],
          opacity: [1, 0],
          duration: PREVIEW_WEEK_PARTICLE_TOTAL_DURATION_MS
        },
        Math.round(PREVIEW_WEEK_PARTICLE_ROW_DELAY_MS * 0.18)
      )
      .add(
        cellTargets,
        {
          opacity: [1, 0],
          translateY: (_, index) => cellMeta[index]?.driftY ?? -18,
          translateX: (_, index) => cellMeta[index]?.driftX ?? 0,
          rotate: (_, index) => cellMeta[index]?.rotate ?? 0,
          scale: (_, index) => cellMeta[index]?.scale ?? 0.95,
          clipPath: (_, index) =>
            `inset(${(cellMeta[index]?.clipTop ?? 26).toFixed(1)}% ${(cellMeta[index]?.clipSide ?? 12).toFixed(1)}% ${(cellMeta[index]?.clipBottom ?? 48).toFixed(1)}% ${(cellMeta[index]?.clipSide ?? 12).toFixed(1)}%)`,
          duration: (_, index) => cellMeta[index]?.duration ?? 1500,
          delay: (_, index) => cellMeta[index]?.delay ?? 0,
          ease: "outSine"
        },
        0
      )
      .add(
        textTargets,
        {
          opacity: [1, 0],
          translateY: (_, index) => textMeta[index]?.rise ?? -20,
          duration: PREVIEW_WEEK_PARTICLE_TOTAL_DURATION_MS - 680,
          delay: (_, index) => textMeta[index]?.delay ?? 0,
          ease: "inOutSine"
        },
        0
      )
      .add(
        chunks,
        {
          translateX: (_, index) => chunkMeta[index].driftX,
          translateY: (_, index) => chunkMeta[index].driftY,
          rotate: (_, index) => chunkMeta[index].rotate,
          scale: [1, (_, index) => chunkMeta[index].scale],
          opacity: [1, 0],
          delay: (_, index) => chunkMeta[index].delay,
          duration: (_, index) => chunkMeta[index].duration,
          ease: "outSine"
        },
        0
      )
      .add(
        particles,
        {
          translateX: (_, index) => particleMeta[index].driftX,
          translateY: (_, index) => particleMeta[index].driftY,
          rotate: (_, index) => particleMeta[index].rotate,
          scale: [1, (_, index) => particleMeta[index].scale],
          opacity: [1, 0],
          delay: (_, index) => particleMeta[index].delay,
          duration: (_, index) => particleMeta[index].duration,
          ease: "outSine"
        },
        0
      );

    previewWeekParticlePlayersRef.current = [dissolveTimeline];

    return () => {
      if (!keepCompletionFrame) {
        clearPreviewWeekParticleAnimation();
      }
    };
    // Keyed on the chapter and stage that drive this animation. Of the "missing"
    // deps, only scrollToChapter ever changes: PreviewStage makes a new one each
    // render, and re-running on it would cancel and restart the timeline
    // mid-animation. The copy captured here reads only refs, setters and the
    // fixed chapter list, so it acts as a newer one would. The rest are refs,
    // setState functions, the stable clear function and chapter indices that
    // never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePreviewChapterId, previewWeekStage]);

  return { clearPreviewWeekParticleAnimation };
}
