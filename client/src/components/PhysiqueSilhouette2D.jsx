import { useMemo } from "react";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mirrorX = (x, centerX) => centerX - (x - centerX);

const CENTER_X = 140;
const VIEWBOX_WIDTH = 280;
const VIEWBOX_HEIGHT = 430;

export default function PhysiqueSilhouette2D({ shape }) {
  const { points, torsoTrianglePath } = useMemo(() => {
    const fallback = {
      shoulderHalf: 46,
      hipHalf: 34,
      thighHalf: 27,
      calfHalf: 20,
      armWidth: 14,
      armHeight: 170,
      headRadius: 20,
      shoulderY: 104,
      chestY: 146,
      waistY: 220,
      hipY: 264,
      thighY: 320,
      calfY: 374,
      ankleY: 414,
      headCenterY: 58
    };
    const model = { ...fallback, ...(shape || {}) };

    const shoulderHalf = clamp(model.shoulderHalf, 30, 74);
    const hipHalf = clamp(model.hipHalf, 18, 56);
    const calfHalf = clamp(model.calfHalf, 12, 34);
    const armWidth = clamp(model.armWidth, 8, 24);
    const armHeight = clamp(model.armHeight, 146, 194);
    const headRadius = clamp(model.headRadius, 15, 28);

    const headCenterY = model.headCenterY;
    const headTopY = headCenterY - headRadius * 1.06;
    const chinY = headCenterY + headRadius * 0.98;
    const neckBaseY = chinY + headRadius * 0.28;

    const shoulderY = Math.max(model.shoulderY, neckBaseY + 2);
    const chestY = clamp(model.chestY, shoulderY + 18, shoulderY + 74);
    const waistY = clamp(model.waistY, chestY + 28, chestY + 116);
    const hipY = clamp(model.hipY, waistY + 22, waistY + 78);
    const thighY = clamp(model.thighY, hipY + 34, hipY + 95);
    const calfY = clamp(model.calfY, thighY + 24, thighY + 94);
    const ankleY = clamp(model.ankleY, calfY + 22, calfY + 74);
    const footY = ankleY + clamp(10 + calfHalf * 0.1, 10, 16);
    const pelvisY = hipY + (thighY - hipY) * 0.24;
    const ribY = chestY + (waistY - chestY) * 0.34;
    const thighMidY = hipY + (thighY - hipY) * 0.54;
    const calfMidY = thighY + (calfY - thighY) * 0.56;

    const shoulderX = CENTER_X + shoulderHalf * 0.9;
    const elbowX = Math.min(
      266,
      shoulderX + clamp(28 + shoulderHalf * 0.22 + armWidth * 0.62, 34, 64)
    );
    const wristX = Math.min(
      272,
      shoulderX + clamp(58 + shoulderHalf * 0.32 + armWidth * 0.9, 65, 102)
    );
    const handX = Math.min(276, wristX + clamp(8 + armWidth * 0.34, 8, 16));

    const elbowY = shoulderY;
    const wristY = shoulderY;
    const handY = shoulderY;

    const stanceAngleDeg = 45;
    const halfStanceRad = (stanceAngleDeg / 2) * (Math.PI / 180);
    const stanceSlope = Math.tan(halfStanceRad);
    const hipX = CENTER_X + hipHalf * 0.54 + 4;
    const kneeX = hipX + (thighY - hipY) * stanceSlope;
    const ankleX = hipX + (ankleY - hipY) * stanceSlope;
    const toeX = Math.min(
      272,
      ankleX + clamp(6 + calfHalf * 0.16, 7, 14)
    );

    const upperArmMidX = shoulderX + (elbowX - shoulderX) * 0.5;
    const forearmMidX = elbowX + (wristX - elbowX) * 0.5;
    const neckSideX = CENTER_X + headRadius * 0.32;
    const neckSideY = neckBaseY - headRadius * 0.06;
    const clavicleX = CENTER_X + shoulderHalf * 0.32;
    const clavicleY = shoulderY + (chestY - shoulderY) * 0.22;
    const pelvisSideX = CENTER_X + (hipX - CENTER_X) * 0.72;
    const pelvisSideY = pelvisY + (hipY - pelvisY) * 0.2;
    const groinX = CENTER_X + Math.max(6, hipHalf * 0.18);
    const groinY = hipY + (thighY - hipY) * 0.12;
    const heelX = Math.max(CENTER_X + 4, ankleX - clamp(4 + calfHalf * 0.1, 4, 8));
    const heelY = footY - clamp(2 + calfHalf * 0.06, 2, 4);
    const ballX = ankleX + clamp(2 + calfHalf * 0.12, 2, 7);
    const ballY = footY - 1;
    const fingerSpan = clamp(7.8 + armWidth * 0.22, 7.8, 13.2);
    const palmCenterX = handX - clamp(2.6 + armWidth * 0.11, 2.6, 5.8);
    const fingerBaseX = handX + clamp(0.8 + armWidth * 0.08, 0.8, 3.8);

    const pointsData = [];
    const pushPoint = (id, x, y, kind) => {
      pointsData.push({ id, x, y, kind });
    };
    const pushMirrorPoint = (id, x, y, kind) => {
      pushPoint(`${id}-r`, x, y, kind);
      pushPoint(`${id}-l`, mirrorX(x, CENTER_X), y, kind);
    };

    pushPoint("head-top", CENTER_X, headTopY, "major");
    pushPoint("head-center", CENTER_X, headCenterY, "major");
    pushPoint("chin", CENTER_X, chinY, "major");
    pushMirrorPoint("temple", CENTER_X + headRadius * 0.7, headCenterY - headRadius * 0.16, "minor");

    pushPoint("neck-base", CENTER_X, neckBaseY, "major");
    pushMirrorPoint("neck-side", neckSideX, neckSideY, "minor");
    pushMirrorPoint("clavicle", clavicleX, clavicleY, "minor");
    pushPoint("chest-center", CENTER_X, chestY, "major");
    pushPoint("rib-center", CENTER_X, ribY, "minor");
    pushPoint("waist-center", CENTER_X, waistY, "major");
    pushPoint("pelvis-center", CENTER_X, pelvisY, "major");
    pushMirrorPoint("pelvis-side", pelvisSideX, pelvisSideY, "minor");
    pushMirrorPoint("groin", groinX, groinY, "minor");

    pushMirrorPoint("shoulder", shoulderX, shoulderY, "major");
    pushMirrorPoint("upper-arm-mid", upperArmMidX, shoulderY, "minor");
    pushMirrorPoint("elbow", elbowX, elbowY, "major");
    pushMirrorPoint("forearm-mid", forearmMidX, wristY, "minor");
    pushMirrorPoint("wrist", wristX, wristY, "major");
    pushMirrorPoint("hand", handX, handY, "major");
    pushMirrorPoint("palm-center", palmCenterX, handY, "minor");
    pushMirrorPoint("palm-upper", palmCenterX, handY - fingerSpan * 0.36, "minor");
    pushMirrorPoint("palm-lower", palmCenterX, handY + fingerSpan * 0.36, "minor");

    const fingerSpecs = [
      { id: "thumb", yOffset: -fingerSpan * 0.96, length: clamp(8 + armWidth * 0.24, 8, 13), curl: -fingerSpan * 0.28 },
      { id: "index", yOffset: -fingerSpan * 0.48, length: clamp(11 + armWidth * 0.3, 11, 17), curl: -fingerSpan * 0.14 },
      { id: "middle", yOffset: 0, length: clamp(12.5 + armWidth * 0.34, 12.5, 19), curl: 0 },
      { id: "ring", yOffset: fingerSpan * 0.48, length: clamp(11.4 + armWidth * 0.3, 11.4, 17.4), curl: fingerSpan * 0.12 },
      { id: "pinky", yOffset: fingerSpan * 0.96, length: clamp(9 + armWidth * 0.24, 9, 14), curl: fingerSpan * 0.24 }
    ];

    fingerSpecs.forEach((finger) => {
      const mcpY = handY + finger.yOffset;
      const pipY = mcpY + finger.curl * 0.42;
      const dipY = mcpY + finger.curl * 0.7;
      const tipY = mcpY + finger.curl;
      const mcpX = fingerBaseX;
      const pipX = fingerBaseX + finger.length * 0.5;
      const dipX = fingerBaseX + finger.length * 0.78;
      const tipX = fingerBaseX + finger.length;

      pushMirrorPoint(`${finger.id}-mcp`, mcpX, mcpY, "minor");
      pushMirrorPoint(`${finger.id}-pip`, pipX, pipY, finger.id === "index" || finger.id === "middle" ? "major" : "minor");
      pushMirrorPoint(`${finger.id}-dip`, dipX, dipY, "minor");
      pushMirrorPoint(`${finger.id}-tip`, tipX, tipY, "major");
    });

    pushMirrorPoint("hip", hipX, hipY, "major");
    pushMirrorPoint("thigh-mid", kneeX + (hipX - kneeX) * 0.18, thighMidY, "minor");
    pushMirrorPoint("knee", kneeX, thighY, "major");
    pushMirrorPoint("calf-mid", ankleX + (kneeX - ankleX) * 0.26, calfMidY, "minor");
    pushMirrorPoint("ankle", ankleX, ankleY, "major");
    pushMirrorPoint("heel", heelX, heelY, "minor");
    pushMirrorPoint("foot-ball", ballX, ballY, "minor");
    pushMirrorPoint("toe", toeX, footY, "major");

    const leftShoulderX = mirrorX(shoulderX, CENTER_X);
    const trianglePoints = [
      { x: leftShoulderX, y: shoulderY },
      { x: shoulderX, y: shoulderY },
      { x: CENTER_X, y: pelvisY }
    ];

    const allX = pointsData.map((point) => point.x).concat(trianglePoints.map((point) => point.x));
    const allY = pointsData.map((point) => point.y).concat(trianglePoints.map((point) => point.y));

    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    const sourceWidth = Math.max(1, maxX - minX);
    const sourceHeight = Math.max(1, maxY - minY);

    const marginX = 3;
    const marginY = 4;
    const targetWidth = VIEWBOX_WIDTH - marginX * 2;
    const targetHeight = VIEWBOX_HEIGHT - marginY * 2;
    const scaleX = targetWidth / sourceWidth;
    const scaleY = targetHeight / sourceHeight;
    const offsetX = marginX - minX * scaleX;
    const offsetY = marginY - minY * scaleY;

    const pointsFitted = pointsData.map((point) => ({
      ...point,
      x: point.x * scaleX + offsetX,
      y: point.y * scaleY + offsetY
    }));
    const triangleFitted = trianglePoints.map((point) => ({
      x: point.x * scaleX + offsetX,
      y: point.y * scaleY + offsetY
    }));
    const torsoTrianglePath = `M ${triangleFitted[0].x} ${triangleFitted[0].y} L ${triangleFitted[1].x} ${triangleFitted[1].y} L ${triangleFitted[2].x} ${triangleFitted[2].y} Z`;

    return { points: pointsFitted, torsoTrianglePath };
  }, [shape]);

  return (
    <svg
      className="physique-2d-svg"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      role="presentation"
      aria-hidden="true"
    >
      <path
        className="physique-guide-triangle"
        d={torsoTrianglePath}
        fill="none"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <g className="physique-point-layer">
        {points.map((point) => (
          <circle
            key={point.id}
            className={`physique-point ${point.kind}`}
            cx={point.x}
            cy={point.y}
            r={point.kind === "major" ? 3.2 : 2.3}
          />
        ))}
      </g>
    </svg>
  );
}
