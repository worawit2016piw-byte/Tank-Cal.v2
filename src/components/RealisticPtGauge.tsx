import React from 'react';

export interface RealisticPtGaugeProps {
  ptValue: number | string | null;
  maxSpan?: number;
  className?: string;
  idPrefix?: string;
  showPill?: boolean;
}

export const RealisticPtGauge: React.FC<RealisticPtGaugeProps> = ({
  ptValue,
  maxSpan = 60,
  className = 'w-full h-auto drop-shadow-md select-none',
  idPrefix = 'ptg',
  showPill = true,
}) => {
  // Format numeric value
  let numericVal = 0;
  let displayPt = '0.00';

  if (ptValue !== null && ptValue !== undefined && ptValue !== '') {
    const parsed = typeof ptValue === 'number' ? ptValue : parseFloat(String(ptValue));
    if (!isNaN(parsed)) {
      numericVal = parsed;
      displayPt = parsed.toFixed(2);
    } else {
      displayPt = String(ptValue);
    }
  }

  // Calculate percentage for bargraph (0% - 100%)
  const percentage = Math.max(0, Math.min(100, (numericVal / maxSpan) * 100));
  const barWidth = Math.max(4, (percentage / 100) * 90);

  // ViewBox: if showPill, height is 420; otherwise 375
  const viewBox = showPill ? '0 0 320 422' : '0 0 320 375';

  return (
    <svg viewBox={viewBox} className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Metallic cast blue gradients matching image 1 */}
        <linearGradient id={`${idPrefix}_bodyBlue`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4592c8" />
          <stop offset="35%" stopColor="#2c77ab" />
          <stop offset="70%" stopColor="#1f5f8b" />
          <stop offset="100%" stopColor="#144263" />
        </linearGradient>

        <linearGradient id={`${idPrefix}_bezelBlue`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#256e9e" />
          <stop offset="50%" stopColor="#418ec2" />
          <stop offset="100%" stopColor="#194c70" />
        </linearGradient>

        <radialGradient id={`${idPrefix}_glassReflection`} cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
        </radialGradient>

        <linearGradient id={`${idPrefix}_lcdBacklight`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#dbeafe" />
          <stop offset="50%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#bfdbfe" />
        </linearGradient>

        {/* Circular text paths for embossed explosion-proof warning */}
        <path id={`${idPrefix}_topArc`} d="M 68 152 A 92 92 0 0 1 252 152" fill="none" />
        <path id={`${idPrefix}_bottomArc`} d="M 252 168 A 92 92 0 0 1 68 168" fill="none" />
      </defs>

      {/* Top Conduit Pipe Hubs (Left & Right) */}
      <rect
        x="15"
        y="42"
        width="60"
        height="32"
        rx="4"
        fill={`url(#${idPrefix}_bodyBlue)`}
        stroke="#164366"
        strokeWidth="2"
      />
      <rect
        x="245"
        y="42"
        width="60"
        height="32"
        rx="4"
        fill={`url(#${idPrefix}_bodyBlue)`}
        stroke="#164366"
        strokeWidth="2"
      />
      <circle cx="15" cy="58" r="8" fill="#112d44" stroke="#256e9e" strokeWidth="1.5" />
      <circle cx="305" cy="58" r="8" fill="#112d44" stroke="#256e9e" strokeWidth="1.5" />

      {/* Main Top Cast Bracket & Screws */}
      <path d="M 60 40 L 260 40 L 250 65 L 70 65 Z" fill="#205c87" stroke="#143b57" strokeWidth="1.5" />
      <circle cx="70" cy="48" r="4.5" fill="#cbd5e1" stroke="#475569" strokeWidth="1" />
      <circle cx="250" cy="48" r="4.5" fill="#cbd5e1" stroke="#475569" strokeWidth="1" />

      {/* Lower Neck Section */}
      <path
        d="M 125 240 L 195 240 L 190 310 L 130 310 Z"
        fill={`url(#${idPrefix}_bodyBlue)`}
        stroke="#164366"
        strokeWidth="2"
      />

      {/* Lower Mounting Flange with Process Holes */}
      <path
        d="M 105 310 C 105 295, 215 295, 215 310 C 225 320, 225 345, 215 355 C 205 365, 115 365, 105 355 C 95 345, 95 320, 105 310 Z"
        fill="#236894"
        stroke="#123a57"
        strokeWidth="2.5"
      />
      {/* Dual Bolt Holes */}
      <circle cx="125" cy="335" r="10" fill="#0f172a" stroke="#4592c8" strokeWidth="2" />
      <circle cx="195" cy="335" r="10" fill="#0f172a" stroke="#4592c8" strokeWidth="2" />

      {/* Main Circular Housing Body */}
      <circle
        cx="160"
        cy="160"
        r="115"
        fill={`url(#${idPrefix}_bodyBlue)`}
        stroke="#164366"
        strokeWidth="3"
      />

      {/* Outer Threaded Ridged Ring */}
      <circle cx="160" cy="160" r="104" fill="none" stroke="#509ed6" strokeWidth="2" opacity="0.6" />
      <circle
        cx="160"
        cy="160"
        r="101"
        fill={`url(#${idPrefix}_bezelBlue)`}
        stroke="#123a57"
        strokeWidth="2.5"
      />

      {/* Embossed Text in Circular Rim: "IN EXPLOSIVE ATMOSPHERE" & "KEEP TIGHT WHEN CIRCUIT ALIVE" */}
      <text fontSize="10.5" fontWeight="bold" fill="#0e2a3f" letterSpacing="1.2" opacity="0.95">
        <textPath href={`#${idPrefix}_topArc`} startOffset="50%" textAnchor="middle">
          ••• IN EXPLOSIVE ATMOSPHERE •••
        </textPath>
      </text>
      <text fontSize="10" fontWeight="bold" fill="#0e2a3f" letterSpacing="1.2" opacity="0.95">
        <textPath href={`#${idPrefix}_bottomArc`} startOffset="50%" textAnchor="middle">
          ••• KEEP TIGHT WHEN CIRCUIT ALIVE •••
        </textPath>
      </text>

      {/* Hex ground locking screw at 4 o'clock */}
      <g transform="translate(225, 225)">
        <circle cx="0" cy="0" r="9" fill="#1b4d70" stroke="#0f2b3f" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="6.5" fill="#e2e8f0" stroke="#64748b" strokeWidth="1" />
        <polygon points="-3,-1.5 0,-4 3,-1.5 3,2.5 0,4.5 -3,2.5" fill="#94a3b8" />
      </g>

      {/* Dark Inner Glass Bezel */}
      <circle cx="160" cy="160" r="74" fill="#1e293b" stroke="#0f172a" strokeWidth="4" />
      <circle cx="160" cy="160" r="72" fill="#0f172a" />

      {/* Recessed LCD Screen Window */}
      <rect
        x="104"
        y="112"
        width="112"
        height="96"
        rx="10"
        fill={`url(#${idPrefix}_lcdBacklight)`}
        stroke="#334155"
        strokeWidth="2"
      />

      {/* Inner shadow for recessed LCD depth */}
      <rect
        x="104"
        y="112"
        width="112"
        height="96"
        rx="10"
        fill="none"
        stroke="#94a3b8"
        strokeWidth="1.5"
        opacity="0.7"
      />

      {/* Top LCD Bargraph Scale */}
      {/* Bargraph background track */}
      <rect
        x="114"
        y="122"
        width="92"
        height="7"
        rx="3.5"
        fill="#cbd5e1"
        stroke="#94a3b8"
        strokeWidth="0.75"
      />
      {/* Bargraph tick marks */}
      <line x1="114" y1="119" x2="114" y2="121" stroke="#64748b" strokeWidth="1" />
      <line x1="137" y1="119" x2="137" y2="121" stroke="#64748b" strokeWidth="1" />
      <line x1="160" y1="119" x2="160" y2="121" stroke="#64748b" strokeWidth="1" />
      <line x1="183" y1="119" x2="183" y2="121" stroke="#64748b" strokeWidth="1" />
      <line x1="206" y1="119" x2="206" y2="121" stroke="#64748b" strokeWidth="1" />
      {/* Bargraph Active Fill Bar */}
      <rect
        x="115"
        y="123"
        width={barWidth}
        height="5"
        rx="2.5"
        fill="#1e3a8a"
      />
      {/* Triangle marker at start of bar */}
      <polygon points="112,125.5 116,123 116,128" fill="#1e3a8a" />

      {/* Ghost 7-Segment background "88.88" for authentic LCD look */}
      <text
        x="206"
        y="172"
        textAnchor="end"
        fontFamily="monospace"
        fontSize="30"
        fontWeight="bold"
        letterSpacing="-0.5"
        fill="#93c5fd"
        opacity="0.18"
      >
        88.88
      </text>

      {/* Active Large 7-Segment Value (e.g. 23.85) */}
      <text
        x="206"
        y="172"
        textAnchor="end"
        fontFamily="'JetBrains Mono', monospace"
        fontSize={displayPt.length > 5 ? '25' : '29'}
        fontWeight="bold"
        letterSpacing="-0.5"
        fill="#172554"
      >
        {displayPt}
      </text>

      {/* Unit: "Kg" in LCD Slanted Font */}
      <text
        x="204"
        y="196"
        textAnchor="end"
        fontFamily="'JetBrains Mono', monospace"
        fontSize="15"
        fontStyle="italic"
        fontWeight="bold"
        letterSpacing="0.5"
        fill="#1e3a8a"
      >
        Kg
      </text>

      {/* Glass Specular Reflection Highlight */}
      <circle
        cx="160"
        cy="160"
        r="72"
        fill={`url(#${idPrefix}_glassReflection)`}
        pointerEvents="none"
      />

      {/* Live reading callout pill badge: [~ PT Display: {displayPt} Kg] (Matching Image 1) */}
      {showPill && (
        <g transform="translate(160, 396)">
          <rect
            x="-106"
            y="-14"
            width="212"
            height="28"
            rx="14"
            fill="#061220"
            stroke="#0ea5e9"
            strokeWidth="2"
          />
          {/* Cyan pulse icon */}
          <path
            d="M -88 0 L -83 0 L -79 -6 L -75 6 L -71 -4 L -68 0 L -58 0"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text
            x="-50"
            y="4.5"
            fill="#38bdf8"
            fontSize="12.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            PT Display:
          </text>
          <text
            x="48"
            y="4.5"
            textAnchor="start"
            fill="#ffffff"
            fontSize="13"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {displayPt} Kg
          </text>
        </g>
      )}
    </svg>
  );
};
