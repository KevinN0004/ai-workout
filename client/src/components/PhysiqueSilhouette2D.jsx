import { useMemo } from "react";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function PhysiqueSilhouette2D({ shape, activePart }) {
  const model = useMemo(() => {
    const fallback = {
      shoulderHalf: 46,
      chestHalf: 40,
      waistHalf: 28,
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
      headCenterY: 58,
      fillHue: 28,
      fillSaturation: 62,
      fillLightness: 58
    };
    return { ...fallback, ...(shape || {}) };
  }, [shape]);

  const centerX = 140;
  const shoulderHalf = clamp(model.shoulderHalf, 30, 74);
  const chestHalf = clamp(model.chestHalf, 24, 62);
  const waistHalf = clamp(model.waistHalf, 12, 52);
  const hipHalf = clamp(model.hipHalf, 18, 56);
  const thighHalf = clamp(model.thighHalf, 14, 46);
  const calfHalf = clamp(model.calfHalf, 12, 34);
  const armWidth = clamp(model.armWidth, 9, 24);
  const armHeight = clamp(model.armHeight, 144, 194);
  const headRadius = clamp(model.headRadius, 15, 28);

  const shoulderY = model.shoulderY;
  const chestY = model.chestY;
  const waistY = model.waistY;
  const hipY = model.hipY;
  const thighY = model.thighY;
  const calfY = model.calfY;
  const ankleY = model.ankleY;
  const headCenterY = model.headCenterY;

  const leftShoulderX = centerX - shoulderHalf;
  const rightShoulderX = centerX + shoulderHalf;
  const leftChestX = centerX - chestHalf;
  const rightChestX = centerX + chestHalf;
  const leftWaistX = centerX - waistHalf;
  const rightWaistX = centerX + waistHalf;
  const leftHipX = centerX - hipHalf;
  const rightHipX = centerX + hipHalf;
  const leftThighX = centerX - thighHalf;
  const rightThighX = centerX + thighHalf;
  const leftCalfX = centerX - calfHalf;
  const rightCalfX = centerX + calfHalf;
  const innerAnkleOffset = Math.max(8, calfHalf - 5);

  const upperOutlinePath = [
    `M ${leftShoulderX} ${shoulderY}`,
    `C ${leftChestX} ${chestY - 16}, ${leftChestX} ${chestY + 8}, ${leftChestX} ${chestY}`,
    `C ${leftWaistX} ${waistY - 28}, ${leftWaistX} ${waistY - 10}, ${leftWaistX} ${waistY}`,
    `C ${leftHipX} ${hipY - 20}, ${leftHipX} ${hipY - 6}, ${leftHipX} ${hipY}`,
    `M ${rightShoulderX} ${shoulderY}`,
    `C ${rightChestX} ${chestY - 16}, ${rightChestX} ${chestY + 8}, ${rightChestX} ${chestY}`,
    `C ${rightWaistX} ${waistY - 28}, ${rightWaistX} ${waistY - 10}, ${rightWaistX} ${waistY}`,
    `C ${rightHipX} ${hipY - 20}, ${rightHipX} ${hipY - 6}, ${rightHipX} ${hipY}`,
    `M ${leftShoulderX + 4} ${shoulderY + 1}`,
    `Q ${centerX} ${shoulderY - 34} ${rightShoulderX - 4} ${shoulderY + 1}`
  ].join(" ");

  const lowerOutlinePath = [
    `M ${leftHipX} ${hipY}`,
    `C ${leftThighX} ${thighY - 16}, ${leftThighX} ${thighY - 4}, ${leftThighX} ${thighY}`,
    `C ${leftCalfX} ${calfY - 18}, ${leftCalfX} ${calfY + 4}, ${leftCalfX} ${calfY}`,
    `L ${centerX - innerAnkleOffset} ${ankleY}`,
    `M ${rightHipX} ${hipY}`,
    `C ${rightThighX} ${thighY - 16}, ${rightThighX} ${thighY - 4}, ${rightThighX} ${thighY}`,
    `C ${rightCalfX} ${calfY - 18}, ${rightCalfX} ${calfY + 4}, ${rightCalfX} ${calfY}`,
    `L ${centerX + innerAnkleOffset} ${ankleY}`,
    `M ${centerX - 9} ${hipY + 10}`,
    `Q ${centerX} ${hipY + 24} ${centerX + 9} ${hipY + 10}`
  ].join(" ");

  const leftArmStartX = leftShoulderX - 3;
  const rightArmStartX = rightShoulderX + 3;
  const armStartY = shoulderY + 10;
  const armEndY = armStartY + armHeight * 0.86;

  const leftArmPath = [
    `M ${leftArmStartX} ${armStartY}`,
    `C ${leftArmStartX - armWidth * 1.05} ${armStartY + armHeight * 0.26}, ${leftArmStartX - armWidth * 0.9} ${armStartY + armHeight * 0.58}, ${leftArmStartX - armWidth * 0.48} ${armEndY}`
  ].join(" ");

  const rightArmPath = [
    `M ${rightArmStartX} ${armStartY}`,
    `C ${rightArmStartX + armWidth * 1.05} ${armStartY + armHeight * 0.26}, ${rightArmStartX + armWidth * 0.9} ${armStartY + armHeight * 0.58}, ${rightArmStartX + armWidth * 0.48} ${armEndY}`
  ].join(" ");

  const toneHue = Math.round(model.fillHue || 28);
  const toneSat = clamp(Math.round(model.fillSaturation || 62), 36, 90);
  const toneLight = clamp(Math.round(model.fillLightness || 58), 36, 78);

  const baseStroke = `hsl(${toneHue} ${toneSat}% ${clamp(toneLight - 10, 24, 70)}%)`;
  const activeStroke = `hsl(${toneHue + 7} ${clamp(toneSat + 10, 42, 96)}% ${clamp(toneLight + 14, 44, 88)}%)`;

  const partStyle = (part) => ({
    stroke: activePart === part ? activeStroke : baseStroke,
    opacity: activePart === part ? 1 : 0.74,
    strokeWidth: activePart === part ? 3.3 : 2.2
  });

  return (
    <svg
      className="physique-2d-svg"
      viewBox="0 0 280 430"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="physique-outline-glow" cx="50%" cy="34%" r="62%">
          <stop offset="0%" stopColor="rgba(255, 188, 132, 0.26)" />
          <stop offset="62%" stopColor="rgba(255, 188, 132, 0.08)" />
          <stop offset="100%" stopColor="rgba(255, 188, 132, 0)" />
        </radialGradient>
      </defs>

      <ellipse cx={centerX} cy={hipY - 56} rx={102} ry={142} fill="url(#physique-outline-glow)" />

      <g className="physique-outline-layer" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <ellipse
          className="physique-outline-part part-head"
          cx={centerX}
          cy={headCenterY}
          rx={headRadius}
          ry={headRadius * 1.06}
          style={partStyle("head")}
        />
        <path
          className="physique-outline-part part-left-arm"
          d={leftArmPath}
          style={partStyle("leftArm")}
        />
        <path
          className="physique-outline-part part-right-arm"
          d={rightArmPath}
          style={partStyle("rightArm")}
        />
        <path
          className="physique-outline-part part-upper"
          d={upperOutlinePath}
          style={partStyle("upper")}
        />
        <path
          className="physique-outline-part part-lower"
          d={lowerOutlinePath}
          style={partStyle("lower")}
        />
      </g>
    </svg>
  );
}
